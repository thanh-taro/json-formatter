// MOD-App operation controller: every operation end to end with one busy / progress / cancel /
// undo contract (MOD-App "run(operation)"), the RULE-02 tiers and confirmation, notices shown
// once, and the worker ↔ editor wiring (architecture.md "Load" data flow).
import { formatCount, formatSize, hintFor, t, tCount } from '../copy';
import {
  beautifiedBytes,
  indentStyle,
  isLargeTier,
  tierOf,
  type FormatMode,
  type IndentStyle,
  type Issue,
  type LineEnding,
  type Tier,
  type ValidationResult,
} from '../core';
import {
  createEditor,
  LARGE_PASTE,
  type EditorHandle,
  type LargePaste,
  type MirrorSync,
  type PendingDocument,
  type ReplaceFacts,
} from '../editor';
import { copyBlob, download, downloadName, installDropTarget, pickFile, type CopyOutcome, type DropKind } from '../io';
import type { TreeDeps } from '../tree';
import { JobFailure, WorkerClient, type Job, type JobResult } from '../worker/client';
import type { FailReason } from '../worker/protocol';
import { needsVeryLargeConfirm } from './confirm';
import { FindController } from './find';
import type { AppState, Bar, Busy, Toast, Validation } from './state';

/** Progress is shown once an operation has run this long (NFR-02). */
const PROGRESS_DELAY_MS = 500;
/** Normal tier: "checking" is shown only when a result takes longer than this (no flicker). */
const CHECKING_DELAY_MS = 300;
/** CMP-Notice: a toast disappears after 2 s; at most 2 are stacked. */
const TOAST_MS = 2000;
const TOAST_MAX = 2;
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
const formattedFacts: FactsOf = (r) => {
  if (r.type !== 'formatted') throw new JobFailure('internal', `unexpected ${r.type}`);
  return r.facts;
};

/**
 * A worker-built text has '\n' breaks only; the document keeps its line ending (F-004.R2,
 * RULE-17), so the commit facts count its breaks as that ending.
 */
