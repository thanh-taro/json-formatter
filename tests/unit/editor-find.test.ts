// MOD-Editor find engine (ADR-0004 "Find", RULE-18, F-010): windowed literal matching with a
// length-preserving case fold, and the time-sliced find session (first match before the final
// count, next/previous with wrap, recount on change).
import { Text } from '@codemirror/state';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FindIndex, FindSession, fold, type FindHost, type FindStatus } from '../../src/editor/find';

const doc = (s: string) => Text.of(s.split('\n'));

/**
 * Reference case fold, independent of `fold`: per code point, the platform lower case, except
 * that "İ" (whose lower case is two units) stays itself and final sigma counts as sigma.
 */
const refFold = (s: string) =>
  [...s].map((c) => (c === 'İ' ? c : c.toLocaleLowerCase('und').replace('ς', 'σ'))).join('');

/** All matches of `term` in `text` per RULE-18, computed naively (the oracle). */
function oracle(text: string, term: string, matchCase: boolean): number[] {
  const out: number[] = [];
  if (!term) return out;
  for (let i = 0; i + term.length <= text.length;) {
    const a = text.slice(i, i + term.length);
    const same = matchCase ? a === term : refFold(a) === refFold(term);
    if (same) {
      out.push(i);
      i += term.length;
    } else i++;
  }
  return out;
}

/** Every match of a fully scanned index, in order. */
function all(index: FindIndex): number[] {
  while (!index.done) index.scanNext();
  return index.between(0, Number.MAX_SAFE_INTEGER);
}

/** A host with a manual scheduler: `run()` executes queued ticks; time advances by `tickMs` per window. */
function fakeHost(text: string, cursor = 0) {
  let source = doc(text);
  let at = cursor;
  let clock = 0;
  const queue: (() => void)[] = [];
  const selections: [number, number][] = [];
  const host: FindHost & {
    run: (max?: number) => number;
    setDoc: (s: string) => void;
    selections: [number, number][];
    setCursor: (n: number) => void;
  } = {
    doc: () => source,
    cursor: () => at,
    select: (from, to) => {
      selections.push([from, to]);
      at = from;
    },
    refresh: () => undefined,
    schedule: (fn) => {
      let live = true;
      queue.push(() => live && fn());
      return () => (live = false);
    },
    now: () => (clock += 5),
    run(max = Infinity) {
      let n = 0;
      while (queue.length && n < max) {
        queue.shift()!();
        n++;
      }
      return n;
    },
    setDoc: (s) => (source = doc(s)),
    selections,
    setCursor: (n) => (at = n),
  };
  return host;
}

function session(host: FindHost, term: string, matchCase = false, window = 4) {
  const statuses: FindStatus[] = [];
  const firsts: (number | null)[] = [];
  const s = new FindSession(host, term, { matchCase, window });
  s.onCount((st) => statuses.push(st));
  s.onFirst((p) => firsts.push(p));
  s.start(true);
  return { s, statuses, firsts, last: () => statuses.at(-1)! };
}

