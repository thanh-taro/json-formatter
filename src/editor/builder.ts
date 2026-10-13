// MOD-Editor document builder (ADR-0006 §1; promoted from spike/pipeline
// `spikes/pipeline/src/builder.ts`). Incoming text is appended to a pending CodeMirror `Text` in
// bounded work units so each main-thread slice stays ≤ ~8 ms; pieces of an unfinished line are
// collected and joined once (no O(n²) carry on a single 100 MB line). Line breaks: LF, CRLF and
// lone CR all split lines (same rule as the editor and ENT-Issue); a CRLF split across chunks
// counts once.
import { Text } from '@codemirror/state';

/** Work unit for `step()`: 256 K UTF-16 units. */
const PIECE = 1 << 18;

export class TextBuilder {
  private doc: Text | null = null;
  private carry: string[] = [];
  private pendingCR = false;
  private queue: string[] = [];
  private qpos = 0;
  private failure: Error | null = null;

  /** Queues a chunk; `step()` processes it. */
  push(chunk: string): void {
    if (chunk.length) this.queue.push(chunk);
  }

  get idle(): boolean {
    return this.queue.length === 0;
  }

  /**
   * Processes queued input until `budgetMs` is used or the queue is empty; true when empty.
   * A piece leaves the queue only after it was appended. The first error (e.g. a `RangeError`
   * when memory runs out) is kept: every later `step`/`finish` throws it, so a text with a piece
   * missing can never be completed (F-001.R9, INV-03).
   */
  step(budgetMs = Infinity): boolean {
    if (this.failure !== null) throw this.failure;
    const t0 = performance.now();
    while (this.queue.length) {
      const head = this.queue[0]!;
      const end = Math.min(head.length, this.qpos + PIECE);
      const piece = this.qpos === 0 && end === head.length ? head : head.slice(this.qpos, end);
      try {
        this.append(piece);
      } catch (e) {
        this.failure = e instanceof Error ? e : new Error(String(e));
        throw this.failure;
      }
      this.qpos = end;
      if (end >= head.length) {
        this.queue.shift();
        this.qpos = 0;
      }
      if (performance.now() - t0 >= budgetMs) break;
    }
    return this.queue.length === 0;
  }

  /** Drops everything (a discarded pending document). */
  clear(): void {
    this.queue = [];
    this.qpos = 0;
    this.carry = [];
    this.doc = null;
  }

  private append(piece: string): void {
    if (this.pendingCR) {
      // a CR ended the previous piece: CRLF across the boundary is one break
      this.pendingCR = false;
      if (piece.charCodeAt(0) === 10) piece = piece.slice(1);
      if (!piece.length) return;
    }
    let trailingCR = false;
    if (piece.charCodeAt(piece.length - 1) === 13) {
      // a break now; an LF starting the next piece belongs to it
      this.pendingCR = true;
      trailingCR = true;
      piece = piece.slice(0, -1);
    }
    const lines = piece.split(/\r\n?|\n/);
    if (trailingCR) lines.push('');
    if (lines.length === 1) {
      this.carry.push(piece);
      return;
    }
    if (this.carry.length) {
      this.carry.push(lines[0]!);
      lines[0] = this.carry.join('');
      this.carry = [];
    }
    this.carry.push(lines.pop()!);
    this.doc = this.doc ? this.doc.append(Text.of(['', ...lines])) : Text.of(lines);
  }

  /** Completes the text (processes anything still queued). */
  finish(): Text {
    this.step();
    if (this.failure !== null) throw this.failure;
    const last = this.carry.join('');
    this.carry = [];
    const doc = this.doc ? this.doc.append(Text.of(['', last])) : Text.of([last]);
    this.doc = null;
    return doc;
  }
}

/** Iterates a `Text` as strings of about `size` units with `eol` line breaks (re-seeding the
 * worker mirror, ADR-0005 §4). */
export function* textChunks(doc: Text, eol = '\n', size = 1 << 20): Generator<string> {
  let buf: string[] = [];
  let n = 0;
  let first = true;
  for (const it = doc.iterLines(); !it.next().done;) {
    if (!first) {
      buf.push(eol);
      n += eol.length;
    }
    first = false;
    const line = it.value;
    if (line.length > size) {
      if (buf.length) yield buf.join('');
      buf = [];
      n = 0;
      for (let i = 0; i < line.length; i += size) yield line.slice(i, i + size);
      continue;
    }
    buf.push(line);
    n += line.length;
    if (n >= size) {
      yield buf.join('');
      buf = [];
      n = 0;
    }
  }
  if (buf.length) yield buf.join('');
}
