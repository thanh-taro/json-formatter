// MOD-Core re-indent (RULE-09, ADR-0005 §1 "two line-based passes: detect unit, convert, valid
// or not"). Pure and streaming: both passes consume the text as any sequence of string chunks
// (a line, or its indentation, may span chunks) with '\n' line breaks (editor positions; the
// worker mirror normalises CRLF and lone CR). Only the leading run of spaces and tabs of each
// line is ever rewritten; every other character, and every line break, is passed through as is.
// Implements: F-004.R1, F-004.R2, F-004.R3, F-004.R5; RULE-09.

/** ENT-IndentStyle (RULE-01): 1–8 spaces, or one tab. */
export type IndentStyle = { kind: 'spaces'; width: number } | { kind: 'tab' };

/** The detected source unit of RULE-09. */
export interface SourceUnit {
  /** True when the unit is one tab (more indented lines start with a tab than with a space). */
  tab: boolean;
  /** N: spaces per unit, also when the unit is a tab; null when no line has leading spaces
   * (then leading spaces are kept unchanged, RULE-09). */
  spaces: number | null;
}

/** Facts gathered by the detection pass (non-blank lines only). */
export interface IndentStats {
  /** Indented non-blank lines whose indentation starts with a tab / with a space. */
  tabStarts: number;
  spaceStarts: number;
  /** Positive increases of the leading-space count between consecutive non-blank lines → how often. */
  increases: Map<number, number>;
  /** Leading-space counts of non-blank lines → how many lines (for the size of the result). */
  spaceCounts: Map<number, number>;
  /** Total tabs in the indentation of non-blank lines. */
  tabs: number;
}

const SPACE = 32;
const TAB = 9;
const LF = 10;

const bump = (m: Map<number, number>, k: number) => m.set(k, (m.get(k) ?? 0) + 1);

/**
 * Pass 1 — detection. Feed chunks, then `end()`. A line's *leading-space count* is the number of
 * spaces in its leading indentation (RULE-09); a line that holds only spaces and tabs is blank
 * and takes no part.
 */
export class IndentScanner {
  private readonly stats: IndentStats = {
    tabStarts: 0,
    spaceStarts: 0,
    increases: new Map(),
    spaceCounts: new Map(),
    tabs: 0,
  };
  /** Inside the leading indentation of the current line. */
  private inIndent = true;
  private first = 0;
  private t = 0;
  private s = 0;
  /** Leading-space count of the previous non-blank line (−1: none yet). */
  private prev = -1;

  feed(chunk: string): void {
    const len = chunk.length;
    let i = 0;
    while (i < len) {
      if (this.inIndent) {
        const c = chunk.charCodeAt(i);
        if (c === SPACE || c === TAB) {
          if (this.t + this.s === 0) this.first = c;
          if (c === SPACE) this.s++;
          else this.t++;
          i++;
          continue;
        }
        if (c === LF) {
          this.reset(); // blank line
          i++;
          continue;
        }
        this.line();
        this.inIndent = false;
      }
      const nl = chunk.indexOf('\n', i);
      if (nl < 0) return;
      i = nl + 1;
      this.reset();
    }
  }

  /** The current line is non-blank: record it. */
  private line(): void {
    const st = this.stats;
    if (this.t + this.s > 0) {
      if (this.first === TAB) st.tabStarts++;
      else st.spaceStarts++;
    }
    st.tabs += this.t;
    if (this.s > 0) bump(st.spaceCounts, this.s);
    if (this.prev >= 0 && this.s > this.prev) bump(st.increases, this.s - this.prev);
    this.prev = this.s;
  }

  private reset(): void {
    this.inIndent = true;
    this.t = 0;
    this.s = 0;
  }

  end(): IndentStats {
    // a last line without a line break: only indentation → blank, otherwise recorded already
    this.reset();
    return this.stats;
  }
}

/** Implements: RULE-09 source unit — null when no line is indented. */
export function detectUnit(stats: IndentStats): SourceUnit | null {
  if (stats.tabStarts + stats.spaceStarts === 0) return null;
  const tab = stats.tabStarts > stats.spaceStarts;
  let spaces: number | null = null;
  // most frequent positive increase, ties → the smaller N
  let best = 0;
  for (const [n, count] of stats.increases)
    if (count > best || (count === best && spaces !== null && n < spaces)) {
      best = count;
      spaces = n;
    }
  // no increase: the smallest positive leading-space count
  if (spaces === null) for (const n of stats.spaceCounts.keys()) if (spaces === null || n < spaces) spaces = n;
  return { tab, spaces };
}