function keepLineEnding(facts: ReplaceFacts, eol: LineEnding): ReplaceFacts {
  const n = facts.breaks.lf + facts.breaks.crlf + facts.breaks.cr;
  return { ...facts, breaks: eol === 'crlf' ? { lf: 0, crlf: n, cr: 0 } : { lf: n, crlf: 0, cr: 0 } };
}

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
  /** CMP-SearchPanel state (F-010). */
  readonly find = new FindController(
    () => this.editor,
    () => this.showTextView(),
  );
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
  private checkingTimer: ReturnType<typeof setTimeout> | undefined;

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
      onFindKey: () => this.find.show(),
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
    this.find.dispose();
    this.editor?.destroy();
    this.editor = null;
    this.worker.dispose();
  }

  /**
   * Implements: F-006.R1 — shows the text view (F-010 edge case: find opens in the text view);
   * the editor keeps its state while hidden (ADR-0004).
   */
  showTextView(): void {
    this.state.view.value = 'text';
    this.editor?.setHidden(false);
  }

  /** True while an operation runs, the mirror is re-seeded, or a confirmation is open (review m2). */
  blocked(): boolean {
    return !!this.state.busy.value || this.state.seeding.value || !!this.state.confirm.value;
  }

  private sync(how: MirrorSync, version: number, changes: { toJSON(): unknown }): void {
    if (how === 'edit') {
      this.clearOutcome();
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
   * In the normal tier, where results arrive within milliseconds, `checking` is shown only once
   * the wait exceeds CHECKING_DELAY_MS (no flicker per keystroke); in the large tiers at once.
   */
  requestValidation(retry = true): void {
    const ed = this.editor;
    if (!ed) return;
    const version = ed.version;
    clearTimeout(this.checkingTimer);
    if (ed.isEmpty) {
      // RULE-03 / F-005.AC9: zero characters is empty — no issue, nothing to compute.
      this.showValidation({ state: 'empty', result: null, version });
      return;
    }
    const large = isLargeTier(tierOf(ed.bytes));
    const prev = this.state.validation.value;
    if (large || !prev.result) this.state.validation.value = { ...prev, state: 'checking', version };
    else
      this.checkingTimer = setTimeout(() => {
        const cur = this.state.validation.value;
        if (this.editor?.version === version && cur.version !== version)
          this.state.validation.value = { ...cur, state: 'checking', version };
      }, CHECKING_DELAY_MS);
    const restarts = this.worker.restarts;
    this.state.checkProgress.value = 0;
    // ADR-0007 §1: the skip table is built in the large tiers (RULE-02 bytes).
    this.worker
      .validate(version, ed.lineEnding, large, {
        onProgress: (f) => {
          if (this.editor?.version === version) this.state.checkProgress.value = f;
        },
      })
      .then(
        ({ version: v, result }) => {
          if (this.editor?.version !== v) return;
          clearTimeout(this.checkingTimer);
          this.showValidation({ state: stateOf(result), result, version: v });
        },
        (e: unknown) => {
          // Superseded or stale: a newer request owns the state. A restart re-seeds and asks again.
          if (reasonOf(e) === 'cancelled' || this.worker.restarts !== restarts || this.editor?.version !== version)
            return;
          // Review F-005 m1 / round 3 (INV-05): any other failure is retried once, then reported
          // with COPY-error.failed. The state stays "checking" with the previous result marked
          // out of date — it never describes the current text — until the next change validates.
          if (retry) return this.requestValidation(false);
          clearTimeout(this.checkingTimer);
          this.state.validation.value = { ...this.state.validation.value, state: 'checking', version };
          this.showFailure(reasonOf(e), false);
        },
      );
  }

  private showValidation(v: Validation): void {
    const error = v.state === 'invalid' ? v.result?.issues[0] : undefined;
    // Same error as before (its marked position followed the edits)? Then it is not new.
    const prevPos = this.announcedKind === 'invalid' ? this.editor?.issuePosition(0) : null;
    const sameError = !!error && error.code === this.announcedError && prevPos === error.pos;
    this.state.validation.value = v;
    this.editor?.setIssues(v.result?.issues ?? [], v.state === 'invalid');
    this.announce(v, sameError);
  }

  /** SCR-Formatter accessibility: validity changes are announced politely; each new error once. */
  private announce(v: Validation, sameError: boolean): void {
    const error = v.state === 'invalid' ? v.result?.issues[0] : undefined;
    if (error) {
      if (sameError) return;
      this.announcedError = error.code;
      this.announcedKind = 'invalid';
      this.state.announcement.value = [t('status.invalid'), locationOf(error), hintFor(error)].join('. ');
      return;
    }
    this.announcedError = '';
    if (v.state === this.announcedKind) return;
    this.announcedKind = v.state;
    this.state.announcement.value = validityText(v);
  }

  /**
   * Implements: F-005.R5 — moves the cursor to issue `index` of the shown result and scrolls it
   * into view; while re-checking, the position follows the edits made since (review F-005 m3).
   */
  jumpTo(index: number): void {
    const ed = this.editor;
    const issue = this.state.validation.value.result?.issues[index];
    if (!ed || !issue) return;
    ed.goTo(ed.issuePosition(index) ?? issue.pos);
    // F-002.R4 "shown and focused"; QA-020 (a11y m5): keyboard and screen-reader users land on it.
    ed.focus();
  }

  // ---- facts, tiers, notices --------------------------------------------------------------

  private syncFacts(): void {
    const ed = this.editor;
    if (!ed) return;
    const bytes = ed.bytes;
    const tier = tierOf(bytes);
    this.state.version.value = ed.version;
    // CMP-Toolbar "empty document": the view switch is off and the text view (empty variant) shows.
    if (ed.isEmpty && this.state.view.value === 'tree') this.showTextView();
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

  /**
   * Implements: CMP-Notice "Behavior" (D-032) — an outcome bar (COPY-notice.no_indent,
   * COPY-notice.multiple_files, any error) goes when the next tool action starts or the document
   * changes; the document's own notices (COPY-notice.large, COPY-notice.undo_trimmed) stay.
   */
  private clearOutcome(): void {
    const id = this.state.bar.value?.id;
    if (id && id !== 'notice.large' && id !== 'notice.undo_trimmed') this.dismissBar();
  }

  /** CMP-Notice toast: newest last, at most TOAST_MAX, each removed after TOAST_MS. */
  showToast(toast: Omit<Toast, 'seq'>): void {
    const shown: Toast = { ...toast, seq: ++this.barSeq };
    this.state.toasts.value = [...this.state.toasts.value, shown].slice(-TOAST_MAX);
    setTimeout(() => (this.state.toasts.value = this.state.toasts.value.filter((t) => t !== shown)), TOAST_MS);
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
    this.clearOutcome();
    const file = await pickFile();
    if (file) await this.loadFile(file);
  }

  drop(d: DropKind): void {
    if (this.blocked()) return; // also while the confirmation is open (security review MINOR-4)
    this.clearOutcome();
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

  /**
   * Implements: F-004.R1–R7 — re-indents the document to the indent selector's style (RULE-09)
   * in the worker: a detection pass, then (after the RULE-02 confirmation when the result would
   * exceed 100 MB) a conversion committed as one undo step (INV-04, RULE-15). Busy policy
   * (D-005) with COPY-progress.formatting and cancel; cancel or failure leaves the document
   * unchanged (INV-03). Nothing indented → unchanged with COPY-notice.no_indent (F-004.R5).
   */
  async reindent(): Promise<void> {
    if (this.blocked() || !this.editor || this.editor.isEmpty) return;
    this.clearOutcome();
    const ed = this.editor;
    // RULE-01: an invalid width (NaN, < 1, > 8, fractional) never reaches the re-indenter.
    const target = indentStyle(this.state.indent.value);
    const version = ed.version;
    const eol = ed.lineEnding;
    const sourceName = ed.sourceName;
    // Review m-1: both passes (and the confirmation between them) run as one busy operation,
    // so the progress bar and cancel stay continuous.
    await this.run('progress.formatting', async (busy) => {
      // Pass 1: detection (the first quarter of the progress bar).
      const planJob = this.worker.run(
        { kind: 'reindentPlan', version, target },
        { onProgress: (f) => busy.progress(f / 4) },
      );
      busy.onCancel(() => planJob.cancel());
      const r = await planJob.result;
      if (r.type === 'notIndented') {
        this.showBar({ kind: 'info', id: 'notice.no_indent', text: t('notice.no_indent') });
        return;
      }
      if (r.type !== 'reindentPlan') throw new JobFailure('internal', `unexpected ${r.type}`);
      // Review m-6: an identical result changes nothing and takes no undo step.
      if (r.unchanged) return;
      // Implements: F-004.R7 / RULE-02 — a result over 100 MB is confirmed first, unless the
      // document already is over 100 MB (shared decision, ./confirm).
      const bytesAfter = ed.bytes + r.delta;
      if (needsVeryLargeConfirm(ed.bytes, bytesAfter)) {
        const asking = this.confirmVeryLarge(bytesAfter);
        busy.onCancel(() => this.state.confirm.value?.answer(false));
        if (!(await asking)) throw new Cancelled();
      }
      if (this.editor !== ed || ed.version !== version) throw new Cancelled();
      // Pass 2: conversion into a pending document, committed as one undo step.
      const pending = ed.beginReplace('reindent');
      const total = Math.max(1, bytesAfter);
      const job = this.worker.run(
        { kind: 'reindent', version, target, unit: r.unit },
        {
          onChunk: (text) => this.append(pending, job, text),
          onProgress: (f) => busy.progress(0.25 + 0.75 * Math.min(f, pending.appended / total)),
        },
      );
      await this.feed(job, pending, busy, (res) => keepLineEnding(loadedFacts(res), eol), { sourceName });
    });
  }

  // ---- beautify / minify (F-002, F-003) ----------------------------------------------------

  /** Implements: RULE-01 / F-002.R2 — the indent selector (2 or 4 spaces, tab, custom 1–8). */
  setIndent(style: IndentStyle): void {
    // RULE-01 (F-004 review MJ-1): an invalid width (NaN, < 1, > 8, fractional) is never stored.
    this.state.indent.value = indentStyle(style);
  }

  /**
   * Implements: F-002.R1–R7, F-003.R1–R5; INV-03, INV-04, RULE-02 — beautifies or
   * minifies the whole document in the worker. The validation of the current text decides first:
   * an invalid document stays unchanged and its first error is shown and focused; a beautify
   * whose result (predicted from that validation) would exceed 100 MB is confirmed first. The
   * result streams into a pending document, committed as one undo step (Blob snapshot in the
   * large tiers, ADR-0006); cancel or failure leaves the document as it was. Busy policy D-005
   * throughout: read-only editor, actions ignored (D-031), progress after 0.5 s, cancel.
   */
  async format(kind: 'beautify' | 'minify'): Promise<void> {
    const ed = this.editor;
    if (this.blocked() || !ed || ed.isEmpty) return;
    this.clearOutcome();
    const version = ed.version;
    let result = await this.validationOf(version);
    if (!result || this.editor !== ed || ed.version !== version) return;
    if (result.validity !== 'valid') {
      // F-002.R4 / F-003.R3 / INV-03: unchanged; the first error is shown (issue panel) and focused.
      this.jumpTo(0);
      return;
    }
    const mode: FormatMode = kind === 'beautify' ? { kind, indent: this.state.indent.value } : { kind };
    const lineEnding = ed.lineEnding;
    const nonBreakBytes = ed.bytes - (ed.lineCount - 1) * (lineEnding === 'crlf' ? 2 : 1);
    if (mode.kind === 'beautify') {
      // A result without layout facts cannot be sized: validate again (the worker's pass has them).
      if (!result.layout) result = await this.validationOf(version, true);
      if (!result || this.editor !== ed || ed.version !== version) return;
      // Implements: RULE-02 / F-002.R7 / F-002.AC10 — confirm a result over 100 MB (unless the
      // document already is); declining keeps the document. Unknown size: ask (current size).
      const bytes = result.layout
        ? beautifiedBytes(result.layout, nonBreakBytes, mode.indent, lineEnding)
        : Math.max(ed.bytes, 100_000_001);
      if (needsVeryLargeConfirm(ed.bytes, bytes) && !(await this.confirmVeryLarge(result.layout ? bytes : ed.bytes)))
        return;
      if (this.editor !== ed || ed.version !== version) return;
    }
    await this.run('progress.formatting', async (busy) => {
      // RULE-10: committed as tool operation `kind` (the editor records the most recent one).
      const pending = ed.beginReplace(kind);
      const job = this.worker.run(
        { kind: 'format', version, mode, lineEnding, nonBreakBytes },
        { onChunk: (text) => this.append(pending, job, text), onProgress: (f) => busy.progress(f) },
      );
      // RULE-10: a formatted document keeps the name of the file it came from.
      await this.feed(job, pending, busy, formattedFacts, { sourceName: ed.sourceName });
    });
  }

  /**
   * The validation result of the document at `version`: the shown one when it is current,
   * otherwise (or when `fresh`) computed now under the busy policy (the worker reuses a finished
   * pass); null when cancelled or failed.
   */
  private async validationOf(version: number, fresh = false): Promise<ValidationResult | null> {
    const shown = this.state.validation.value;
    if (!fresh && shown.version === version && shown.result && (shown.state === 'valid' || shown.state === 'invalid'))
      return shown.result;
    const ed = this.editor;
    if (!ed) return null;
    let result: ValidationResult | null = null;
    await this.run('progress.formatting', async (busy) => {
      const job = this.worker.run(
        {
          kind: 'validate',
          version,
          lineEnding: ed.lineEnding,
          skipTable: isLargeTier(tierOf(ed.bytes)),
          supersedes: 'validate',
        },
        { onProgress: (f) => busy.progress(f) },
      );
      busy.onCancel(() => job.cancel());
      const r = await job.result;
      if (r.type !== 'validation') throw new JobFailure('internal', `unexpected ${r.type}`);
      if (this.editor?.version !== r.version) return;
      clearTimeout(this.checkingTimer);
      this.showValidation({ state: stateOf(r.result), result: r.result, version: r.version });
      result = r.result;
    });
    return result;
  }

  /** Implements: F-001.R4 large-paste path (ADR-0006 §2), F-001.AC11; also large external drops. */
  async largePaste(p: LargePaste): Promise<void> {
    if (this.blocked() || !this.editor) return;
    this.clearOutcome();
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
    this.clearOutcome();
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

  // ---- export (F-007) ------------------------------------------------------------------------

  /**
   * RULE-10 — the most recent tool operation (beautify, minify, …), read from the editor's
   * committed tool operations; none yet → `document.json`.
   */
  lastToolOperation(): EditorHandle['lastTool'] {
    return this.editor?.lastTool ?? null;
  }

  /** The whole document as a UTF-8 Blob from the worker, with the document's line ending (ADR-0006 §3). */
  private exportJob(busy: BusyHandle, ed: EditorHandle): { blob: Promise<Blob>; cancel: () => void } {
    const job = this.worker.run(
      { kind: 'export', version: ed.version, eol: ed.lineEnding === 'crlf' ? '\r\n' : '\n' },
      { onProgress: (f) => busy.progress(f) },
    );
    busy.onCancel(() => job.cancel());
    const blob = job.result.then((r) =>
      r.type === 'blob' ? r.blob : Promise.reject(new JobFailure('internal', `unexpected ${r.type}`)),
    );
    return { blob, cancel: () => job.cancel() };
  }

  /**
   * Implements: F-007.R1, F-007.R3, F-007.R6 — copies the whole document. Called from the click
   * handler: the export job and the clipboard item are created synchronously (MOD-IO `copyBlob`),
   * so the user activation holds across the worker round trip. Progress after 0.5 s, cancellable
   * (NFR-02). Refused → the text view with the whole document selected and COPY-error.clipboard.
   */
  copy(): void {
    const ed = this.editor;
    if (this.blocked() || !ed || ed.isEmpty) return;
    this.clearOutcome();
    let outcome: 'copied' | 'blocked' | null = null;
    void this.run('progress.exporting', async (busy) => {
      const job = this.exportJob(busy, ed);
      job.blob.catch(() => undefined); // a refusal may come first; copyBlob reports export failures
      // Cancel also abandons a write still in progress after the export (the browser owns it).
      const cancelled = new Promise<never>((_, reject) => busy.onCancel(() => reject(new Cancelled())));
      cancelled.catch(() => undefined);
      try {
        outcome = await Promise.race([copyBlob(job.blob), cancelled]);
      } catch (e) {
        if (e instanceof Cancelled || reasonOf(e) === 'cancelled') throw new Cancelled();
        throw e;
      }
      if (outcome === 'blocked') job.cancel(); // refused before the export ended: stop it
    }).then(() => {
      if (outcome === 'copied') this.showToast({ id: 'toast.copied', text: t('toast.copied') });
      else if (outcome === 'blocked') this.copyRefused();
    });
  }

  /** Implements: F-007.R3, F-007.AC7, CMP-Editor all-selected — the manual-copy fallback. */
  private copyRefused(): void {
    this.showTextView();
    this.editor?.selectAll();
    this.showBar({ kind: 'error', id: 'error.clipboard', text: t('error.clipboard') });
  }

  /**
   * Implements: F-007.R2, F-007.R4, F-007.R6, RULE-10 — downloads the document as a UTF-8 file
   * built in the worker (exactly as shown, with its line ending); progress after 0.5 s,
   * cancellable; saved through a local object URL (INV-02).
   */
  download(): void {
    const ed = this.editor;
    if (this.blocked() || !ed || ed.isEmpty) return;
    this.clearOutcome();
    const name = downloadName(ed.sourceName, this.lastToolOperation());
    void this.run('progress.exporting', async (busy) => {
      const blob = await this.exportJob(busy, ed).blob.catch((e: unknown) => {
        throw reasonOf(e) === 'cancelled' ? new Cancelled() : e;
      });
      download(blob, name);
    });
  }

  // ---- views and the tree (F-006) -------------------------------------------------------------

  /** Implements: F-006.R1 — shows the tree view of a non-empty document (CMP-Toolbar view switch). */
  showTreeView(): void {
    const ed = this.editor;
    if (!ed || ed.isEmpty || this.blocked()) return;
    this.state.view.value = 'tree';
    ed.setHidden(true);
  }

  /** Implements: F-006.R6 — the text view with exactly [from, to) selected and scrolled into view. */
  reveal(from: number, to: number): void {
    this.showTextView();
    this.editor?.select(from, to);
  }

  /** Implements: F-006.R7 — from the tree's invalid state to the first error in the text. */
  goToError(): void {
    this.showTextView();
    this.jumpTo(0);
  }

  /** Copies a short text (a path, F-006.R4) without the busy policy; toast or COPY-error.clipboard. */
  private async copyText(text: string): Promise<CopyOutcome | null> {
    try {
      const outcome = await copyBlob(Promise.resolve(new Blob([text], { type: 'text/plain' })));
      this.copied(outcome);
      return outcome;
    } catch (e) {
      this.showFailure(reasonOf(e), false);
      return null;
    }
  }

  private copied(outcome: CopyOutcome): void {
    if (outcome === 'copied') this.showToast({ id: 'toast.copied', text: t('toast.copied') });
    else this.showBar({ kind: 'error', id: 'error.clipboard', text: t('error.clipboard') });
  }

  /**
   * Implements: F-006.R5, F-006.R9, RULE-11, ADR-0007 §5 — copies a node's exact source text from a
   * worker-built Blob of its span (with the document's line ending). Called from the click
   * handler: the export job and the clipboard item are created synchronously (MOD-IO), so the
   * user activation holds across the worker round trip; busy policy with progress after 0.5 s
   * and cancel (NFR-02). Blocked → COPY-error.clipboard; the tree shows the manual-copy field.
   */
  copyNodeValue(
    version: number,
    from: number,
    to: number,
  ): Promise<{ outcome: CopyOutcome; text: () => Promise<string> } | null> {
    const ed = this.editor;
    if (this.blocked() || !ed || ed.version !== version) return Promise.resolve(null);
    let result: { outcome: CopyOutcome; text: () => Promise<string> } | null = null;
    return this.run('progress.exporting', async (busy) => {
      const job = this.worker.run(
        { kind: 'export', version, eol: ed.lineEnding === 'crlf' ? '\r\n' : '\n', span: [from, to] },
        { onProgress: (f) => busy.progress(f) },
      );
      busy.onCancel(() => job.cancel());
      const blob = job.result.then((r) =>
        r.type === 'blob' ? r.blob : Promise.reject(new JobFailure('internal', `unexpected ${r.type}`)),
      );
      blob.catch(() => undefined);
      const cancelled = new Promise<never>((_, reject) => busy.onCancel(() => reject(new Cancelled())));
      cancelled.catch(() => undefined);
      let outcome: CopyOutcome;
      try {
        outcome = await Promise.race([copyBlob(blob), cancelled]);
      } catch (e) {
        if (e instanceof Cancelled || reasonOf(e) === 'cancelled') throw new Cancelled();
        throw e;
      }
      result = { outcome, text: () => blob.then((b) => b.text()) };
    }).then(() => {
      if (result) this.copied(result.outcome);
      return result;
    });
  }

  /** What MOD-Tree needs from the app (worker queries, clipboard, editor, history). */
  treeDeps(): TreeDeps {
    return {
      open: (version, onProgress) => this.worker.treeOpen(version, { onProgress }),
      children: (version, c, from, count) => this.worker.treeChildren(version, c, from, count),
      copyPath: (path) => this.copyText(path),
      copyValue: (version, from, to) => this.copyNodeValue(version, from, to),
      reveal: (from, to) => this.reveal(from, to),
      goToError: () => this.goToError(),
      showText: () => this.showTextView(),
      history: (direction) => void this.history(direction),
      failed: (reason) => {
        this.showTextView();
        this.showFailure(reason as FailReason, false);
      },
    };
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
