// MOD-Editor find engine (ADR-0004 "Find", architecture.md "Find (F-010)"): literal search over
// the editor's text in ~1 MB windows, time-sliced on the main thread, first match reported as soon
// as it is found and the total counted in later slices. The stock search package is not used
// (synchronous, seconds at 50–100 MB, no count).
//
// Memory: only a start, a count and a resume position per cell (≤ 256 K units) are kept (≈ 400
// cells at 100 MB); match positions are recomputed per cell on demand (a few cached), so a term
// with millions of matches costs no per-match memory.

/** Window size in editor positions (architecture.md tunables: find window 1 MB). */
export const FIND_WINDOW = 1 << 20;
/** Main-thread time slice (architecture.md tunables: find slice 8 ms). */
export const FIND_SLICE_MS = 8;
/** Units lower-cased and scanned per step inside a window (bounds one piece of work). */
export const FIND_STEP = 1 << 18;
/** Cells whose match positions stay cached (the visible range and the current match). */
const CACHED_CELLS = 16;

/** The part of the editor's `Text` the engine reads. */
export interface FindSource {
  readonly length: number;
  sliceString(from: number, to?: number): string;
}

/**
 * Implements: RULE-18 (case-insensitive) — a length-preserving case fold, so a position in the
 * folded text is the same position in the document (ADR-0004). Only "İ" (U+0130) grows under
 * lower-casing; it is kept as it is and the parts between are lower-cased natively (fast, and
 * astral letters fold too). Final sigma folds like sigma.
 */
export function fold(s: string): string {
  let lower = s.includes('İ')
    ? s
        .split('İ')
        .map((part) => part.toLowerCase())
        .join('İ')
    : s.toLowerCase();
  if (lower.length !== s.length) {
    // Defensive (no other expanding lower case exists today): fold per code point, keeping any
    // character whose lower case would change the length.
    let out = '';
    for (const c of s) {
      const l = c.toLowerCase();
      out += l.length === c.length ? l : c;
    }
    lower = out;
  }
  return lower.includes('ς') ? lower.replaceAll('ς', 'σ') : lower;
}

