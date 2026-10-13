// MOD-Editor — editor engine in a shadow root, tiers, chunked commit, undo history (ADR-0004,
// ADR-0006). Find (F-010) and issue markers (F-005) plug in later.
import { bracketMatching, syntaxHighlighting } from '@codemirror/language';
import { json } from '@codemirror/lang-json';
import { defaultKeymap } from '@codemirror/commands';
import { Annotation, ChangeSet, Compartment, EditorState, Text, Transaction, type Extension } from '@codemirror/state';
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
  type BreakCounts,
  documentBytes,
  dominantLineEnding,
  isLargeTier,
  LineBreakScanner,
  tierOf,
  utf8Length,
  type LineEnding,
  type Tier,
} from '../core';
import { t } from '../copy';
import { TextBuilder, textChunks } from './builder';
import { UndoHistory, type DocFacts, type Entry, type Snapshot, type ToolKind } from './history';
import { editorTheme, jsonHighlight } from './theme';

export type { DocFacts, Snapshot, ToolKind } from './history';
export { textChunks } from './builder';

/** Typed input on lines at least this long is applied directly (ADR-0004 direct-input handler). */
export const LONG_LINE = 100_000;
/** Pastes longer than this (UTF-16 units) go through the chunked builder (ADR-0006 §2). */
export const LARGE_PASTE = 1 << 20;
/** Main-thread append slice (architecture.md tunables). */
const APPEND_SLICE_MS = 8;
/** Width under which the normal tier soft-wraps (D-019). */
const NARROW_PX = 600;

/** Facts of a text the owner read or built (from the worker). */
export interface LoadedFacts {
  breaks: BreakCounts;
  nonBreakBytes: number;
}

export interface ChangeEvent {
  version: number;
  changes: ChangeSet;
  /** True when the worker mirror must apply `changes`; false when the owner adopts a job. */
  sync: boolean;
}

export interface LargePaste {
  text: string;
  from: number;
  to: number;
  /** UTF-8 size of the document after the paste (RULE-02). */
  bytesAfter: number;
  /** The document's line ending after the paste (RULE-17). */
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
  /** A paste the editor did not apply: over 1 MB, or one that needs the RULE-02 confirmation. */
  onLargePaste?: (paste: LargePaste) => void;
  /** Undo/redo keys: the owner runs the step (it may be a reload, ADR-0006 §4). */
  onHistoryKey?: (direction: 'undo' | 'redo') => void;
  /** RULE-15: history older than the last 3 tool operations was dropped. */
  onHistoryTrimmed?: () => void;
}

/** Text arriving in chunks, shown only when complete (ADR-0006 §1, INV-03). */
export interface PendingDocument {
  append(text: string): void;
  /** UTF-16 units appended so far. */
  readonly appended: number;
  /** Waits for the builder, then replaces the document in one transaction (one undo step). */
  commit(facts: LoadedFacts & { sourceName?: string | null }): Promise<number>;
  /** Drops the pending text; the visible document was never touched. */
  discard(): void;
}

export type HistoryStep =
  | { kind: 'applied' }
  /** A large-tier tool operation: the owner reloads `snapshot.blob` into `pending`, then commits
   * (or discards and calls `abort`, which puts the entry back). */
  | { kind: 'reload'; snapshot: Snapshot; pending: PendingDocument; abort: () => void };

export interface EditorHandle {
  readonly view: EditorView;
  readonly version: number;
  readonly tier: Tier;
  readonly bytes: number;
  readonly lineEnding: LineEnding;
  readonly sourceName: string | null;
  readonly isEmpty: boolean;
  readonly lineCount: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
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
  destroy(): void;
}

type Origin = 'tool' | 'undo' | 'redo' | 'paste';
const origin = Annotation.define<Origin>();

const yieldMain = (): Promise<void> =>
  new Promise((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => {
      ch.port1.close();
      resolve();
    };
    ch.port2.postMessage(0);
  });

