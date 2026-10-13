// MOD-Editor cursor column in code points (COPY-status.cursor) without long main-thread tasks
// (NFR-02; review F-005 M1): short lines are counted directly, long lines through a per-block
// index built in ≤ 8 ms slices and partly kept across edits.
import { ChangeSet, Text } from '@codemirror/state';
import { describe, expect, it, vi } from 'vitest';
import { ColumnIndex } from '../../src/editor/column';

/** Brute-force code-point column (the oracle). */
function oracle(line: string, offset: number): number {
  return [...line.slice(0, offset)].length + 1;
}

/** Runs the index's background build synchronously. */
function buildAll(index: ColumnIndex): void {
  while (!index.step());
}

const manual = () => new ColumnIndex(undefined, () => 0 as unknown as ReturnType<typeof setTimeout>);

describe('MOD-Editor cursor column', () => {
  it('ENT-Issue short lines are counted directly in code points', () => {
    const line = 'a😀b😀😀c';
    const doc = Text.of([line]);
    const index = manual();
    for (let i = 0; i <= line.length; i++) {
      if (i > 0 && line.charCodeAt(i - 1) >= 0xd800 && line.charCodeAt(i - 1) <= 0xdbff) continue;
      expect(index.column(doc, 0, line.length, i)).toBe(oracle(line, i));
    }
  });

  it('NFR-02 review F-005 M1 on a long single line, a cursor query answers from the block index once built', () => {
    // The wall-clock budget (≤ 50 ms per query and per slice on 50 MB) is measured in
    // tests/bench/column.bench.test.ts; this checks the behaviour, independent of machine load.
    const size = 5_000_000;
    const emoji = '😀';
    // One emoji every ~1 MB, the rest ASCII.
    const part = 'x'.repeat(1_000_000 - emoji.length) + emoji;
    const line = part.repeat(size / 1_000_000);
    const doc = Text.of([line]);
    const index = manual();
    // Before the index reaches the cursor: no answer yet (UTF-16 shown).
    expect(index.column(doc, 0, line.length, line.length - 3)).toBeNull();
    buildAll(index);
    for (const head of [0, 1, 999_998, 1_000_000, 2_500_001, line.length - 3, line.length]) {
      expect(index.column(doc, 0, line.length, head), String(head)).toBe(head - Math.floor(head / 1_000_000) + 1);
    }
    // Typing near the end keeps the blocks before it: a query before the edit answers at once.
    const edit = ChangeSet.of({ from: line.length - 10, insert: 'y' }, line.length);
    const next = edit.apply(doc);
    index.update(edit, next);
    expect(index.column(next, 0, line.length + 1, 2_500_001)).toBe(2_500_001 - 2 + 1);
  });

  it('ENT-Issue the indexed column matches the oracle around surrogate pairs and block edges', () => {
    const block = 1 << 16;
    const line = 'a'.repeat(block - 1) + '😀' + 'b'.repeat(block) + '😀😀' + 'c'.repeat(10);
    const doc = Text.of(['{', line]);
    const from = doc.line(2).from;
    const index = manual();
    expect(index.column(doc, from, from + line.length, from + line.length)).toBeNull();
    buildAll(index);
    for (const offset of [0, block - 1, block + 1, 2 * block + 1, 2 * block + 3, 2 * block + 5, line.length]) {
      expect(index.column(doc, from, from + line.length, from + offset), String(offset)).toBe(oracle(line, offset));
    }
  });

  it('NFR-02 review F-005 round 3 the background build runs as one timer chain and reset leaves none', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); // real clock: slices end
    try {
      const line = 'q'.repeat(40_000_000); // several 8 ms slices
      const doc = Text.of([line]);
      let progress = 0;
      // Like the editor: every slice re-reports the cursor, which queries again.
      const index: ColumnIndex = new ColumnIndex(() => {
        progress++;
        index.column(doc, 0, line.length, line.length);
      });
      expect(index.column(doc, 0, line.length, line.length)).toBeNull();
      for (let i = 0; i < 3; i++) {
        expect(vi.getTimerCount()).toBeLessThanOrEqual(1);
        vi.advanceTimersToNextTimer();
      }
      expect(progress).toBeGreaterThan(0);
      expect(vi.getTimerCount()).toBeLessThanOrEqual(1);
      index.reset();
      expect(vi.getTimerCount()).toBe(0);
      // and a finished build leaves none either
      index.column(doc, 0, line.length, line.length);
      vi.runAllTimers();
      expect(vi.getTimerCount()).toBe(0);
      expect(index.column(doc, 0, line.length, line.length)).toBe(line.length + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('smoke: an edit before the indexed line drops the index', () => {
    const line = 'z'.repeat(200_000);
    const doc = Text.of(['[', line]);
    const from = doc.line(2).from;
    const index = manual();
    index.column(doc, from, from + line.length, from + 100);
    buildAll(index);
    const edit = ChangeSet.of({ from: 0, insert: '\n' }, doc.length);
    const next = edit.apply(doc);
    index.update(edit, next);
    expect(index.column(next, from + 1, from + 1 + line.length, from + 1 + 150_000)).toBeNull();
  });
});
