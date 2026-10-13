// MOD-Editor undo history (RULE-15, INV-04, ADR-0006 §4) — pure state logic.
import { ChangeSet, Text } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { UndoHistory, NORMAL_DEPTH, type DocFacts, type Entry, type ToolKind } from '../../src/editor/history';

const facts: DocFacts = { lineEnding: 'lf', sourceName: null, nonBreakBytes: 0 };
const blobEntry = (tool: ToolKind, label: string): Entry => ({
  kind: 'snapshot',
  snapshot: { blob: Promise.resolve(new Blob([label])), facts },
  tool,
});
/** The inverse of typing one character into a document of `before` characters. */
const typing = (time: number, group = 'type', before = 0): Entry => ({
  kind: 'changes',
  changes: ChangeSet.of({ from: before, to: before + 1 }, before + 1),
  tool: null,
  facts: null,
  time,
  group,
});

describe('RULE-15 undo history', () => {
  it('F-001.AC12 RULE-15 in the large tiers a 4th tool operation drops the oldest; only the last 3 remain', async () => {
    const h = new UndoHistory();
    const trims = [blobEntry('load', 'A'), blobEntry('load', 'B'), blobEntry('load', 'C')].map((e) =>
      h.record(e, true),
    );
    expect(trims).toEqual([false, false, false]);
    expect(h.record(blobEntry('load', 'D'), true)).toBe(true);
    const restored: string[] = [];
    for (let e = h.popUndo(); e; e = h.popUndo())
      if (e.kind === 'snapshot') restored.push(await (await e.snapshot.blob).text());
    expect(restored).toEqual(['D', 'C', 'B']);
  });

  it('RULE-15 typing between large-tier tool operations stays undoable', () => {
    const h = new UndoHistory();
    h.record(blobEntry('load', 'A'), true);
    h.record(typing(0), true);
    h.record(blobEntry('beautify', 'B'), true);
    h.record(typing(10_000), true);
    h.record(blobEntry('minify', 'C'), true);
    expect(h.record(blobEntry('reindent', 'D'), true)).toBe(true);
    expect(h.done.map((e) => e.tool ?? 'typing')).toEqual(['beautify', 'typing', 'minify', 'reindent']);
  });

  it('RULE-15 in the normal tier at least the last 100 changes can be undone', () => {
    const h = new UndoHistory();
    for (let i = 0; i < 150; i++) h.record(typing(i * 1000, i % 2 ? 'type' : 'delete'), false);
    expect(h.done).toHaveLength(NORMAL_DEPTH);
    expect(h.toolCount).toBe(0);
  });

  it('INV-04 a tool operation is one undo step; typing in a burst groups into one', () => {
    const h = new UndoHistory();
    const doc = Text.of(['{"a":1}']);
    const load = ChangeSet.of({ from: 0, to: 0, insert: doc }, 0);
    h.record({ kind: 'changes', changes: load.invert(Text.empty), tool: 'load', facts, time: 0, group: 'load' }, false);
    h.record(typing(1000, 'type', 7), false);
    h.record(typing(1100, 'type', 8), false);
    h.record(typing(1200, 'type', 9), false);
    expect(h.done).toHaveLength(2);
    expect(h.done[0]?.tool).toBe('load');
  });

  it('INV-04 recording a new change clears redo', () => {
    const h = new UndoHistory();
    h.record(blobEntry('load', 'A'), false);
    const e = h.popUndo()!;
    h.pushRedo(e);
    expect(h.canRedo).toBe(true);
    h.record(typing(0), false);
    expect(h.canRedo).toBe(false);
  });
});
