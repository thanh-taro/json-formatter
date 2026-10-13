// MOD-Editor — editor engine in a shadow root, tiers, chunked commit, undo history (ADR-0004,
// ADR-0006), issue marks and jump to a position (F-005), the find engine (F-010).
import { bracketMatching, syntaxHighlighting } from '@codemirror/language';
import { json } from '@codemirror/lang-json';
import { defaultKeymap } from '@codemirror/commands';
import {
  Annotation,
  ChangeSet,
  Compartment,
  EditorSelection,
  EditorState,
  Text,
  Transaction,
  type Extension,
} from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import {
  documentBytes,
  dominantLineEnding,
  isLargeTier,
  LineBreakScanner,
  tierOf,
  utf8Length,
  type BreakCounts,
  type LineEnding,
  type Tier,
} from '../core';
import { t } from '../copy';
import { textChunks } from './builder';
import { toolAfter, UndoHistory, type DocFacts, type Entry, type Snapshot, type ToolKind } from './history';
import { ColumnIndex } from './column';
import { issueMarks, issuePosition, issuesEffect, type IssueMark } from './issues';
import { createPending, type Pending } from './pending';
import { editorTheme, jsonHighlight } from './theme';
import { FindSession, type FindHost } from './find';
import { findHighlight, findRefresh } from './find-view';

export type { DocFacts, Snapshot, ToolKind } from './history';
export type { IssueMark } from './issues';
export { DiscardedError } from './pending';
export type { FindSession, FindStatus } from './find';

/** Typed input on lines at least this long is applied directly (ADR-0004 direct-input handler). */
export const LONG_LINE = 100_000;
/** Pastes and external drops longer than this (UTF-16 units) go through the chunked builder (ADR-0006 §2). */
export const LARGE_PASTE = 1 << 20;
/** History steps inserting more than this re-seed the worker instead of posting the change set (NFR-02). */
const RESEED_UNITS = 1 << 20;
/** Width under which the normal tier soft-wraps (D-019). */
const NARROW_PX = 600;

/** Facts of a text the owner read or built (from the worker). */
export interface LoadedFacts {
  /** Length in editor positions of the resulting document, checked on commit. */
  length: number;
  breaks: BreakCounts;
  nonBreakBytes: number;
}

/** How the worker mirror follows a document change. */
export type MirrorSync =
  /** post `changes` as an edit */
  | 'edit'
  /** the owner adopts the job that produced the text */
  | 'adopt'
  /** too big to post in one message: the owner re-seeds the mirror in slices */
  | 'reseed';

export interface ChangeEvent {
  version: number;
  changes: ChangeSet;
  sync: MirrorSync;
}

/** Pasted or externally dropped text the editor did not apply itself. */
export interface LargePaste {
  text: string;
  from: number;
  to: number;
  /** UTF-8 size of the document after the insertion (RULE-02). */
  bytesAfter: number;
  /** True when the insertion makes the document cross into the very-large tier (RULE-02). */
  needsConfirm: boolean;
  /** The document's line ending after the insertion (RULE-17). */
  eol: LineEnding;
}

export interface EditorOptions {
  /** A UTF-8 Blob of the document as it is now (the worker exports its mirror). Called before the
   * change it protects is dispatched, so the export sees the current version. */
  snapshot: () => Promise<Blob>;
  onChange?: (e: ChangeEvent) => void;
  /** Document facts changed (size, tier, line ending, source name). */
  onFacts?: () => void;
  onCursor?: (line: number, column: number) => void;
  /** An insertion the editor did not apply: over 1 MB, or one that needs the RULE-02 confirmation. */
  onLargePaste?: (paste: LargePaste) => void;
  /** Undo/redo keys: the owner runs the step (it may be a reload, ADR-0006 §4). */
  onHistoryKey?: (direction: 'undo' | 'redo') => void;
  /** RULE-15: history older than the last 3 tool operations was dropped. */
  onHistoryTrimmed?: () => void;
  /** F-010.R1: the platform find shortcut was pressed while the editor has focus. */
  onFindKey?: () => void;
}

