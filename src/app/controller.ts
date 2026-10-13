// MOD-App operation controller: every operation end to end with one busy / progress / cancel /
// undo contract (MOD-App "run(operation)"), the RULE-02 tiers and confirmation, notices shown
// once, and the worker ↔ editor wiring (architecture.md "Load" data flow).
import { formatCount, formatSize, hintFor, t, tCount } from '../copy';
import { isLargeTier, tierOf, type Issue, type Tier, type ValidationResult } from '../core';
import {
  createEditor,
  LARGE_PASTE,
  type EditorHandle,
  type LargePaste,
  type MirrorSync,
  type PendingDocument,
  type ReplaceFacts,
} from '../editor';
import { installDropTarget, pickFile, type DropKind } from '../io';
import { JobFailure, WorkerClient, type Job, type JobResult } from '../worker/client';
import type { FailReason } from '../worker/protocol';
import type { AppState, Bar, Busy, Validation } from './state';

/** Progress is shown once an operation has run this long (NFR-02). */
const PROGRESS_DELAY_MS = 500;
/** Main-thread slice when streaming text to the worker (architecture.md tunables). */
const SLICE_MS = 8;

const yieldMain = (): Promise<void> =>
  new Promise((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => {
      ch.port1.close();
      resolve();
    };
    ch.port2.postMessage(0);
  });

class Cancelled extends Error {}
/** The large-tier undo Blob itself could not be produced (review round 3). */
class SnapshotLost extends Error {}

function reasonOf(e: unknown): FailReason {
  if (e instanceof JobFailure) return e.reason;
  if (e instanceof RangeError) return 'too-large';
  return 'internal';
}

interface BusyHandle {
  progress: (fraction: number) => void;
  onCancel: (fn: () => void) => void;
}

/** Facts for a pending commit from a job's result (generalised for later result kinds). */
type FactsOf = (result: JobResult) => ReplaceFacts;
const loadedFacts: FactsOf = (r) => {
  if (r.type !== 'loaded') throw new JobFailure('internal', `unexpected ${r.type}`);
  return r.facts;
};

function stateOf(result: ValidationResult): Validation['state'] {
  return result.validity;
}

/** COPY-issue.location of an issue, with the locale's digit grouping. */
export function locationOf(issue: Pick<Issue, 'line' | 'column'>): string {
  return t('issue.location', { line: formatCount(issue.line), column: formatCount(issue.column) });
}

/** The validity text of CMP-StatusBar (F-005.R2). */
export function validityText(v: Validation): string {
  switch (v.state) {
    case 'empty':
      return t('status.empty');
    case 'checking':
      return t('status.checking');
    case 'invalid':
      return t('status.invalid');
    case 'valid': {
      const n = (v.result?.issues.length ?? 0) + (v.result?.warningOverflow ?? 0);
      return n ? tCount('status.valid_warnings', n) : t('status.valid');
    }
  }
}

export class AppController {
  editor: EditorHandle | null = null;
  readonly worker: WorkerClient;
  private tier: Tier = 'normal';
  private barSeq = 0;
  private trimmedNoticeShown = false;
  private removeDrop: (() => void) | null = null;
  /** Reasons the editor is read-only (a busy operation, a re-seed); D-005. */
  private locks = 0;
  private seeding: Promise<void> | null = null;
  private seedAgain = false;
  private progressFrame = 0;
  /** The last error and validity kind announced (SCR-Formatter: errors once per new error). */
  private announcedError = '';
  private announcedKind = 'empty';

  constructor(readonly state: AppState) {
    this.worker = new WorkerClient({ onRestart: () => void this.reseed() });
  }

