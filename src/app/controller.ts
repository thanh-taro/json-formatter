// MOD-App operation controller: every operation end to end with one busy / progress / cancel /
// undo contract (MOD-App "run(operation)"), the RULE-02 tiers and confirmation, notices shown
// once, and the worker ↔ editor wiring (architecture.md "Load" data flow).
import { formatSize, t } from '../copy';
import { isLargeTier, tierOf, type Tier } from '../core';
import { createEditor, LARGE_PASTE, type EditorHandle, type LargePaste, type PendingDocument } from '../editor';
import { installDropTarget, pickFile, type DropKind } from '../io';
import { JobFailure, WorkerClient, type Job } from '../worker/client';
import type { FailReason } from '../worker/protocol';
import type { AppState, Bar, Busy } from './state';

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

export class AppController {
  editor: EditorHandle | null = null;
  readonly worker: WorkerClient;
  private tier: Tier = 'normal';
  private barSeq = 0;
  private trimmedNoticeShown = false;
  private removeDrop: (() => void) | null = null;
  private reseeding = false;

  constructor(readonly state: AppState) {
    this.worker = new WorkerClient({ onRestart: () => void this.reseed() });
  }

  /** Mounts CMP-Editor in `host` and the drop target on the window. */
  attach(host: HTMLElement): void {
    if (this.editor) return;
    const editor = createEditor(host, {
      snapshot: () => this.worker.exportBlob(editor.version),
      onChange: (e) => {
        if (e.sync) this.worker.edit(e.version, e.changes.toJSON());
      },
      onFacts: () => this.syncFacts(),
      onCursor: (line, column) => (this.state.cursor.value = { line, column }),
      onLargePaste: (p) => void this.largePaste(p),
      onHistoryKey: (direction) => void this.history(direction),
      onHistoryTrimmed: () => {
        // Implements: RULE-15 / F-001.AC12 — the user is told once.
        if (this.trimmedNoticeShown) return;
        this.trimmedNoticeShown = true;
        this.showBar({ kind: 'info', id: 'notice.undo_trimmed', text: t('notice.undo_trimmed') });
      },
    });
    this.editor = editor;
    this.removeDrop = installDropTarget(window, {
      isInEditor: (e) => e.composedPath().includes(host),
      onDrop: (d) => this.drop(d),
      onOverlay: (on) => (this.state.dragging.value = on && !this.state.busy.value),
    });
    this.syncFacts();
  }

  detach(): void {
    this.removeDrop?.();
    this.editor?.destroy();
    this.editor = null;
    this.worker.dispose();
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

  showBar(bar: Omit<Bar, 'seq'>): void {
    this.state.bar.value = { ...bar, seq: ++this.barSeq };
  }

  dismissBar(): void {
    this.state.bar.value = null;
  }

  private showFailure(reason: FailReason | 'main-memory'): void {
    if (reason === 'cancelled') return;
    if (reason === 'encoding')
      this.showBar({ kind: 'error', id: 'error.encoding', text: t('error.encoding'), offerOpen: true });
    // Implements: F-001.R9 — allocation failure, or the worker died (platform-mapping: last resort).
    else this.showBar({ kind: 'error', id: 'error.too_large', text: t('error.too_large'), offerOpen: true });
  }

  // ---- busy policy (D-005) ---------------------------------------------------------------

  /** Runs `op` with the busy policy: editor read-only, actions disabled, progress after 0.5 s. */
  private async run(
    label: Busy['label'],
    op: (busy: { progress: (f: number) => void; onCancel: (fn: () => void) => void }) => Promise<void>,
  ) {
    if (this.state.busy.value) return;
    const ed = this.editor!;
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
    ed.setBusy(true);
    const timer = setTimeout(() => {
      if (this.state.busy.value === busy) this.state.busy.value = { ...busy, visible: true };
    }, PROGRESS_DELAY_MS);
    try {
      await op({
        progress: (f) => {
          busy.fraction = Math.max(busy.fraction, Math.min(0.99, f));
          const cur = this.state.busy.value;
          if (cur && cur.cancel === busy.cancel && cur.visible)
            this.state.busy.value = { ...cur, fraction: busy.fraction };
        },
        onCancel: (fn) => cancels.push(fn),
      });
    } catch (e) {
      if (!cancelled)
        this.showFailure(e instanceof JobFailure ? e.reason : e instanceof RangeError ? 'main-memory' : 'internal');
    } finally {
      clearTimeout(timer);
      ed.setBusy(false);
      this.state.busy.value = null;
    }
  }

  cancel(): void {
    this.state.busy.value?.cancel();
  }

  /** Streams a job's chunks into `pending`, commits it as one step and lets the worker adopt it. */
  private async feed(
    job: Job,
    pending: PendingDocument,
    busy: { onCancel: (fn: () => void) => void },
    extra: { sourceName?: string | null } = {},
  ): Promise<void> {
    let cancelled = false;
    busy.onCancel(() => {
      cancelled = true;
      job.cancel();
      pending.discard();
    });
    try {
      const result = await job.result;
      if (result.type !== 'loaded') throw new JobFailure('internal');
      const version = await pending.commit({ ...result.facts, ...extra });
      this.worker.adopt(job.jobId, version);
    } catch (e) {
      pending.discard();
      job.cancel(); // releases the worker's pending mirror
      if (cancelled) throw new Cancelled();
      throw e;
    }
  }

  // ---- operations ---------------------------------------------------------------------------

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
    if (this.state.busy.value || !this.editor) return;
    if (tierOf(file.size) === 'very-large' && !(await this.confirmVeryLarge(file.size))) return;
    const ed = this.editor;
    await this.run('progress.loading', async (busy) => {
      const pending = ed.beginReplace('load');
      let read = 0;
      const total = Math.max(1, file.size);
      const job = this.worker.run(
        { kind: 'loadFile', file },
        {
          onChunk: (text) => pending.append(text),
          onProgress: (f) => {
            read = f;
            busy.progress(Math.min(read, pending.appended / total));
          },
        },
      );
      await this.feed(job, pending, busy, { sourceName: file.name });
    });
  }