export type ReplaceFacts = LoadedFacts & { sourceName?: string | null };

/** Text arriving in chunks, shown only when complete (ADR-0006 §1, INV-03). */
export type PendingDocument = Pending<ReplaceFacts>;

export type HistoryStep =
  | { kind: 'applied' }
  /** A large-tier tool operation: the owner reloads `snapshot.blob` into `pending` and commits.
   * On cancel it calls `abort` (the entry goes back); when the snapshot cannot be restored it
   * calls `drop` (the entry and everything older are dropped, the document is unchanged). */
  | { kind: 'reload'; snapshot: Snapshot; pending: PendingDocument; abort: () => void; drop: () => void };

export interface EditorHandle {
  readonly version: number;
  readonly tier: Tier;
  readonly bytes: number;
  readonly lineEnding: LineEnding;
  readonly sourceName: string | null;
  readonly isEmpty: boolean;
  readonly lineCount: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** RULE-10 — the most recent tool operation committed (`beginReplace` kind or clear), if any. */
  readonly lastTool: ToolKind | null;
  setBusy(busy: boolean): void;
  setHidden(hidden: boolean): void;
  focus(): void;
  beginReplace(kind: ToolKind): PendingDocument;
  beginPaste(from: number, to: number, eol: LineEnding): PendingDocument;
  /** Implements: F-001.R6 — one undo step. */
  clear(): void;
  undo(): HistoryStep | null;
  redo(): HistoryStep | null;
  /** The document as strings of ~1 M units with '\n' breaks (worker re-seed). */
  chunks(): Iterable<string>;
  /** Implements: F-005.R3, F-005.R4 — marks the latest validation's issues (marks follow edits). */
  setIssues(marks: readonly IssueMark[], invalid: boolean): void;
  /** Implements: F-005.R5 — moves the cursor to `pos` and scrolls it into view, both ways. */
  goTo(pos: number): void;
  /** Implements: F-007.R3, CMP-Editor all-selected — selects the whole document and focuses it. */
  selectAll(): void;
  /** Where issue `index` of the marked result is now (mapped through later edits, INV-05). */
  issuePosition(index: number): number | null;
  /**
   * Implements: F-010.R2–R6 — starts finding `term` (RULE-18) from the cursor; replaces any
   * previous session. The session recounts whenever the document changes.
   */
  find(term: string, options: { matchCase: boolean }): FindSession;
  destroy(): void;
}

type Origin = 'tool' | 'undo' | 'redo' | 'paste';
const origin = Annotation.define<Origin>();

/** UTF-8 bytes of the non-break text in [from, to) of `doc`. */
function rangeBytes(doc: Text, from: number, to: number): number {
  let n = 0;
  for (const it = doc.iterRange(from, to); !it.next().done;) if (!it.lineBreak) n += utf8Length(it.value);
  return n;
}

function insertedUnits(changes: ChangeSet): number {
  let n = 0;
  changes.iterChanges((_a, _b, _c, _d, inserted) => (n += inserted.length));
  return n;
}

/** A snapshot whose rejection is observed (no unhandled rejection); awaiting it still rejects. */
function observed(blob: Promise<Blob>): Promise<Blob> {
  blob.catch(() => undefined);
  return blob;
}

// Implements: ADR-0004 direct-input handler — typing on lines ≥ 100,000 characters (not while
// composing) is applied here, so the engine does not diff the whole DOM line (NFR-02).
const directInput = EditorView.domEventHandlers({
  beforeinput(event, view) {
    if (event.inputType !== 'insertText' || !event.data || view.composing || view.state.readOnly) return false;
    const line = view.state.doc.lineAt(view.state.selection.main.head);
    if (line.length < LONG_LINE) return false;
    event.preventDefault();
    view.dispatch(view.state.replaceSelection(event.data), { userEvent: 'input.type', scrollIntoView: true });
    return true;
  },
});