describe('RULE-18 matching', () => {
  it('RULE-18 matching is literal text: pattern characters match themselves', () => {
    const index = new FindIndex(doc('a.c abc a.c (x)* (x)*'), 'a.c', false, 4);
    expect(all(index)).toEqual([0, 8]);
    expect(all(new FindIndex(doc('a.c abc a.c (x)* (x)*'), '(x)*', false, 4))).toEqual([12, 17]);
  });

  it('RULE-18 matching is case-insensitive unless match case is on', () => {
    const text = 'Status status STATUS sTaTuS';
    expect(all(new FindIndex(doc(text), 'status', false))).toEqual([0, 7, 14, 21]);
    expect(all(new FindIndex(doc(text), 'status', true))).toEqual([7]);
    expect(all(new FindIndex(doc(text), 'STATUS', false))).toEqual([0, 7, 14, 21]);
  });

  it('RULE-18 matches never overlap (aaaa / aa → 2, aaaaa / aaa → 1)', () => {
    expect(all(new FindIndex(doc('aaaa'), 'aa', false, 1))).toEqual([0, 2]);
    expect(all(new FindIndex(doc('aaaaa'), 'aaa', false, 2))).toEqual([0]);
    expect(all(new FindIndex(doc('abababab'), 'abab', false, 3))).toEqual([0, 4]);
  });

  it('RULE-18 matches across window boundaries are found exactly once (1 MB windows)', () => {
    const W = 1 << 20;
    // "needle" straddles the first window boundary, and the second, and sits exactly on the third.
    const parts = ['x'.repeat(W - 3), 'needle', 'y'.repeat(W - 6), 'nee', 'dle', 'z'.repeat(W - 3), 'needle'];
    const text = parts.join('');
    const index = new FindIndex(doc(text), 'needle', false);
    const found = all(index);
    expect(found).toEqual([W - 3, 2 * W - 3, 3 * W]);
    expect(index.total).toBe(3);
    expect(index.windows).toBe(4);
  });

  it('RULE-18 non-overlap is kept across window boundaries (a run of "a" split by windows)', () => {
    for (let w = 1; w <= 7; w++) {
      const index = new FindIndex(doc('a'.repeat(11)), 'aa', false, w);
      expect(all(index), `window ${w}`).toEqual([0, 2, 4, 6, 8]);
    }
  });

  it('RULE-18 the case fold is length-preserving, so positions stay exact (İ, ß, final sigma)', () => {
    const text = 'İx ß ΟΔΟΣ οδος x';
    expect(fold(text).length).toBe(text.length);
    const index = new FindIndex(doc(text), 'x', false, 3);
    expect(all(index)).toEqual([1, text.length - 1]);
    // Σ and final ς fold alike
    expect(all(new FindIndex(doc(text), 'οδοσ', false))).toEqual([5, 10]);
  });

  it('RULE-18 astral capitals fold in a window that also contains "İ" (review F-010 M1)', () => {
    const text = 'İ 𐐀BC 𐐨bc';
    expect(fold(text).length).toBe(text.length);
    expect(all(new FindIndex(doc(text), '𐐨bc', false))).toEqual([2, 7]);
    expect(all(new FindIndex(doc(text), '𐐀BC', true))).toEqual([2]);
  });

  /** Fastest of 5 runs (other processes may preempt any single run). */
  const fastest = (fn: () => void) => {
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      fn();
      times.push(performance.now() - t0);
    }
    return Math.min(...times);
  };
  const MB = 1 << 20;
  const windowOf = (unit: string) => unit.repeat(Math.ceil(MB / unit.length)).slice(0, MB);
  // The absolute 8 ms slice check runs in `pnpm bench` (tests/bench/find.bench.test.ts): timing
  // assertions are unreliable while the unit suite runs files in parallel.

  it('RULE-18 ADR-0004 review F-010 M1 folding a 1 MB window full of "İ", astral and accented letters costs no more than the native lower case', () => {
    const w = windowOf('İstanbul 𐐀Ölçü Σ ');
    fold(w); // warm up
    const native = fastest(() => w.toLowerCase());
    const ours = fastest(() => fold(w));
    // the per-character fallback cost ≈ 24 ms here; splitting on "İ" stays near the native cost
    expect(ours).toBeLessThan(native * 2 + 1);
  });

  it('RULE-18 ADR-0004 review F-010 recomputing positions after the cache is evicted reads at most one step', () => {
    const text = 'ab'.repeat(5000);
    const reads: number[] = [];
    const base = doc(text);
    const source = {
      length: base.length,
      sliceString: (from: number, to?: number) => (reads.push((to ?? base.length) - from), base.sliceString(from, to)),
    };
    const index = new FindIndex(source, 'ab', false, 1000, 100);
    while (!index.done) index.scanNext();
    expect(Math.max(...reads)).toBeLessThanOrEqual(100 + 1);
    reads.length = 0;
    // cells near the start were evicted (only the last few are cached): visible range and ordinal
    expect(index.between(10, 20)).toEqual([10, 12, 14, 16, 18]);
    expect(index.ordinal(4000)).toBe(2001);
    expect(index.firstAtOrAfter(5001)).toBe(5002);
    expect(reads.length).toBeGreaterThan(0);
    expect(Math.max(...reads)).toBeLessThanOrEqual(100 + 1);
  });

  it('RULE-18 line breaks are part of the text (a term spanning lines matches)', () => {
    expect(all(new FindIndex(doc('{\n  "a": 1\n}'), '1\n}', false, 2))).toEqual([9]);
  });

  it('RULE-18 the windowed index equals a naive scan for any text, term, case, window and step', () => {
    const alpha = fc.constantFrom('a', 'A', 'b', 'é', 'É', '\n', 'ab', 'Ab', '😀', 'İ', 'i', '𐐀', '𐐨', 'Σ', 'σ', 'ς');
    fc.assert(
      fc.property(
        fc.array(alpha, { maxLength: 60 }).map((a) => a.join('')),
        fc
          .array(fc.constantFrom('a', 'A', 'b', 'é', '\n', 'İ', '𐐀', '𐐨', 'σ', 'Σ'), { minLength: 1, maxLength: 4 })
          .map((a) => a.join('')),
        fc.boolean(),
        fc.integer({ min: 1, max: 9 }),
        fc.integer({ min: 1, max: 5 }),
        (text, term, matchCase, w, step) => {
          // windows and steps inside a window both split the text at arbitrary points
          const index = new FindIndex(doc(text), term, matchCase, w, step);
          expect(all(index)).toEqual(oracle(text, term, matchCase));
          expect(index.total).toBe(oracle(text, term, matchCase).length);
        },
      ),
      { numRuns: 2000 },
    );
  });
});