  /** Mounts CMP-Editor in `host` and the drop target on the window. */
  attach(host: HTMLElement): void {
    if (this.editor) return;
    const editor = createEditor(host, {
      snapshot: () => this.worker.exportBlob(editor.version, '\n'),
      onChange: (e) => this.sync(e.sync, e.version, e.changes),
      onFacts: () => this.syncFacts(),
      onCursor: (line, column) => (this.state.cursor.value = { line, column }),
      onLargePaste: (p) => void this.largePaste(p),
      onHistoryKey: (direction) => void this.history(direction),
      onHistoryTrimmed: () => this.toldTrimmed(),
    });
    this.editor = editor;
    this.requestValidation();
    this.removeDrop = installDropTarget(window, {
      isInEditor: (e) => e.composedPath().includes(host),
      onDrop: (d) => this.drop(d),
      onOverlay: (on) => (this.state.dragging.value = on && !this.blocked()),
    });
    this.syncFacts();
  }

  detach(): void {
    this.removeDrop?.();
    this.editor?.destroy();
    this.editor = null;
    this.worker.dispose();
  }

  /** True while an operation runs, the mirror is re-seeded, or a confirmation is open (review m2). */
  blocked(): boolean {
    return !!this.state.busy.value || this.state.seeding.value || !!this.state.confirm.value;
  }

  private sync(how: MirrorSync, version: number, changes: { toJSON(): unknown }): void {
    if (how === 'edit') {
      this.worker.edit(version, changes.toJSON() as Parameters<WorkerClient['edit']>[1]);
      this.requestValidation();
    } else if (how === 'reseed') void this.reseed();
    // 'adopt': the operation that produced the text adopts its job, then asks for validation
  }

  // ---- validation (F-005) -------------------------------------------------------------------

  /**
   * Implements: F-005.R1, F-005.R7, INV-05 — after every change the document is re-validated in
   * the worker without blocking input; meanwhile the state is `checking` and the previous result
   * stays, marked out of date. Results for a version that is no longer shown are dropped.
   */
  requestValidation(): void {
    const ed = this.editor;
    if (!ed) return;
    const version = ed.version;
    if (ed.isEmpty) {
      // RULE-03 / F-005.AC9: zero characters is empty — no issue, nothing to compute.
      this.showValidation({ state: 'empty', result: null, version });
      return;
    }
    this.state.validation.value = { ...this.state.validation.value, state: 'checking', version };
    this.worker.validate(version, ed.lineEnding).then(
      ({ version: v, result }) => {
        if (this.editor?.version === v) this.showValidation({ state: stateOf(result), result, version: v });
      },
      () => undefined, // superseded or dropped (stale), or a restart, which re-seeds and asks again
    );
  }

  private showValidation(v: Validation): void {
    this.state.validation.value = v;
    const issues = v.result?.issues ?? [];
    this.editor?.setIssues(issues, v.state === 'invalid');
    this.announce(v);
  }

  /** SCR-Formatter accessibility: validity changes are announced politely; an error once. */
  private announce(v: Validation): void {
    const error = v.state === 'invalid' ? v.result?.issues[0] : undefined;
    if (error) {
      const key = `${error.code}@${error.line}:${error.column}`;
      if (key === this.announcedError && this.announcedKind === 'invalid') return;
      this.announcedError = key;
      this.announcedKind = 'invalid';
      this.state.announcement.value = [t('status.invalid'), locationOf(error), hintFor(error)].join('. ');
      return;
    }
    this.announcedError = '';
    if (v.state === this.announcedKind) return;
    this.announcedKind = v.state;
    this.state.announcement.value = validityText(v);
  }

  /** Implements: F-005.R5 — moves the cursor to an issue and scrolls it into view. */
  jumpTo(issue: Pick<Issue, 'pos'>): void {
    this.editor?.goTo(issue.pos);
  }

  // ---- facts, tiers, notices --------------------------------------------------------------