function tierExtension(tier: Tier, narrow: boolean): Extension {
  // Implements: RULE-02 / D-022 — highlighting and bracket matching only in the normal tier;
  // large tiers drop syntax parsing, special chars, active line and wrapping (ADR-0004).
  if (isLargeTier(tier)) return [];
  return [
    json(),
    syntaxHighlighting(jsonHighlight),
    bracketMatching(),
    highlightSpecialChars(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    narrow ? EditorView.lineWrapping : [],
  ];
}

/** Implements: CMP-Editor, F-001.R1 (type/paste), MOD-Editor public surface. */
export function createEditor(host: HTMLElement, options: EditorOptions): EditorHandle {
  // Implements: ADR-0004 shadow-root mount — style-mod uses adopted stylesheets only in a shadow root.
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  const history = new UndoHistory();
  const tierConf = new Compartment();
  const busyConf = new Compartment();

  let version = 0;
  let lineEnding: LineEnding = 'lf';
  let sourceName: string | null = null;
  let nonBreakBytes = 0;
  let tier: Tier = 'normal';
  let narrow = false;
  let activePending = 0;
  let lastTool: ToolKind | null = null;
  /** Line ending to adopt with the next paste/drop transaction the engine dispatches (RULE-17). */
  let incomingEol: LineEnding | null = null;
  /** A drag that started inside the editor (moving text): left to the engine. */
  let internalDrag = false;
  // Implements: COPY-status.cursor in code points without long main-thread tasks (NFR-02).
  const columns = new ColumnIndex(() => reportCursor(view.state));

  /** Reports the cursor (status bar); long lines use the sliced column index. */
  function reportCursor(state: EditorState): void {
    const head = state.selection.main.head;
    const line = state.doc.lineAt(head);
    const column = columns.column(state.doc, line.from, line.to, head);
    options.onCursor?.(line.number, column ?? head - line.from + 1);
  }

  const bytesOf = (doc: Text) => documentBytes(nonBreakBytes, doc.lines - 1, lineEnding);
  const facts = (): DocFacts => ({ lineEnding, sourceName, nonBreakBytes, lastTool });
  const snapshotNow = (): Snapshot => ({ blob: observed(options.snapshot()), facts: facts() });

  const historyKeys = keymap.of([
    { key: 'Mod-z', run: () => (options.onHistoryKey?.('undo'), true), preventDefault: true },
    { key: 'Mod-Shift-z', run: () => (options.onHistoryKey?.('redo'), true), preventDefault: true },
    { key: 'Mod-y', run: () => (options.onHistoryKey?.('redo'), true), preventDefault: true },
    // Implements: F-010.R1 — the platform find shortcut while the editor has focus (platform-mapping).
    { key: 'Mod-f', run: () => (options.onFindKey?.(), true), preventDefault: true },
  ]);
  /** The open find session, if any (F-010). */
  let findSession: FindSession | null = null;

  /**
   * Implements: F-001.R4 (large paste path), RULE-02, RULE-17 for pastes and external text drops
   * (ADR-0006 §2). Returns true when the insertion was taken over (the event must be cancelled).
   */
  function incoming(view: EditorView, text: string, from: number, to: number): boolean {
    const doc = view.state.doc;
    const whole = from === 0 && to === doc.length;
    const selBreaks = doc.lineAt(to).number - doc.lineAt(from).number;
    const kept = whole ? 0 : nonBreakBytes - rangeBytes(doc, from, to);
    const scan = new LineBreakScanner();
    scan.feed(text);
    scan.end();
    // RULE-17: the document's line ending is the dominant one after the insertion (ties → LF).
    const keptBreaks = whole ? 0 : doc.lines - 1 - selBreaks;
    const counts = { ...scan.counts };
    if (lineEnding === 'crlf') counts.crlf += keptBreaks;
    else counts.lf += keptBreaks;
    const eol = dominantLineEnding(counts);
    const bytesAfter = documentBytes(kept + scan.nonBreakBytes, keptBreaks + scan.breaks, eol);
    // RULE-02: confirm only when the insertion makes the document exceed 100 MB.
    const needsConfirm = tierOf(bytesAfter) === 'very-large' && tier !== 'very-large';
    if (text.length > LARGE_PASTE || needsConfirm) {
      options.onLargePaste?.({ text, from, to, bytesAfter, needsConfirm, eol });
      return true;
    }
    incomingEol = eol; // the engine applies the insertion right after this handler
    queueMicrotask(() => (incomingEol = null));
    return false;
  }

  const insertionHandlers = EditorView.domEventHandlers({
    paste(event, view) {
      if (view.state.readOnly) return false;
      const text = event.clipboardData?.getData('text/plain');
      if (!text) return false;
      const sel = view.state.selection.main;
      if (!incoming(view, text, sel.from, sel.to)) return false;
      event.preventDefault();
      return true;
    },
    dragstart() {
      internalDrag = true;
      return false;
    },
    dragend() {
      internalDrag = false;
      return false;
    },
    // Security review MINOR-3: external text drops follow the same size rules as pastes.
    drop(event, view) {
      if (internalDrag || view.state.readOnly) {
        internalDrag = false;
        return false;
      }
      const text = event.dataTransfer?.getData('text/plain');
      if (!text) return false;
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head;
      if (!incoming(view, text, pos, pos)) return false;
      event.preventDefault();
      return true;
    },
  });

  const view = new EditorView({
    parent: shadow,
    root: shadow,
    state: EditorState.create({
      doc: '',
      extensions: [
        lineNumbers(),
        drawSelection(),
        historyKeys,
        keymap.of(defaultKeymap),
        directInput,
        insertionHandlers,
        editorTheme,
        // tabindex makes the scroll region's focusable content explicit (axe scrollable-region-focusable).
        EditorView.contentAttributes.of({ 'aria-label': t('label.editor'), tabindex: '0' }),
        tierConf.of(tierExtension('normal', false)),
        busyConf.of([]),
        issueMarks,
        findHighlight(() => findSession),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) columns.update(u.changes, u.state.doc);
          if (u.docChanged || u.selectionSet) reportCursor(u.state);
        }),
      ],
    }),
    dispatchTransactions(trs: readonly Transaction[], v: EditorView) {
      v.update(trs);
      // F-010 edge case: the document changed while find is open → recount.
      if (findSession && trs.some((tr) => tr.docChanged)) findSession.restart();
      let userEdit = false;
      for (const tr of trs) {
        if (!tr.docChanged) continue;
        version++;
        if (tr.annotation(origin)) continue; // bookkeeping done by the caller
        // A user edit: typing, small paste or drop, cut, drag within the text.
        userEdit = true;
        const eolBefore = lineEnding;
        if (incomingEol && (tr.isUserEvent('input.paste') || tr.isUserEvent('input.drop'))) {
          lineEnding = incomingEol;
          incomingEol = null;
        }
        tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
          if (toA > fromA)
            nonBreakBytes -=
              fromA === 0 && toA === tr.startState.doc.length
                ? nonBreakBytes
                : rangeBytes(tr.startState.doc, fromA, toA);
          if (inserted.length) nonBreakBytes += rangeBytes(inserted, 0, inserted.length);
        });
        const group = tr.isUserEvent('delete')
          ? 'delete'
          : tr.isUserEvent('input.type')
            ? 'type'
            : (tr.annotation(Transaction.userEvent) ?? 'edit');
        const entry: Entry = {
          kind: 'changes',
          changes: tr.changes.invert(tr.startState.doc),
          tool: null,
          facts: null,
          eol: eolBefore,
          time: Date.now(),
          group,
        };
        history.record(entry, isLargeTier(tierOf(bytesOf(tr.state.doc))));
        options.onChange?.({ version, changes: tr.changes, sync: 'edit' });
      }
      if (userEdit) afterChange();
    },
  });

  /** Re-evaluates the tier (RULE-02) after any change and reconfigures the view. */
  function afterChange(): void {
    const next = tierOf(bytesOf(view.state.doc));
    if (next !== tier) {
      tier = next;
      queueMicrotask(() => view.dispatch({ effects: tierConf.reconfigure(tierExtension(tier, narrow)) }));
    }
    if (view.state.doc.length === 0) lineEnding = 'lf';
    options.onFacts?.();
  }

  /** Dispatches a whole change made by the tool (not recorded by dispatchTransactions). */
  function applyTool(changes: ChangeSet, next: DocFacts, how: Origin, selection = 0): void {
    const nextDoc = changes.apply(view.state.doc);
    lineEnding = next.lineEnding;
    sourceName = next.sourceName;
    nonBreakBytes = next.nonBreakBytes;
    // Implements: RULE-10 — undo/redo restore the most recent tool operation with the text.
    lastTool = toolAfter(lastTool, next);
    const nextTier = tierOf(documentBytes(nonBreakBytes, nextDoc.lines - 1, lineEnding));
    const effects = nextTier !== tier ? [tierConf.reconfigure(tierExtension(nextTier, narrow))] : [];
    tier = nextTier;
    view.dispatch({
      changes,
      effects,
      annotations: origin.of(how),
      selection: { anchor: Math.min(selection, nextDoc.length) },
      scrollIntoView: true,
    });
    afterChange();
  }

  function replaceAll(text: Text): ChangeSet {
    const len = view.state.doc.length;
    return ChangeSet.of({ from: 0, to: len, insert: text }, len);
  }

  /** Security review MAJOR-1: the committed text must have the length the worker built. */
  function verifyLength(actual: number, expected: number): void {
    if (actual !== expected) throw new RangeError(`document length ${actual} ≠ ${expected}`);
  }

  function undoEntryFor(tool: ToolKind, changes: ChangeSet): Entry {
    // Implements: ADR-0006 §4 — in the large tiers the previous document is kept only as a Blob.
    if (isLargeTier(tier)) return { kind: 'snapshot', snapshot: snapshotNow(), tool };
    return {
      kind: 'changes',
      changes: changes.invert(view.state.doc),
      tool,
      facts: facts(),
      eol: lineEnding,
      time: Date.now(),
      group: tool,
    };
  }

  function record(entry: Entry): void {
    if (history.record(entry, isLargeTier(tier))) options.onHistoryTrimmed?.();
  }

  /** A pending document that only the latest `begin…` may commit. */
  function pending(onCommit: (text: Text, loaded: ReplaceFacts) => void): PendingDocument {
    const id = ++activePending;
    return createPending<ReplaceFacts>((text, loaded) => {
      if (id !== activePending) throw new Error('a newer pending document exists');
      onCommit(text, loaded);
      return version;
    });
  }

  function historyStep(direction: 'undo' | 'redo'): HistoryStep | null {
    const entry = direction === 'undo' ? history.popUndo() : history.popRedo();
    if (!entry) return null;
    const putBack = (e: Entry) => (direction === 'undo' ? history.pushUndo(e) : history.pushRedo(e));
    const keep = (e: Entry) => (direction === 'undo' ? history.pushRedo(e) : history.pushUndo(e));
    const how: Origin = direction;
    if (entry.kind === 'changes') {
      const inverse: Entry =
        entry.tool && isLargeTier(tier)
          ? { kind: 'snapshot', snapshot: snapshotNow(), tool: entry.tool }
          : {
              kind: 'changes',
              changes: entry.changes.invert(view.state.doc),
              tool: entry.tool,
              facts: entry.tool ? facts() : null,
              eol: lineEnding,
              time: 0,
              group: how,
            };
      if (entry.facts) applyTool(entry.changes, entry.facts, how);
      else {
        const before = view.state.doc;
        let bytes = nonBreakBytes;
        entry.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
          if (toA > fromA) bytes -= rangeBytes(before, fromA, toA);
          if (inserted.length) bytes += rangeBytes(inserted, 0, inserted.length);
        });
        const head = entry.changes.mapPos(view.state.selection.main.head);
        // Review M3: undoing a paste restores the line ending it replaced (RULE-17).
        applyTool(entry.changes, { lineEnding: entry.eol, sourceName, nonBreakBytes: bytes }, how, head);
      }
      keep(inverse);
      // Review m6: a large in-memory restore is re-seeded in slices instead of one big message.
      options.onChange?.({
        version,
        changes: entry.changes,
        sync: insertedUnits(entry.changes) > RESEED_UNITS ? 'reseed' : 'edit',
      });
      return { kind: 'applied' };
    }
    // Snapshot entry: a reload through the builder (ADR-0006 §4), run by the owner.
    const current = facts();
    const redoSnapshot: Entry | null = isLargeTier(tier)
      ? { kind: 'snapshot', snapshot: snapshotNow(), tool: entry.tool }
      : null;
    const pend = pending((text, loaded) => {
      verifyLength(text.length, loaded.length);
      const changes = replaceAll(text);
      const inverse: Entry = redoSnapshot ?? {
        kind: 'changes',
        changes: changes.invert(view.state.doc),
        tool: entry.tool,
        facts: current,
        eol: current.lineEnding,
        time: 0,
        group: how,
      };
      applyTool(changes, { ...entry.snapshot.facts, nonBreakBytes: loaded.nonBreakBytes }, how);
      keep(inverse);
      options.onChange?.({ version, changes, sync: 'adopt' });
    });
    return {
      kind: 'reload',
      snapshot: entry.snapshot,
      pending: pend,
      abort: () => {
        pend.discard();
        putBack(entry);
      },
      // Review M2: an unrestorable snapshot is not put back (it would fail again).
      drop: () => {
        pend.discard();
        history.dropBeyond(direction);
      },
    };
  }

  // Implements: CMP-Editor "narrow" (D-019) — soft wrap under 600 px in the normal tier.
  const resize = new ResizeObserver(() => {
    const next = host.clientWidth > 0 && host.clientWidth < NARROW_PX;
    if (next === narrow) return;
    narrow = next;
    view.dispatch({ effects: tierConf.reconfigure(tierExtension(tier, narrow)) });
  });
  resize.observe(host);

  return {
    get version() {
      return version;
    },
    get tier() {
      return tier;
    },
    get bytes() {
      return bytesOf(view.state.doc);
    },
    get lineEnding() {
      return lineEnding;
    },
    get sourceName() {
      return sourceName;
    },
    get isEmpty() {
      return view.state.doc.length === 0;
    },
    get lineCount() {
      return view.state.doc.lines;
    },
    get canUndo() {
      return history.canUndo;
    },
    get canRedo() {
      return history.canRedo;
    },
    get lastTool() {
      return lastTool;
    },
    // Implements: D-005 busy policy — read-only while a tool operation runs; scrolling stays.
    setBusy(busy) {
      view.dispatch({
        effects: busyConf.reconfigure(
          busy
            ? [
                EditorState.readOnly.of(true),
                EditorView.editorAttributes.of({ class: 'tk-busy' }),
                EditorView.contentAttributes.of({ 'aria-readonly': 'true' }),
              ]
            : [],
        ),
      });
    },
    // Implements: ADR-0004 — never display:none while the document can change.
    setHidden(hidden) {
      host.classList.toggle('tk-editor-host--hidden', hidden);
      host.inert = hidden;
    },
    focus() {
      view.focus();
    },
    // Implements: ADR-0006 §1 chunked commit; INV-03 (discard leaves the document untouched); INV-04.
    beginReplace(kind) {
      return pending((text, loaded) => {
        verifyLength(text.length, loaded.length);
        const changes = replaceAll(text);
        const entry = undoEntryFor(kind, changes);
        applyTool(
          changes,
          {
            lineEnding: dominantLineEnding(loaded.breaks),
            sourceName: loaded.sourceName ?? null,
            nonBreakBytes: loaded.nonBreakBytes,
          },
          'tool',
        );
        record(entry);
        lastTool = kind;
        options.onChange?.({ version, changes, sync: 'adopt' });
      });
    },
    beginPaste(from, to, eol) {
      return pending((text, loaded) => {
        const doc = view.state.doc;
        verifyLength(doc.length - (to - from) + text.length, loaded.length);
        const changes = ChangeSet.of({ from, to, insert: text }, doc.length);
        const whole = from === 0 && to === doc.length;
        const kept = whole ? 0 : nonBreakBytes - rangeBytes(doc, from, to);
        const entry: Entry = {
          kind: 'changes',
          changes: changes.invert(doc),
          tool: null,
          facts: null,
          eol: lineEnding,
          time: 0,
          group: 'paste',
        };
        applyTool(
          changes,
          { lineEnding: eol, sourceName, nonBreakBytes: kept + loaded.nonBreakBytes },
          'paste',
          from + text.length,
        );
        record(entry);
        options.onChange?.({ version, changes, sync: 'adopt' });
      });
    },
    clear() {
      const changes = replaceAll(Text.empty);
      const entry = undoEntryFor('clear', changes);
      applyTool(changes, { lineEnding: 'lf', sourceName: null, nonBreakBytes: 0 }, 'tool');
      record(entry);
      lastTool = 'clear';
      options.onChange?.({ version, changes, sync: 'edit' });
    },
    undo: () => historyStep('undo'),
    redo: () => historyStep('redo'),
    chunks: () => textChunks(view.state.doc),
    setIssues(marks, invalid) {
      view.dispatch({ effects: issuesEffect(marks, invalid) });
    },
    issuePosition: (index) => issuePosition(view.state, index),
    goTo(pos) {
      const at = Math.min(Math.max(0, pos), view.state.doc.length);
      // CMP-Editor: scrolls vertically and horizontally (centred), soft-wrap aware.
      view.dispatch({
        selection: { anchor: at },
        effects: EditorView.scrollIntoView(at, { y: 'center', x: 'center' }),
      });
      view.focus();
    },
    selectAll() {
      view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
      view.focus();
    },
    find(term, { matchCase }) {
      findSession?.close();
      const host: FindHost = {
        doc: () => view.state.doc,
        cursor: () => view.state.selection.main.from,
        select(from, to) {
          // F-010.R2: selected and scrolled into view; centred only when it is off screen.
          const at = view.coordsAtPos(from);
          const box = view.scrollDOM.getBoundingClientRect();
          const onScreen = !!at && at.top >= box.top && at.bottom <= box.bottom;
          view.dispatch({
            selection: EditorSelection.single(from, to),
            effects: EditorView.scrollIntoView(EditorSelection.range(from, to), { y: onScreen ? 'nearest' : 'center' }),
          });
        },
        refresh: () => view.dispatch({ effects: findRefresh.of(null) }),
        schedule(fn) {
          let live = true;
          const ch = new MessageChannel();
          ch.port1.onmessage = () => {
            ch.port1.close();
            if (live) fn();
          };
          ch.port2.postMessage(0);
          return () => {
            live = false;
            ch.port1.close();
          };
        },
        now: () => performance.now(),
      };
      // closing forgets the session, so its decorations go
      host.closed = () => {
        if (findSession === session) findSession = null;
      };
      const session = new FindSession(host, term, { matchCase });
      findSession = session;
      // started after the caller has attached its listeners (MOD-Editor public surface)
      queueMicrotask(() => session.start(true));
      return session;
    },
    destroy() {
      findSession?.close();
      columns.reset();
      resize.disconnect();
      view.destroy();
    },
  };
}