/** Units and kept spaces of an indentation of `t` tabs and `s` spaces (RULE-09 conversion). */
function convert(t: number, s: number, unit: SourceUnit): { units: number; rest: number } {
  if (unit.spaces === null) return { units: t, rest: s };
  return { units: t + Math.floor(s / unit.spaces), rest: s % unit.spaces };
}

const widthOf = (target: IndentStyle) => (target.kind === 'tab' ? 1 : target.width);

/**
 * Change in length (UTF-16 units = UTF-8 bytes: indentation is ASCII) of the re-indented text,
 * computed from the detection pass alone — for the RULE-02 check before converting (F-004.R7).
 */
export function reindentDelta(stats: IndentStats, unit: SourceUnit, target: IndentStyle): number {
  const w = widthOf(target);
  let delta = stats.tabs * (w - 1);
  if (unit.spaces !== null)
    for (const [s, lines] of stats.spaceCounts) {
      const { units, rest } = convert(0, s, unit);
      delta += lines * (units * w + rest - s);
    }
  return delta;
}

/**
 * Pass 2 — conversion. `feed(chunk)` returns the converted text of everything up to the last
 * complete decision (indentation still being read is held back); `end()` returns the rest.
 * Concatenating every returned string gives the re-indented text.
 */
export class Reindenter {
  private readonly unitText: string;
  private inIndent = true;
  /** The original indentation read so far on the current line (kept for blank lines). */
  private held: string[] = [];
  private t = 0;
  private s = 0;
  private readonly cache = new Map<string, string>();

  constructor(
    private readonly unit: SourceUnit,
    target: IndentStyle,
  ) {
    this.unitText = target.kind === 'tab' ? '\t' : ' '.repeat(target.width);
  }

  private prefix(): string {
    const key = `${this.t},${this.s}`;
    let p = this.cache.get(key);
    if (p === undefined) {
      const { units, rest } = convert(this.t, this.s, this.unit);
      p = this.unitText.repeat(units) + ' '.repeat(rest);
      if (this.cache.size < 4096) this.cache.set(key, p);
    }
    return p;
  }

  feed(chunk: string): string {
    const out: string[] = [];
    const len = chunk.length;
    let i = 0;
    while (i < len) {
      if (this.inIndent) {
        const start = i;
        while (i < len) {
          const c = chunk.charCodeAt(i);
          if (c === SPACE) this.s++;
          else if (c === TAB) this.t++;
          else break;
          i++;
        }
        if (i > start) this.held.push(chunk.slice(start, i));
        if (i === len) break; // indentation may continue in the next chunk
        if (chunk.charCodeAt(i) === LF) {
          // Implements: RULE-09 — blank lines are unchanged.
          for (const h of this.held) out.push(h);
          out.push('\n');
          this.held = [];
          this.t = this.s = 0;
          i++;
          continue;
        }
        out.push(this.t + this.s ? this.prefix() : '');
        this.held = [];
        this.t = this.s = 0;
        this.inIndent = false;
      }
      const nl = chunk.indexOf('\n', i);
      if (nl < 0) {
        out.push(chunk.slice(i));
        break;
      }
      out.push(chunk.slice(i, nl + 1));
      i = nl + 1;
      this.inIndent = true;
    }
    return out.join('');
  }

  end(): string {
    // a last line of only indentation is blank: unchanged
    const rest = this.held.join('');
    this.held = [];
    return rest;
  }
}

/**
 * Whole-text convenience (tests, small documents): the detected unit, or null when no line is
 * indented — then the text must stay unchanged (F-004.R5).
 */
export function reindentText(text: string, target: IndentStyle): { unit: SourceUnit; text: string } | null {
  const scan = new IndentScanner();
  scan.feed(text);
  const unit = detectUnit(scan.end());
  if (!unit) return null;
  const r = new Reindenter(unit, target);
  return { unit, text: r.feed(text) + r.end() };
}