  private syncFacts(): void {
    const ed = this.editor;
    if (!ed) return;
    const bytes = ed.bytes;
    const tier = tierOf(bytes);
    this.state.doc.value = {
      empty: ed.isEmpty,
      bytes,
      lines: ed.lineCount,
      tier,
      lineEnding: ed.lineEnding,
      sourceName: ed.sourceName,
    };
    // Implements: RULE-02 / F-001.AC4 — told once on entering the large tiers.
    if (isLargeTier(tier) && !isLargeTier(this.tier))
      this.showBar({ kind: 'info', id: 'notice.large', text: t('notice.large', { size: formatSize(bytes) }) });
    this.tier = tier;
  }

  /** Implements: RULE-15 / F-001.AC12 — the user is told once. */
  private toldTrimmed(): void {
    if (this.trimmedNoticeShown) return;
    this.trimmedNoticeShown = true;
    this.showBar({ kind: 'info', id: 'notice.undo_trimmed', text: t('notice.undo_trimmed') });
  }

  showBar(bar: Omit<Bar, 'seq'>): void {
    this.state.bar.value = { ...bar, seq: ++this.barSeq };
  }

  dismissBar(): void {
    this.state.bar.value = null;
  }

  private showFailure(reason: FailReason, fileError: boolean): void {
    if (reason === 'cancelled') return;
    const bar = (id: 'error.encoding' | 'error.too_large' | 'error.unreadable' | 'error.failed') =>
      this.showBar({ kind: 'error', id, text: t(id), offerOpen: fileError && id !== 'error.failed' });
    // Implements: RULE-13 (encoding), F-001.R9 (allocation failure or a failed length check),
    // F-001 edge cases (unreadable file; any other internal failure → COPY-error.failed, INV-03).
    if (reason === 'encoding') bar('error.encoding');
    else if (reason === 'too-large') bar('error.too_large');
    else if (reason === 'unreadable') bar('error.unreadable');
    else bar('error.failed');
  }

  // ---- busy policy (D-005) ---------------------------------------------------------------

  private lock(): void {
    if (this.locks++ === 0) this.editor?.setBusy(true);
  }
  private unlock(): void {
    if (--this.locks === 0) this.editor?.setBusy(false);
  }

  /** Runs `op` with the busy policy: editor read-only, actions disabled, progress after 0.5 s. */
  private async run(
    label: Busy['label'],
    op: (busy: BusyHandle) => Promise<void>,
    onFailure: (e: unknown) => void = (e) => this.showFailure(reasonOf(e), label === 'progress.loading'),
  ): Promise<boolean> {
    if (this.blocked() || !this.editor) return false;
    const cancels: (() => void)[] = [];
    let cancelled = false;
    const busy: Busy = {
      label,
      fraction: 0,
      visible: false,
      cancel: () => {
        if (cancelled) return;
        cancelled = true;
        for (const fn of cancels) fn();
      },
    };
    this.state.busy.value = busy;
    this.state.dragging.value = false;
    this.lock();
    const timer = setTimeout(() => {
      if (this.state.busy.value === busy) this.state.busy.value = { ...busy, visible: true };
    }, PROGRESS_DELAY_MS);
    try {
      await op({
        progress: (f) => {
          busy.fraction = Math.max(busy.fraction, Math.min(0.99, f));
          // throttled to animation frames (platform-mapping)
          if (this.progressFrame) return;
          this.progressFrame = requestAnimationFrame(() => {
            this.progressFrame = 0;
            const cur = this.state.busy.value;
            if (cur && cur.cancel === busy.cancel && cur.visible)
              this.state.busy.value = { ...cur, fraction: busy.fraction };
          });
        },
        onCancel: (fn) => cancels.push(fn),
      });
      return true;
    } catch (e) {
      if (!cancelled && !(e instanceof Cancelled)) onFailure(e);
      return false;
    } finally {
      clearTimeout(timer);
      this.unlock();
      this.state.busy.value = null;
    }
  }

  cancel(): void {
    this.state.busy.value?.cancel();
  }

