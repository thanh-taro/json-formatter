// MOD-Editor cursor column in code points (COPY-status.cursor, ENT-Issue columns) without long
// main-thread tasks (NFR-02, review F-005 M1). Short lines are counted directly. A long line
// (e.g. a minified 50–100 MB document) gets an index of surrogate pairs per 64 K-unit block,
// built in ≤ 8 ms slices; a cursor query then counts at most one block. After an edit, blocks
// that end before the first change are kept, so typing near the cursor only rebuilds the tail.
// Until the index covers the cursor, the column is reported in UTF-16 units (exact when the line
// has no characters outside the BMP) and corrected once the index is ready.
import type { ChangeSet, Text } from '@codemirror/state';

/** Lines longer than this are indexed instead of counted per query. */
export const DIRECT_UNITS = 1 << 16;
const BLOCK = 1 << 16;
const SLICE_MS = 8;

/** Surrogate pairs (a low surrogate right after a high one) whose low half is in [from, to). */
function pairsIn(doc: Text, from: number, to: number): number {
  if (to <= from) return 0;
  let pairs = 0;
  let high = false;
  // Start one unit early so a pair split at `from` is seen.
  const start = from > 0 ? from - 1 : 0;
  let i = start;
  for (const it = doc.iterRange(start, to); !it.next().done;) {
    const s = it.value;
    for (let k = 0; k < s.length; k++, i++) {
      const c = s.charCodeAt(k);
      if (high && c >= 0xdc00 && c <= 0xdfff && i >= from) pairs++;
      high = c >= 0xd800 && c <= 0xdbff;
    }
  }
  return pairs;
}

export class ColumnIndex {
  private doc: Text | null = null;
  private lineFrom = -1;
  private lineTo = -1;
  /** prefix[k] = pairs before block k; blocks 0 … prefix.length − 2 are complete. */
  private prefix: number[] = [0];
  private timer: ReturnType<typeof setTimeout> | undefined;

  /** Called when the index advanced, so the owner can report the cursor again. */
  constructor(
    private readonly onProgress: () => void = () => undefined,
    private readonly schedule: (fn: () => void) => ReturnType<typeof setTimeout> = (fn) => setTimeout(fn, 0),
  ) {}

  /** Keeps the blocks before the first change when the indexed line still starts where it did. */
  update(changes: ChangeSet, doc: Text): void {
    if (!this.doc) return;
    let first = Infinity;
    changes.iterChangedRanges((fromA) => (first = Math.min(first, fromA)));
    if (first < this.lineFrom || first === Infinity) {
      if (first < this.lineFrom) this.reset();
      else this.doc = doc;
      return;
    }
    const keep = Math.max(0, Math.floor((first - this.lineFrom) / BLOCK));
    if (this.prefix.length - 1 > keep) this.prefix.length = keep + 1;
    this.doc = doc;
    const line = doc.lineAt(this.lineFrom);
    this.lineTo = line.to;
  }

  reset(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.doc = null;
    this.lineFrom = this.lineTo = -1;
    this.prefix = [0];
  }

  /**
   * The 1-based code-point column of `head` on the line [from, to), or `null` while the index
   * does not reach it yet (the build continues in the background).
   */
  column(doc: Text, from: number, to: number, head: number): number | null {
    if (to - from <= DIRECT_UNITS) return head - from - pairsIn(doc, from + 1, head) + 1;
    if (this.doc !== doc || this.lineFrom !== from) {
      this.reset();
      this.doc = doc;
      this.lineFrom = from;
    }
    this.lineTo = to;
    const k = Math.floor((head - from) / BLOCK);
    if (k < this.prefix.length) {
      const blockStart = from + k * BLOCK;
      return head - from - (this.prefix[k]! + pairsIn(doc, Math.max(from + 1, blockStart), head)) + 1;
    }
    this.build();
    return null;
  }

  /** Builds blocks for up to `budgetMs`; returns true when the whole line is indexed. */
  step(budgetMs = SLICE_MS): boolean {
    const doc = this.doc;
    if (!doc) return true;
    const t0 = performance.now();
    const blocks = Math.ceil((this.lineTo - this.lineFrom) / BLOCK);
    while (this.prefix.length - 1 < blocks) {
      const k = this.prefix.length - 1;
      const start = this.lineFrom + k * BLOCK;
      const end = Math.min(this.lineTo, start + BLOCK);
      this.prefix.push(this.prefix[k]! + pairsIn(doc, Math.max(this.lineFrom + 1, start), end));
      if (performance.now() - t0 >= budgetMs) return false;
    }
    return true;
  }

  /** True while a slice runs: `onProgress` may query again, which must not start a second chain. */
  private running = false;

  private build(): void {
    if (this.timer !== undefined || this.running) return;
    const run = () => {
      this.timer = undefined;
      this.running = true;
      let done = true;
      try {
        done = this.step();
        this.onProgress();
      } finally {
        this.running = false;
      }
      // One chain only: continue unless finished, reset to nothing, or already rescheduled.
      if (!done && this.doc && this.timer === undefined) this.timer = this.schedule(run);
    };
    this.timer = this.schedule(run);
  }
}
