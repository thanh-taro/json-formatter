// MOD-Editor undo history (ADR-0004 "Undo", ADR-0006 §4) — pure state logic, no DOM.
// Implements: RULE-15, INV-04, F-001.R7.
// - normal tier: at least the last 100 changes, in memory (inverted change sets; a whole-document
//   replacement costs a reference to the old `Text`, not a copy); typing grouped by pause;
// - large / very-large tiers: a tool operation's entry restores the previous document from a
//   worker-built UTF-8 Blob (never an in-memory `Text`); when a 4th tool operation is recorded,
//   everything older than the 3rd-most-recent tool operation is dropped and the owner is told
//   (COPY-notice.undo_trimmed, once — the owner decides how often to show it).
import type { ChangeSet } from '@codemirror/state';
import type { LineEnding } from '../core';

/** Tool operations of RULE-15 (a load, clear, beautify, minify or re-indent). */
export type ToolKind = 'load' | 'clear' | 'beautify' | 'minify' | 'reindent';

/** Document-level facts restored together with the text (ENT-Document). */
export interface DocFacts {
  lineEnding: LineEnding;
  sourceName: string | null;
  /** UTF-8 bytes of the text without its line breaks. */
  nonBreakBytes: number;
}

/** A previous document kept outside the JS heap (ADR-0006 §4). */
export interface Snapshot {
  blob: Promise<Blob>;
  facts: DocFacts;
}

export type Entry =
  /** Apply `changes` to the current document to get back to the recorded state. */
  | {
      kind: 'changes';
      changes: ChangeSet;
      tool: ToolKind | null;
      /** Whole-document facts to restore (tool operations); null for typing. */
      facts: DocFacts | null;
      /** The line ending of the recorded state (a paste may have changed it, RULE-17). */
      eol: LineEnding;
      time: number;
      group: string;
    }
  /** Reload the recorded document from a Blob (large-tier tool operations). */
  | { kind: 'snapshot'; snapshot: Snapshot; tool: ToolKind };

/** RULE-15: in the normal tier at least this many changes can be undone. */
export const NORMAL_DEPTH = 100;
/** RULE-15: in the large tiers at least this many tool operations can be undone. */
export const LARGE_TOOL_OPS = 3;
/** Typing within this pause joins the previous entry (like a standard editor). */
export const GROUP_DELAY_MS = 500;

export class UndoHistory {
  done: Entry[] = [];
  undone: Entry[] = [];

  /**
   * Records a new change (clears redo). `large` is the tier of the document after the change.
   * Returns true when older history was dropped by the RULE-15 large-tier limit.
   */
  record(entry: Entry, large: boolean): boolean {
    this.undone = [];
    const last = this.done[this.done.length - 1];
    if (
      entry.kind === 'changes' &&
      entry.tool === null &&
      last?.kind === 'changes' &&
      last.tool === null &&
      last.group === entry.group &&
      last.eol === entry.eol &&
      entry.time - last.time < GROUP_DELAY_MS
    ) {
      // entry.changes takes the newest document back to the previous one; last.changes takes
      // that one back to the state before the group.
      this.done[this.done.length - 1] = { ...last, changes: entry.changes.compose(last.changes), time: entry.time };
      return false;
    }
    this.done.push(entry);
    return this.trim(large);
  }

  private trim(large: boolean): boolean {
    if (large) {
      const tools: number[] = [];
      this.done.forEach((e, i) => {
        if (e.tool) tools.push(i);
      });
      if (tools.length > LARGE_TOOL_OPS) {
        this.done = this.done.slice(tools[tools.length - LARGE_TOOL_OPS]);
        return true;
      }
      return false;
    }
    if (this.done.length > NORMAL_DEPTH) this.done = this.done.slice(this.done.length - NORMAL_DEPTH);
    return false;
  }

  popUndo(): Entry | undefined {
    return this.done.pop();
  }
  popRedo(): Entry | undefined {
    return this.undone.pop();
  }
  /** After an undo: the entry that redoes it. */
  pushRedo(entry: Entry): void {
    this.undone.push(entry);
  }
  /** After a redo (or an aborted undo): back on the undo stack without clearing redo. */
  pushUndo(entry: Entry): void {
    this.done.push(entry);
  }

  /**
   * A snapshot could not be restored (its export or reload failed): the entry was popped and is
   * not put back; everything older in that direction is unreachable too, so it is dropped
   * (the document itself is unchanged).
   */
  dropBeyond(direction: 'undo' | 'redo'): void {
    if (direction === 'undo') this.done = [];
    else this.undone = [];
  }

  get canUndo(): boolean {
    return this.done.length > 0;
  }
  get canRedo(): boolean {
    return this.undone.length > 0;
  }
  get toolCount(): number {
    return this.done.filter((e) => e.tool).length;
  }
}