  /**
   * Streams a job's chunks into `pending`, commits it as one step and lets the worker adopt it.
   * Generalised: `factsOf` turns the job's result into the commit facts (loads today; format
   * results later).
   */
  private async feed(
    job: Job,
    pending: PendingDocument,
    busy: BusyHandle,
    factsOf: FactsOf = loadedFacts,
    extra: { sourceName?: string | null } = {},
  ): Promise<void> {
    let cancelled = false;
    busy.onCancel(() => {
      cancelled = true;
      job.cancel();
      pending.discard();
    });
    try {
      const facts = factsOf(await job.result);
      const version = await pending.commit({ ...facts, ...extra });
      this.worker.adopt(job.jobId, version);
      this.requestValidation();
    } catch (e) {
      pending.discard();
      job.cancel(); // releases the worker's pending mirror
      if (cancelled) throw new Cancelled();
      throw e;
    }
  }

  // ---- operations ---------------------------------------------------------------------------

  /** Appends a chunk; a failure (memory) cancels the job at once instead of breaking the stream. */
  private append(pending: PendingDocument, job: Job, text: string): void {
    try {
      pending.append(text);
    } catch {
      job.cancel(); // the commit then rethrows the latched failure
    }
  }

  /** Implements: RULE-02 / F-001.AC5, F-001.AC11 — confirmation before very large content. */
  private confirmVeryLarge(bytes: number): Promise<boolean> {
    return new Promise((resolve) => {
      this.state.confirm.value = {
        bytes,
        answer: (proceed) => {
          this.state.confirm.value = null;
          resolve(proceed);
        },
      };
    });
  }

  /** Implements: F-001.R2, F-001.R3, F-001.R4, F-001.R5, F-001.R8, F-001.R9; INV-03. */
  async loadFile(file: File): Promise<void> {
    if (this.blocked() || !this.editor) return;
    if (tierOf(file.size) === 'very-large' && !(await this.confirmVeryLarge(file.size))) return;
    const ed = this.editor;
    await this.run('progress.loading', async (busy) => {
      const pending = ed.beginReplace('load');
      const total = Math.max(1, file.size);
      const job = this.worker.run(
        { kind: 'loadFile', file },
        {
          onChunk: (text) => this.append(pending, job, text),
          onProgress: (f) => busy.progress(Math.min(f, pending.appended / total)),
        },
      );
      await this.feed(job, pending, busy, loadedFacts, { sourceName: file.name });
    });
  }

  async open(): Promise<void> {
    if (this.blocked()) return;
    const file = await pickFile();
    if (file) await this.loadFile(file);
  }

  drop(d: DropKind): void {
    if (this.blocked()) return; // also while the confirmation is open (security review MINOR-4)
    if (d.kind === 'not-a-file') {
      this.showBar({ kind: 'error', id: 'error.not_a_file', text: t('error.not_a_file'), offerOpen: true });
      return;
    }
    if (d.multiple) this.showBar({ kind: 'info', id: 'notice.multiple_files', text: t('notice.multiple_files') });
    void this.loadFile(d.file);
  }

  /** Implements: F-001.R6, F-001.R7 — one undo step. */
  clear(): void {
    if (this.blocked() || !this.editor || this.editor.isEmpty) return;
    this.editor.clear();
    this.editor.focus();
  }