/** UTF-8 bytes of the non-break text in [from, to) of `doc`. */
function rangeBytes(doc: Text, from: number, to: number): number {
  let n = 0;
  for (const it = doc.iterRange(from, to); !it.next().done;) if (!it.lineBreak) n += utf8Length(it.value);
  return n;
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

  const bytesOf = (doc: Text) => documentBytes(nonBreakBytes, doc.lines - 1, lineEnding);
  const facts = (): DocFacts => ({ lineEnding, sourceName, nonBreakBytes });

  const historyKeys = keymap.of([
    { key: 'Mod-z', run: () => (options.onHistoryKey?.('undo'), true), preventDefault: true },
    { key: 'Mod-Shift-z', run: () => (options.onHistoryKey?.('redo'), true), preventDefault: true },
    { key: 'Mod-y', run: () => (options.onHistoryKey?.('redo'), true), preventDefault: true },
  ]);

  // Implements: F-001.R4 (large paste path), RULE-17 for pastes, ADR-0006 §2.
  const pasteHandler = EditorView.domEventHandlers({
    paste(event, view) {
      if (view.state.readOnly) return false;
      const text = event.clipboardData?.getData('text/plain');
      if (!text) return false;
      const sel = view.state.selection.main;
      const doc = view.state.doc;
      const whole = sel.from === 0 && sel.to === doc.length;
      const selBreaks = doc.lineAt(sel.to).number - doc.lineAt(sel.from).number;
      const kept = whole ? 0 : nonBreakBytes - rangeBytes(doc, sel.from, sel.to);
      const scan = new LineBreakScanner();
      scan.feed(text);
      scan.end();
      // RULE-17: the document's line ending is the dominant one after the paste (ties → LF).
      const keptBreaks = whole ? 0 : doc.lines - 1 - selBreaks;
      const counts = { ...scan.counts };
      if (lineEnding === 'crlf') counts.crlf += keptBreaks;
      else counts.lf += keptBreaks;
      const eolAfter = dominantLineEnding(counts);
      const bytesAfter = documentBytes(kept + scan.nonBreakBytes, keptBreaks + scan.breaks, eolAfter);
      if (text.length > LARGE_PASTE || tierOf(bytesAfter) === 'very-large') {
        event.preventDefault();
        options.onLargePaste?.({ text, from: sel.from, to: sel.to, bytesAfter, eol: eolAfter });
        return true;
      }
      lineEnding = eolAfter; // the engine applies the paste right after this handler
      return false;
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
        pasteHandler,
        editorTheme,
        // tabindex makes the scroll region's focusable content explicit (axe scrollable-region-focusable).
        EditorView.contentAttributes.of({ 'aria-label': t('label.editor'), tabindex: '0' }),
        tierConf.of(tierExtension('normal', false)),
        busyConf.of([]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged || u.selectionSet) {
            const head = u.state.selection.main.head;
            const line = u.state.doc.lineAt(head);
            options.onCursor?.(line.number, head - line.from + 1);
          }
        }),
      ],
    }),
    dispatchTransactions(trs: readonly Transaction[], v: EditorView) {
      v.update(trs);
      let userEdit = false;
      for (const tr of trs) {
        if (!tr.docChanged) continue;
        version++;
        if (tr.annotation(origin)) continue; // bookkeeping done by the caller
        userEdit = true;
        // A user edit: typing, small paste, cut, drag within the text.
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
          time: Date.now(),
          group,
        };
        history.record(entry, isLargeTier(tierOf(bytesOf(tr.state.doc))));
        options.onChange?.({ version, changes: tr.changes, sync: true });
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

  function undoEntryFor(tool: ToolKind, changes: ChangeSet): Entry {
    // Implements: ADR-0006 §4 — in the large tiers the previous document is kept only as a Blob.
    if (isLargeTier(tier)) return { kind: 'snapshot', snapshot: { blob: options.snapshot(), facts: facts() }, tool };
    return {
      kind: 'changes',
      changes: changes.invert(view.state.doc),
      tool,
      facts: facts(),
      time: Date.now(),
      group: tool,
    };
  }

  function record(entry: Entry): void {
    if (history.record(entry, isLargeTier(tier))) options.onHistoryTrimmed?.();
  }

  function makePending(
    onCommit: (text: Text, loaded: LoadedFacts & { sourceName?: string | null }) => void,
  ): PendingDocument {
    const builder = new TextBuilder();
    const id = ++activePending;
    let appended = 0;
    let discarded = false;
    let pumping: Promise<void> | null = null;
    const pump = async () => {
      while (!discarded && !builder.step(APPEND_SLICE_MS)) await yieldMain();
    };
    const kick = () => {
      if (!pumping) pumping = pump().finally(() => (pumping = null));
    };
    return {
      get appended() {
        return appended;
      },
      append(text) {
        if (discarded) return;
        appended += text.length;
        builder.push(text);
        kick();
      },
      async commit(loaded) {
        while (pumping || !builder.idle) {
          kick();
          await pumping;
        }
        if (discarded || id !== activePending) throw new Error('pending document was discarded');
        const text = builder.finish();
        onCommit(text, loaded);
        return version;
      },
      discard() {
        discarded = true;
      },
    };
  }

  function historyStep(direction: 'undo' | 'redo'): HistoryStep | null {
    const entry = direction === 'undo' ? history.popUndo() : history.popRedo();
    if (!entry) return null;
    const putBack = (e: Entry) => (direction === 'undo' ? history.pushUndo(e) : history.pushRedo(e));
    const keep = (e: Entry) => (direction === 'undo' ? history.pushRedo(e) : history.pushUndo(e));
    const how: Origin = direction;
    if (entry.kind === 'changes') {
      const inverse =
        entry.tool && isLargeTier(tier)
          ? ({ kind: 'snapshot', snapshot: { blob: options.snapshot(), facts: facts() }, tool: entry.tool } as Entry)
          : ({
              kind: 'changes',
              changes: entry.changes.invert(view.state.doc),
              tool: entry.tool,
              facts: entry.tool ? facts() : null,
              time: 0,
              group: how,
            } as Entry);
      if (entry.facts) applyTool(entry.changes, entry.facts, how);
      else {
        const before = view.state.doc;
        entry.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
          if (toA > fromA) nonBreakBytes -= rangeBytes(before, fromA, toA);
          if (inserted.length) nonBreakBytes += rangeBytes(inserted, 0, inserted.length);
        });
        const head = entry.changes.mapPos(view.state.selection.main.head);
        applyTool(entry.changes, facts(), how, head);
      }
      keep(inverse);
      options.onChange?.({ version, changes: entry.changes, sync: true });
      return { kind: 'applied' };
    }
    // Snapshot entry: a reload through the builder (ADR-0006 §4), run by the owner.
    const current = facts();
    const redoSnapshot: Entry | null = isLargeTier(tier)
      ? { kind: 'snapshot', snapshot: { blob: options.snapshot(), facts: current }, tool: entry.tool }
      : null;
    const pending = makePending((text, loaded) => {
      const changes = replaceAll(text);
      const inverse: Entry = redoSnapshot ?? {
        kind: 'changes',
        changes: changes.invert(view.state.doc),
        tool: entry.tool,
        facts: current,
        time: 0,
        group: how,
      };
      applyTool(changes, { ...entry.snapshot.facts, nonBreakBytes: loaded.nonBreakBytes }, how);
      keep(inverse);
      options.onChange?.({ version, changes, sync: false });
    });
    return {
      kind: 'reload',
      snapshot: entry.snapshot,
      pending,
      abort: () => {
        pending.discard();
        putBack(entry);
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
    view,
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
      return makePending((text, loaded) => {
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
        options.onChange?.({ version, changes, sync: false });
      });
    },
    beginPaste(from, to, eol) {
      return makePending((text, loaded) => {
        const doc = view.state.doc;
        const changes = ChangeSet.of({ from, to, insert: text }, doc.length);
        const whole = from === 0 && to === doc.length;
        const kept = whole ? 0 : nonBreakBytes - rangeBytes(doc, from, to);
        const entry: Entry = {
          kind: 'changes',
          changes: changes.invert(doc),
          tool: null,
          facts: null,
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
        options.onChange?.({ version, changes, sync: false });
      });
    },
    clear() {
      const changes = replaceAll(Text.empty);
      const entry = undoEntryFor('clear', changes);
      applyTool(changes, { lineEnding: 'lf', sourceName: null, nonBreakBytes: 0 }, 'tool');
      record(entry);
      options.onChange?.({ version, changes, sync: true });
    },
    undo: () => historyStep('undo'),
    redo: () => historyStep('redo'),
    chunks: () => textChunks(view.state.doc),
    destroy() {
      resize.disconnect();
      view.destroy();
    },
  };
}