describe('find session', () => {
  const three = '{"status": 1, "a": {"status": 2}, "status": 3}';

  it('F-010.AC2 with the cursor at the start, the first match after the cursor is selected and the count is 1 of 3', () => {
    const host = fakeHost(three, 0);
    const { last, firsts } = session(host, 'status');
    host.run();
    expect(firsts).toEqual([2]);
    expect(host.selections[0]).toEqual([2, 8]);
    expect(last()).toEqual({ current: 1, total: 3, done: true });
  });

  it('F-010.AC2 RULE-18 the first match is the first one at or after the cursor', () => {
    const host = fakeHost(three, 10);
    const { last } = session(host, 'status');
    host.run();
    expect(host.selections[0]).toEqual([21, 27]);
    expect(last()).toEqual({ current: 2, total: 3, done: true });
  });

  it('F-010.AC3 RULE-18 from match 3 of 3, next selects match 1 (wraps); previous from 1 selects 3', () => {
    const host = fakeHost(three, 0);
    const { s, last } = session(host, 'status');
    host.run();
    s.next();
    s.next();
    expect(last().current).toBe(3);
    s.next();
    expect(last()).toEqual({ current: 1, total: 3, done: true });
    expect(host.selections.at(-1)).toEqual([2, 8]);
    s.previous();
    expect(last().current).toBe(3);
    s.previous();
    expect(last().current).toBe(2);
  });

  it('F-010.AC4 when the document does not contain the term, the status is no match (total 0, done)', () => {
    const host = fakeHost(three, 0);
    const { last, firsts } = session(host, 'xyz');
    host.run();
    expect(last()).toEqual({ current: null, total: 0, done: true });
    expect(firsts).toEqual([null]);
    expect(host.selections).toEqual([]);
  });

  it('F-010.AC5 with match case on, only "status" matches, not "Status"', () => {
    const host = fakeHost('{"Status": 1, "status": 2}', 0);
    const { last } = session(host, 'status', true);
    host.run();
    expect(last()).toEqual({ current: 1, total: 1, done: true });
    expect(host.selections[0]).toEqual([15, 21]);
  });

  it('F-010.AC8 with match case off, "Status" and "status" both match: 1 of 2', () => {
    const host = fakeHost('{"Status": 1, "status": 2}', 0);
    const { last } = session(host, 'status');
    host.run();
    expect(last()).toEqual({ current: 1, total: 2, done: true });
  });

  it('F-010.AC9 RULE-18 in "aaaa", "aa" counts 1 of 2', () => {
    const host = fakeHost('aaaa', 0);
    const { last } = session(host, 'aa', false, 1);
    host.run();
    expect(last()).toEqual({ current: 1, total: 2, done: true });
  });

  it('F-010.AC10 after an occurrence is deleted, the matches are recounted: of 2', () => {
    const host = fakeHost(three, 0);
    const { s, last } = session(host, 'status');
    host.run();
    expect(last().total).toBe(3);
    host.setDoc('{"status": 1, "a": {"x": 2}, "status": 3}');
    host.setCursor(22);
    s.restart();
    host.run();
    expect(last()).toEqual({ current: 2, total: 2, done: true });
    // the recount does not move the selection
    expect(host.selections).toHaveLength(1);
    // next selects the current (not yet selected) match first, then moves on
    s.next();
    expect(host.selections.at(-1)).toEqual([30, 36]);
    s.next();
    expect(host.selections.at(-1)).toEqual([2, 8]);
  });

  it('F-010.AC6 F-010.R6 the first match is reported before the total is final, in time slices', () => {
    // 64 windows of 4 units; the scan yields every ~8 ms (each now() call advances 5 ms).
    const text = 'ab' + 'x'.repeat(250) + 'ab' + 'y'.repeat(2) + 'ab';
    const host = fakeHost(text, 0);
    const { statuses, firsts } = session(host, 'ab');
    host.run(1);
    expect(firsts).toEqual([0]);
    expect(statuses.at(-1)).toMatchObject({ current: 1, done: false });
    const ticks = host.run();
    expect(ticks).toBeGreaterThan(5);
    expect(statuses.at(-1)).toEqual({ current: 1, total: 3, done: true });
  });

  it('F-010.R3 next while counting waits for the scan to reach the next match', () => {
    const text = 'ab' + 'x'.repeat(250) + 'ab';
    const host = fakeHost(text, 0);
    const { s, statuses } = session(host, 'ab');
    host.run(1);
    s.next();
    expect(host.selections).toHaveLength(1);
    host.run();
    expect(host.selections.at(-1)).toEqual([252, 254]);
    expect(statuses.at(-1)).toEqual({ current: 2, total: 2, done: true });
  });

  it('F-010.R3 previous from the first match while counting wraps to the last once counted', () => {
    const text = 'ab' + 'x'.repeat(100) + 'ab' + 'x'.repeat(100) + 'ab';
    const host = fakeHost(text, 0);
    const { s, statuses } = session(host, 'ab');
    host.run(1);
    s.previous();
    host.run();
    expect(host.selections.at(-1)).toEqual([204, 206]);
    expect(statuses.at(-1)).toEqual({ current: 3, total: 3, done: true });
  });

  it('F-010.R3 review F-010 m2 a recount keeps the previous count and highlights until its first match is known', () => {
    const text = 'x'.repeat(200) + 'ab' + 'x'.repeat(10) + 'ab';
    const host = fakeHost(text, 205);
    const { s, statuses } = session(host, 'ab');
    host.run();
    expect(statuses.at(-1)).toEqual({ current: 2, total: 2, done: true });
    const n = statuses.length;
    s.restart();
    host.run(1); // scanned only the first windows: the first match after the cursor is not known yet
    expect(statuses.length).toBe(n);
    expect(s.visible(200, 216)).toBeNull();
    host.run();
    expect(statuses.at(-1)).toEqual({ current: 2, total: 2, done: true });
    expect(s.visible(200, 216)).toEqual({ matches: [200, 212], current: 212, length: 2 });
  });

  it('F-010.R1 closing stops the scan and clears the matches', () => {
    const host = fakeHost('ab'.repeat(500), 0);
    const { s, statuses } = session(host, 'ab');
    host.run(1);
    const n = statuses.length;
    s.close();
    host.run();
    expect(statuses.length).toBe(n);
    expect(s.visible(0, 1000)).toEqual({ matches: [], current: null, length: 2 });
  });

  it('F-010.R2 visible() returns only matches overlapping the range, and the current one', () => {
    const host = fakeHost('ab..ab..ab..ab', 0);
    const { s } = session(host, 'ab', false, 3);
    host.run();
    expect(s.visible(5, 9)).toEqual({ matches: [4, 8], current: 0, length: 2 });
    expect(s.visible(11, 14)).toEqual({ matches: [12], current: 0, length: 2 });
  });
});
