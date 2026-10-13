// NFR-02 (review F-005 M1) wall-clock budget of the MOD-Editor cursor column on a 50 MB single
// line: a cursor query and every background build slice stay far below 50 ms of main-thread
// work. Timing depends on the machine and its load, so it is not part of `pnpm test`; run with
// `pnpm bench`. The behaviour itself is covered by tests/unit/editor-column.test.ts.
import { ChangeSet, Text } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { ColumnIndex } from '../../src/editor/column';

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

describe('NFR-02 cursor column budget', () => {
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
    const longest = buildAll(index);
    console.log(`column index: longest build slice ${longest.toFixed(1)} ms`);
    expect(longest).toBeLessThan(50);
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
});
