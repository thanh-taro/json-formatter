// MOD-Core pure text helpers shared by the worker and the main thread (ADR-0005, ADR-0006).
// Imports nothing; no DOM.

/** Sizes are UTF-8 bytes; 1 MB = 1,000,000 bytes (specs/10-domain/rules.md). */
export const MB = 1_000_000;

/** Size tier of ENT-Document (RULE-02). */
export type Tier = 'normal' | 'large' | 'very-large';

/** Line ending of ENT-Document: the dominant one of the text, LF when there is none (RULE-17). */
export type LineEnding = 'lf' | 'crlf';

// Implements: RULE-02 — normal ≤ 10 MB, large > 10 MB to 100 MB, very large > 100 MB.
export function tierOf(bytes: number): Tier {
  if (bytes > 100 * MB) return 'very-large';
  if (bytes > 10 * MB) return 'large';
  return 'normal';
}

/** True for the tiers in which tool operations keep Blob undo snapshots and only the last 3
 * tool operations are kept (RULE-15, ADR-0006). */
export function isLargeTier(tier: Tier): boolean {
  return tier !== 'normal';
}

/** The text of a line ending. */
export function eolText(eol: LineEnding): string {
  return eol === 'crlf' ? '\r\n' : '\n';
}

/**
 * UTF-8 byte length of `s` without encoding it (platform-mapping: "a counting loop over the
 * string, no copy"). Lone surrogates count as U+FFFD (3 bytes), as TextEncoder writes them.
 */
export function utf8Length(s: string): number {
  let n = 0;
  const len = s.length;
  for (let i = 0; i < len; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < len) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        n += 4;
        i++;
      } else n += 3;
    } else n += 3;
  }
  return n;
}

/** Counts of each kind of line break in a text. */
export interface BreakCounts {
  lf: number;
  crlf: number;
  /** Lone CR: a line break for the editor and ENT-Issue, but neither LF nor CRLF (RULE-17). */
  cr: number;
}

/**
 * Streaming line-break counter: feed the text in any chunks (a CRLF may be split between two
 * chunks), then `end()`. Also tracks whether the text ends with a line break and the UTF-8
 * length of everything except the line breaks (so the document's size can be computed for any
 * line ending: `nonBreakBytes + breaks × eol length`).
 */
export class LineBreakScanner {
  readonly counts: BreakCounts = { lf: 0, crlf: 0, cr: 0 };
  nonBreakBytes = 0;
  endsWithLineBreak = false;
  private pendingCR = false;
  /** A high surrogate ended the previous chunk; its pair may start the next one. */
  private pendingHigh = false;

  feed(s: string): void {
    const len = s.length;
    if (!len) return;
    let i = 0;
    if (this.pendingCR) {
      this.pendingCR = false;
      if (s.charCodeAt(0) === 10) {
        this.counts.crlf++;
        i = 1;
      } else this.counts.cr++;
    }
    if (this.pendingHigh) {
      this.pendingHigh = false;
      const c = s.charCodeAt(i);
      if (c >= 0xdc00 && c <= 0xdfff) {
        this.nonBreakBytes += 4;
        i++;
      } else this.nonBreakBytes += 3;
    }
    let bytes = 0;
    for (; i < len; i++) {
      const c = s.charCodeAt(i);
      if (c < 0x80) {
        if (c === 10) this.counts.lf++;
        else if (c === 13) {
          if (i + 1 === len) this.pendingCR = true;
          else if (s.charCodeAt(i + 1) === 10) {
            this.counts.crlf++;
            i++;
          } else this.counts.cr++;
        } else bytes += 1;
      } else if (c < 0x800) bytes += 2;
      else if (c >= 0xd800 && c <= 0xdbff) {
        if (i + 1 === len) this.pendingHigh = true;
        else {
          const d = s.charCodeAt(i + 1);
          if (d >= 0xdc00 && d <= 0xdfff) {
            bytes += 4;
            i++;
          } else bytes += 3;
        }
      } else bytes += 3;
    }
    this.nonBreakBytes += bytes;
    const last = s.charCodeAt(len - 1);
    this.endsWithLineBreak = last === 10 || last === 13;
  }

  end(): this {
    if (this.pendingCR) {
      this.pendingCR = false;
      this.counts.cr++;
    }
    if (this.pendingHigh) {
      this.pendingHigh = false;
      this.nonBreakBytes += 3;
    }
    return this;
  }

  get breaks(): number {
    return this.counts.lf + this.counts.crlf + this.counts.cr;
  }
}

// Implements: RULE-17 — dominant of LF and CRLF, ties → LF; LF when there are none.
export function dominantLineEnding(counts: Pick<BreakCounts, 'lf' | 'crlf'>): LineEnding {
  return counts.crlf > counts.lf ? 'crlf' : 'lf';
}

/** Size in UTF-8 bytes of a text whose line breaks are all written as `eol`. */
export function documentBytes(nonBreakBytes: number, breaks: number, eol: LineEnding): number {
  return nonBreakBytes + breaks * (eol === 'crlf' ? 2 : 1);
}