  async open(): Promise<void> {
    if (this.state.busy.value) return;
    const file = await pickFile();
    if (file) await this.loadFile(file);
  }

  drop(d: DropKind): void {
    if (this.state.busy.value) return;
    if (d.kind === 'not-a-file') {
      this.showBar({ kind: 'error', id: 'error.not_a_file', text: t('error.not_a_file'), offerOpen: true });
      return;
    }
    if (d.multiple) this.showBar({ kind: 'info', id: 'notice.multiple_files', text: t('notice.multiple_files') });
    void this.loadFile(d.file);
  }

  /** Implements: F-001.R6, F-001.R7 — one undo step. */
  clear(): void {
    if (this.state.busy.value || !this.editor || this.editor.isEmpty) return;
    this.editor.clear();
    this.editor.focus();
  }

  /** Implements: F-001.R4 large-paste path (ADR-0006 §2), F-001.AC11. */
  async largePaste(p: LargePaste): Promise<void> {
    if (this.state.busy.value || !this.editor) return;
    if (tierOf(p.bytesAfter) === 'very-large' && !(await this.confirmVeryLarge(p.bytesAfter))) return;
    const ed = this.editor;
    await this.run('progress.exporting', async (busy) => {
      const pending = ed.beginPaste(p.from, p.to, p.eol);
      const job = this.worker.run({ kind: 'insertText', version: ed.version, from: p.from, to: p.to });
      let stop = false;
      busy.onCancel(() => (stop = true));
      const feeding = this.feed(job, pending, busy);
      const text = p.text;
      let t0 = performance.now();
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
      if (!text.length) this.worker.sendText(job.jobId, '', true);
      await feeding;
    });
    this.editor?.focus();
  }

  /** Implements: F-001.R7, INV-04, RULE-15 — undo/redo; large-tier tool operations reload. */
  async history(direction: 'undo' | 'redo'): Promise<void> {
    if (this.state.busy.value || !this.editor) return;
    const step = direction === 'undo' ? this.editor.undo() : this.editor.redo();
    if (!step || step.kind === 'applied') return;
    await this.run('progress.exporting', async (busy) => {
      try {
        const blob = await step.snapshot.blob;
        const job = this.worker.run(
          { kind: 'loadBlob', blob },
          {
            onChunk: (text) => step.pending.append(text),
            onProgress: (f) => busy.progress(Math.min(f, step.pending.appended / Math.max(1, blob.size))),
          },
        );
        await this.feed(job, step.pending, busy);
      } catch (e) {
        step.abort();
        throw e;
      }
    });
    this.editor?.focus();
  }

  /** ADR-0005 §4: after a worker restart, re-seed its mirror from the editor in ≤ 8 ms slices. */
  private async reseed(): Promise<void> {
    const ed = this.editor;
    if (!ed || this.reseeding) return;
    this.reseeding = true;
    const wasBusy = !!this.state.busy.value;
    if (!wasBusy) ed.setBusy(true);
    try {
      const version = ed.version;
      this.worker.seed('begin', version);
      let t0 = performance.now();
      for (const text of ed.chunks()) {
        this.worker.seed('chunk', version, text);
        if (performance.now() - t0 > SLICE_MS) {
          await yieldMain();
          t0 = performance.now();
        }
      }
      this.worker.seed('end', version);
    } finally {
      this.reseeding = false;
      if (!wasBusy && !this.state.busy.value) ed.setBusy(false);
    }
  }
}
