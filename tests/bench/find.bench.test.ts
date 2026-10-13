// ADR-0004 / NFR-02 benchmark of the MOD-Editor find engine (review F-010 M1): the largest piece
// of work between two time checks — one step of a 1 MB window: slice, case fold, scan — must fit
// the 8 ms main-thread slice, also when non-ASCII letters ("İ", accented, astral) are dense. The
// whole-window time is printed for reference. Run with `pnpm bench` on an idle machine.
import { Text } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { FIND_SLICE_MS, FIND_WINDOW, FindIndex } from '../../src/editor/find';

const RUNS = 5;
const windowOf = (unit: string) => unit.repeat(Math.ceil(FIND_WINDOW / unit.length)).slice(0, FIND_WINDOW);

/** Median over RUNS of `fn`'s own measurement, or of its duration when it returns nothing. */
function median(fn: () => number | void): number {
  fn(); // warm up
  const times: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    const own = fn();
    times.push(typeof own === 'number' ? own : performance.now() - t0);
  }
  return times.sort((a, b) => a - b)[RUNS >> 1]!;
}

describe('find engine window cost (ADR-0004)', () => {
  const cases = {
    ascii: '  {"id": 100001, "name": "item-x", "ok": true},\n',
    'İ on every row': '  {"id": 100001, "city": "İstanbul", "name": "Ölçü", "ok": true},\n',
    'dense non-ASCII': 'İstanbul 𐐀Ölçü Σ ',
  };
  for (const [name, unit] of Object.entries(cases)) {
    it(`RULE-18 NFR-02 a step of a 1 MB window (${name}) fits the ${FIND_SLICE_MS} ms slice`, () => {
      const source = Text.of(windowOf(unit).split('\n'));
      const whole = median(() => void new FindIndex(source, 'ölçü', false).scanNext());
      const step = median(() => {
        const index = new FindIndex(source, 'ölçü', false);
        let worst = 0;
        for (let done = false; !done;) {
          const t0 = performance.now();
          done = index.scanStep();
          worst = Math.max(worst, performance.now() - t0);
        }
        return worst;
      });
      console.log(`find ${name}: window ${whole.toFixed(2)} ms, worst step ${step.toFixed(2)} ms`);
      expect(step).toBeLessThan(FIND_SLICE_MS);
    });
  }
});