/** The first index in sorted `a` whose value is ≥ `x`. */
function lowerBound(a: readonly number[], x: number): number {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (a[mid]! < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Implements: RULE-18 — the matches of one term in one version of the document: literal,
 * case-insensitive unless `matchCase`, never overlapping (leftmost first, scanning from the start
 * of the document). The text is scanned in cells: windows of ~1 MB, each split into steps of
 * ≤ FIND_STEP units, so every piece of main-thread work — counting, or recomputing a cell's match
 * positions for the visible range or for next/previous — is bounded (review F-010 M1). A match
 * may run into the next cell, whose scan then resumes after it.
 */
export class FindIndex {
  readonly windows: number;
  readonly termLength: number;
  private readonly needle: string;
  /** Start of each scanned cell (sorted). */
  private readonly cellFrom: number[] = [];
  /** Where the leftmost-first scan resumes in each scanned cell (≥ its start). */
  private readonly cellResume: number[] = [];
  /** prefix[c]: matches in cells before c (prefix.length = scanned cells + 1). */
  private readonly prefix: number[] = [0];
  /** The next cell to scan. */
  private next = { from: 0, resume: 0 };
  private readonly cache = new Map<number, number[]>();

  constructor(
    private readonly src: FindSource,
    term: string,
    readonly matchCase: boolean,
    readonly window = FIND_WINDOW,
    readonly step = FIND_STEP,
  ) {
    this.needle = matchCase ? term : fold(term);
    this.termLength = term.length;
    this.windows = Math.max(1, Math.ceil(src.length / window));
  }

  get done(): boolean {
    return this.next.from >= this.src.length;
  }
  /** Matches counted so far (final once `done`). */
  get total(): number {
    return this.prefix[this.cells]!;
  }
  private get cells(): number {
    return this.cellFrom.length;
  }

  /** Scans the rest of the current window and returns its index. */
  scanNext(): number {
    const k = Math.floor(this.next.from / this.window);
    while (!this.scanStep());
    return k;
  }

  /**
   * Scans the next cell (≤ FIND_STEP units, never across a window boundary); returns true when a
   * window is complete or the document is.
   */
  scanStep(): boolean {
    if (this.done) return true;
    const { from, resume } = this.next;
    const windowEnd = (Math.floor(from / this.window) + 1) * this.window;
    const end = Math.min(this.src.length, from + this.step, windowEnd);
    const positions: number[] = [];
    const after = this.scanRange(resume, end, positions);
    this.prefix.push(this.total + positions.length);
    this.cellFrom.push(from);
    this.cellResume.push(resume);
    this.remember(this.cells - 1, positions);
    this.next = { from: end, resume: after };
    return end >= windowEnd || this.done;
  }

  /**
   * Leftmost-first matches starting in [from, end), appended to `out`; returns where the scan
   * continues (after the last match, or `end`).
   */
  private scanRange(from: number, end: number, out: number[]): number {
    const L = this.termLength;
    if (L === 0 || from >= end) return Math.max(from, end);
    let text = this.src.sliceString(from, Math.min(this.src.length, end + L - 1));
    if (!this.matchCase) text = fold(text);
    let after = from;
    for (let i = text.indexOf(this.needle); i >= 0 && from + i < end; i = text.indexOf(this.needle, i + L)) {
      out.push(from + i);
      after = from + i + L;
    }
    return Math.max(after, end);
  }

  private remember(c: number, positions: number[]): void {
    this.cache.delete(c);
    this.cache.set(c, positions);
    if (this.cache.size > CACHED_CELLS) this.cache.delete(this.cache.keys().next().value!);
  }

  private count(c: number): number {
    return this.prefix[c + 1]! - this.prefix[c]!;
  }

  /** Match positions in scanned cell `c` (recomputed from its resume position: ≤ one step). */
  private matchesIn(c: number): readonly number[] {
    const hit = this.cache.get(c);
    if (hit) {
      this.remember(c, hit);
      return hit;
    }
    const end = c + 1 < this.cells ? this.cellFrom[c + 1]! : this.next.from;
    const positions: number[] = [];
    this.scanRange(this.cellResume[c]!, end, positions);
    this.remember(c, positions);
    return positions;
  }

  /** The scanned cell containing `pos` (the first or last cell when outside), -1 when none. */
  private cellOf(pos: number): number {
    let lo = 0;
    let hi = this.cells;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.cellFrom[mid]! <= pos) lo = mid + 1;
      else hi = mid;
    }
    return lo - 1;
  }

  /** The first match at or after `pos`: a position, `null` when there is none, `undefined` while unknown. */
  firstAtOrAfter(pos: number): number | null | undefined {
    for (let c = Math.max(0, this.cellOf(pos)); c < this.cells; c++) {
      if (!this.count(c)) continue;
      const ms = this.matchesIn(c);
      const i = lowerBound(ms, pos);
      if (i < ms.length) return ms[i];
    }
    return this.done ? null : undefined;
  }

  /** The last match before `pos`: a position, `null` when there is none, `undefined` while unknown. */
  lastBefore(pos: number): number | null | undefined {
    if (pos <= 0) return null;
    if (!this.done && pos - 1 >= this.next.from) return undefined;
    for (let c = this.cellOf(pos - 1); c >= 0; c--) {
      if (!this.count(c)) continue;
      const ms = this.matchesIn(c);
      const i = lowerBound(ms, pos) - 1;
      if (i >= 0) return ms[i];
    }
    return null;
  }

  /** The last match of the document, once counted. */
  last(): number | null | undefined {
    return this.done ? this.lastBefore(this.src.length + 1) : undefined;
  }

  /** 1-based number of the match at `pos` (a scanned match). */
  ordinal(pos: number): number {
    const c = this.cellOf(pos);
    return this.prefix[c]! + lowerBound(this.matchesIn(c), pos) + 1;
  }

  /** Scanned matches overlapping [from, to), in order. */
  between(from: number, to: number): number[] {
    const out: number[] = [];
    const last = this.cellOf(to - 1);
    for (let c = Math.max(0, this.cellOf(from - this.termLength + 1)); c <= last; c++) {
      if (!this.count(c)) continue;
      for (const p of this.matchesIn(c)) if (p + this.termLength > from && p < to) out.push(p);
    }
    return out;
  }
}

/** What CMP-SearchPanel shows: `current` of `total`, `+` while not `done`. */
export interface FindStatus {
  /** 1-based number of the current match, or null when there is none (yet). */
  current: number | null;
  total: number;
  done: boolean;
}

/** What the session needs from the editor (injected, so the session is testable without a view). */
export interface FindHost {
  doc(): FindSource;
  /** Start of the main selection: "the cursor" of F-010.AC2. */
  cursor(): number;
  /** Selects [from, to) and scrolls it into view. */
  select(from: number, to: number): void;
  /** Redraws the match decorations of the visible range. */
  refresh(): void;
  /** Runs `fn` after yielding to the event loop; returns a cancel function. */
  schedule(fn: () => void): () => void;
  now(): number;
  /** The session was closed. */
  closed?(): void;
}

type Want = { kind: 'first'; select: boolean } | { kind: 'next' } | { kind: 'previous' };

/**
 * Implements: F-010.R2, F-010.R3, F-010.R4, F-010.R5, F-010.R6, RULE-18 — one find term over the
 * current document: scans in ≤ 8 ms slices, selects the first match at or after the cursor as soon
 * as it is found, keeps counting, moves to the next/previous match with wrap-around, and restarts
 * (without moving the selection) when the document changes.
 */
export class FindSession {
  private index: FindIndex | null = null;
  /** Position of the current match. */
  private cur: number | null = null;
  /** Whether the current match is the selection (a recount after an edit does not select). */
  private selected = false;
  private origin = 0;
  private want: Want | null = null;
  private cancelTick: (() => void) | null = null;
  private closed = false;
  /** Since the last (re)start the first match is not known yet: the previous count and
   * highlights stay shown (no blanking per keystroke, review F-010 m2). */
  private firstPending = false;
  private readonly firstListeners: ((pos: number | null) => void)[] = [];
  private readonly countListeners: ((status: FindStatus) => void)[] = [];
  private readonly window: number;

