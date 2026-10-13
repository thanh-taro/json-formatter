// MOD-Core position resolution (ADR-0005 §1 `resolvePositions`): editor positions → ENT-Issue
// line, column and offset, for reported issues only, in one sorted streaming pass, so the
// tokenizer's hot loop keeps no line/column state. Imports nothing.
//
// Implements: ENT-Issue — lines are separated by LF, CRLF or a lone CR (each one break; a
// trailing break starts a new, empty line); columns count Unicode code points; a leading
// byte-order mark is not counted; `offset` is 0-based in code points after any byte-order mark.
import type { LineEnding } from './text';

export interface Position {
  line: number;
  column: number;
  /** Code-point offset from the start of the document, after any byte-order mark. */
  offset: number;
}

/**
 * Resolves positions while chunks stream through `feed`; `end` resolves any position at or
 * past the end of the text. `lineEnding` is the document's: in the editor (and the worker
 * mirror) every break is one '\n', but in the document a CRLF break is two code points.
 */
export class PositionResolver {
  private readonly order: number[];
  private readonly result: Position[];
  private k = 0;
  private base = 0;
  private line = 1;
  private column = 1;
  private cp = 0;
  private prevCR = false;
  private prevHigh = false;
  private readonly lfUnits: number;

  constructor(
    private readonly positions: readonly number[],
    lineEnding: LineEnding = 'lf',
  ) {
    this.order = positions.map((_, i) => i).sort((a, b) => positions[a]! - positions[b]!);
    this.result = new Array<Position>(positions.length);
    this.lfUnits = lineEnding === 'crlf' ? 2 : 1;
  }

  /** True when every position has been resolved. */
  get done(): boolean {
    return this.k >= this.order.length;
  }

  feed(s: string): boolean {
    const n = s.length;
    let i = 0;
    while (this.k < this.order.length) {
      const target = this.positions[this.order[this.k]!]! - this.base;
      const stop = target < n ? target : n;
      for (; i < stop; i++) {
        const c = s.charCodeAt(i);
        if (c === 10) {
          if (this.prevCR)
            this.cp += 1; // the LF of a CRLF break
          else {
            this.line++;
            this.column = 1;
            this.cp += this.lfUnits;
          }
          this.prevCR = false;
          this.prevHigh = false;
        } else if (c === 13) {
          this.line++;
          this.column = 1;
          this.cp += 1;
          this.prevCR = true;
          this.prevHigh = false;
        } else {
          this.prevCR = false;
          if (c >= 0xdc00 && c <= 0xdfff && this.prevHigh) {
            this.prevHigh = false; // second half of a surrogate pair: same code point
          } else if (c === 0xfeff && this.base + i === 0) {
            // a leading byte-order mark is not counted
          } else {
            this.column++;
            this.cp++;
            this.prevHigh = c >= 0xd800 && c <= 0xdbff;
          }
        }
      }
      if (target >= n) break;
      this.result[this.order[this.k]!] = { line: this.line, column: this.column, offset: this.cp };
      this.k++;
    }
    this.base += n;
    return this.done;
  }

  end(): Position[] {
    while (this.k < this.order.length) {
      this.result[this.order[this.k]!] = { line: this.line, column: this.column, offset: this.cp };
      this.k++;
    }
    return this.result;
  }
}

/** Resolves editor positions in `chunks` (any chunking) to ENT-Issue positions. */
export function resolvePositions(
  chunks: Iterable<string>,
  positions: readonly number[],
  lineEnding: LineEnding = 'lf',
): Position[] {
  const r = new PositionResolver(positions, lineEnding);
  for (const chunk of chunks) if (r.feed(chunk)) break;
  return r.end();
}