  /** Implements: F-001.R4 large-paste path (ADR-0006 §2), F-001.AC11; also large external drops. */
  async largePaste(p: LargePaste): Promise<void> {
    if (this.blocked() || !this.editor) return;
    if (p.needsConfirm && !(await this.confirmVeryLarge(p.bytesAfter))) return;
    const ed = this.editor;
    await this.run('progress.inserting', async (busy) => {
      const pending = ed.beginPaste(p.from, p.to, p.eol);
      const job = this.worker.run({ kind: 'insertText', version: ed.version, from: p.from, to: p.to });
      let stop = false;
      busy.onCancel(() => (stop = true));
      const feeding = this.feed(job, pending, busy);
      // Review M6: stop streaming as soon as the job settled (failed, cancelled or done).
      feeding.then(
        () => (stop = true),
        () => (stop = true),
      );
      const text = p.text;
      let t0 = performance.now();
      try {
        for (let i = 0; i < text.length && !stop; i += LARGE_PASTE) {
          const part = text.slice(i, i + LARGE_PASTE);
          this.worker.sendText(job.jobId, part, i + LARGE_PASTE >= text.length);
          pending.append(part);
          busy.progress((i + part.length) / text.length);
          if (performance.now() - t0 > SLICE_MS) {
            await yieldMain();
            t0 = performance.now();
          }
        }
      } catch (e) {
        // Review round 3: an append failure (memory) cancels the worker job too, which releases
        // the streamed text; the document is unchanged (INV-03).
        job.cancel();
        pending.discard();
        feeding.catch(() => undefined);
        throw e;
      }
      if (!text.length) this.worker.sendText(job.jobId, '', true);
      await feeding;
    });
    this.editor?.focus();
  }

  /** Implements: F-001.R7, INV-04, RULE-15 — undo/redo; large-tier tool operations reload. */
  async history(direction: 'undo' | 'redo'): Promise<void> {
    if (this.blocked() || !this.editor) return;
    const step = direction === 'undo' ? this.editor.undo() : this.editor.redo();
    if (!step || step.kind === 'applied') return;
    let lost = false;
    const ok = await this.run(
      'progress.restoring',
      async (busy) => {
        let blob: Blob;
        try {
          blob = await step.snapshot.blob;
        } catch {
          throw new SnapshotLost();
        }
        const job = this.worker.run(
          { kind: 'loadBlob', blob },
          {
            onChunk: (text) => this.append(step.pending, job, text),
            onProgress: (f) => busy.progress(Math.min(f, step.pending.appended / Math.max(1, blob.size))),
          },
        );
        await this.feed(job, step.pending, busy);
      },
      (e) => {
        if (e instanceof SnapshotLost) lost = true;
        else this.showFailure(reasonOf(e), false);
      },
    );
    if (!ok) {
      if (lost) {
        // Review M2 / round 3: only a Blob that itself could not be made is dropped (with
        // everything older); the document is unchanged and the user is told older history is gone.
        step.drop();
        this.showBar({ kind: 'info', id: 'notice.undo_trimmed', text: t('notice.undo_trimmed') });
      } else {
        // Cancelled, or the restore failed (e.g. a worker restart): the entry stays undoable.
        step.abort();
      }
    }
    this.editor?.focus();
  }

  /**
   * ADR-0005 §4 / review M1: (re)builds the worker mirror from the editor in ≤ 8 ms slices.
   * Serialised: the editor is read-only and every operation is blocked meanwhile; the worker
   * defers edits, adopts and jobs until the seed ends; a restart during the seed starts it over.
   */
  reseed(): Promise<void> {
    if (this.seeding) {
      this.seedAgain = true;
      return this.seeding;
    }
    const ed = this.editor;
    if (!ed) return Promise.resolve();
    this.state.seeding.value = true;
    this.lock();
    this.seeding = (async () => {
      try {
        do {
          this.seedAgain = false;
          const generation = this.worker.restarts;
          const version = ed.version;
          this.worker.seed('begin', version);
          let t0 = performance.now();
          for (const text of ed.chunks()) {
            if (this.seedAgain || this.worker.restarts !== generation) break;
            this.worker.seed('chunk', version, text);
            if (performance.now() - t0 > SLICE_MS) {
              await yieldMain();
              t0 = performance.now();
            }
          }
          if (this.seedAgain || this.worker.restarts !== generation || ed.version !== version) {
            this.seedAgain = true;
            continue;
          }
          this.worker.seed('end', version);
        } while (this.seedAgain);
      } finally {
        this.seeding = null;
        this.state.seeding.value = false;
        this.unlock();
      }
      this.requestValidation();
    })();
    return this.seeding;
  }
}