  constructor(
    private readonly host: FindHost,
    readonly term: string,
    readonly options: { matchCase: boolean; window?: number },
  ) {
    this.window = options.window ?? FIND_WINDOW;
  }

  /** Called once per scan with the first match after the cursor (wrapping), or null when none. */
  onFirst(cb: (pos: number | null) => void): void {
    this.firstListeners.push(cb);
  }
  /** Called whenever the position or the count changes. */
  onCount(cb: (status: FindStatus) => void): void {
    this.countListeners.push(cb);
  }

  get status(): FindStatus {
    const index = this.index;
    if (!index) return { current: null, total: 0, done: true };
    return { current: this.cur === null ? null : index.ordinal(this.cur), total: index.total, done: index.done };
  }

  /**
   * Starts counting from the cursor; `select` selects the first match once found. The first
   * slice runs at once unless `defer` (an edit: the keystroke is not delayed by the scan).
   */
  start(select: boolean, defer = false): void {
    if (this.closed) return;
    this.cancelTick?.();
    this.index = new FindIndex(this.host.doc(), this.term, this.options.matchCase, this.window);
    this.cur = null;
    this.selected = false;
    this.origin = this.host.cursor();
    this.want = { kind: 'first', select };
    this.firstPending = true;
    if (defer) this.cancelTick = this.host.schedule(this.tick);
    else this.tick();
  }

  /** Implements: F-010 edge case — the document changed: recount, keeping the selection. */
  restart(): void {
    this.start(false, true);
  }

  next(): void {
    this.move('next');
  }
  previous(): void {
    this.move('previous');
  }

  private move(kind: 'next' | 'previous'): void {
    if (!this.index || this.closed) return;
    if (this.cur !== null && !this.selected) {
      // after a recount the current match is shown but not selected: select it first
      this.setCurrent(this.cur, true);
    } else if (this.cur === null) {
      if (this.want?.kind === 'first') this.want = { kind: 'first', select: true };
      else {
        this.origin = this.host.cursor();
        this.want = { kind: 'first', select: true };
      }
      this.resolve();
    } else {
      this.want = { kind };
      this.resolve();
    }
    this.emit();
    this.host.refresh();
  }

  /** Ends the session; `quiet` keeps the highlights until the next session draws its own. */
  close(quiet = false): void {
    this.closed = true;
    this.cancelTick?.();
    this.cancelTick = null;
    this.index = null;
    this.cur = null;
    this.want = null;
    this.host.closed?.();
    if (!quiet) this.host.refresh();
  }

  /**
   * Implements: F-010.R2 — matches overlapping the visible range [from, to) and the current one;
   * null while the first match after a (re)start is not known (keep what is drawn).
   */
  visible(from: number, to: number): { matches: number[]; current: number | null; length: number } | null {
    const length = this.term.length;
    if (!this.index) return { matches: [], current: null, length };
    if (this.firstPending && !this.index.done) return null;
    return { matches: this.index.between(from, to), current: this.cur, length };
  }

  private tick = (): void => {
    this.cancelTick = null;
    const index = this.index;
    if (!index || this.closed) return;
    const t0 = this.host.now();
    do {
      index.scanStep();
      this.resolve();
    } while (!index.done && this.host.now() - t0 < FIND_SLICE_MS);
    if (index.done) this.resolve();
    this.emit();
    this.host.refresh();
    if (!index.done) this.cancelTick = this.host.schedule(this.tick);
  };

  /** Serves the pending request as far as the scanned windows allow. */
  private resolve(): void {
    const index = this.index;
    const want = this.want;
    if (!index || !want) return;
    if (want.kind === 'first') {
      let p = index.firstAtOrAfter(this.origin);
      if (p === undefined) return;
      if (p === null) p = index.firstAtOrAfter(0) ?? null; // RULE-18: wraps to the start
      this.want = null;
      this.firstPending = false;
      if (p !== null) this.setCurrent(p, want.select);
      for (const cb of this.firstListeners) cb(p);
      return;
    }
    const at = this.cur ?? this.origin;
    let p = want.kind === 'next' ? index.firstAtOrAfter(at + 1) : index.lastBefore(at);
    if (p === undefined) return;
    if (p === null) {
      p = want.kind === 'next' ? index.firstAtOrAfter(0) : index.last();
      if (p === undefined) return;
    }
    this.want = null;
    if (p !== null) this.setCurrent(p, true);
  }

  private setCurrent(pos: number, select: boolean): void {
    this.cur = pos;
    this.selected = select;
    if (select) this.host.select(pos, pos + this.term.length);
  }

  private emit(): void {
    if (this.firstPending && !this.index?.done) return;
    const status = this.status;
    for (const cb of this.countListeners) cb(status);
  }
}
