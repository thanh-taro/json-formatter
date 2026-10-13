// MOD-Editor cursor column in code points (COPY-status.cursor) without long main-thread tasks
// (NFR-02; review F-005 M1): short lines are counted directly, long lines through a per-block
// index built in ≤ 8 ms slices and partly kept across edits.
import { ChangeSet, Text } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { ColumnIndex } from '../../src/editor/column';

/** Brute-force code-point column (the oracle). */
function oracle(line: string, offset: number): number {
  return [...line.slice(0, offset)].length + 1;
}

/** Runs the index's background build synchronously, returning the longest slice in ms. */
function buildAll(index: ColumnIndex): number {
  let longest = 0;
  for (;;) {
    const t0 = performance.now();
    const done = index.step();
    longest = Math.max(longest, performance.now() - t0);
    if (done) return longest;
  }
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

  it('NFR-02 review F-005 M1 on a 50 MB single line, a cursor move stays far below 50 ms of main-thread work', () => {
    const size = 50_000_000;
    const emoji = '😀';
    // One emoji every ~1 MB, the rest ASCII.
    const part = 'x'.repeat(1_000_000 - emoji.length) + emoji;
    const line = part.repeat(size / 1_000_000);
    const doc = Text.of([line]);
    const index = manual();
    const near = (head: number) => {
      const t0 = performance.now();
      const col = index.column(doc, 0, line.length, head);
      return { col, ms: performance.now() - t0 };
    };
    // Before the index reaches the cursor: no answer yet (UTF-16 shown), and no long task.
    const first = near(line.length - 3);
    expect(first.col).toBeNull();
    expect(first.ms).toBeLessThan(50);
    // The build runs in slices that each stay short.
    expect(buildAll(index)).toBeLessThan(50);
    for (const head of [0, 1, 999_998, 1_000_000, 25_000_001, line.length - 3, line.length]) {
      const r = near(head);
      expect(r.ms).toBeLessThan(50);
      expect(r.col, String(head)).toBe(head - Math.floor(head / 1_000_000) + 1);
    }
    // Typing near the end keeps the blocks before it: a query before the edit answers at once.
    const edit = ChangeSet.of({ from: line.length - 10, insert: 'y' }, line.length);
    const next = edit.apply(doc);
    index.update(edit, next);
    const t0 = performance.now();
    expect(index.column(next, 0, line.length + 1, 25_000_001)).toBe(25_000_001 - 25 + 1);
    expect(performance.now() - t0).toBeLessThan(50);
  }, 60_000);

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
