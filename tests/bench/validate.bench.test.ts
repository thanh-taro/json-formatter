// NFR-03 benchmark of MOD-Core validation in isolation (ADR-0005 "the core is benchmarked in
// isolation", ADR-0010). Not part of `pnpm test` (slow); run with `pnpm bench`. Budget on the
// reference machine: 10 MB ≤ 1 s, 100 MB ≤ 10 s. Fixtures are generated in memory. The medians
// are printed and written to tests/fixtures/generated/bench-validate.txt (gitignored).
import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PositionResolver, positionsOf, Validator } from '../../src/core';

const MB = 1_000_000;
const RUNS = 5;
const ROW_FORMATTED = '  {"id": 100123, "name": "item-x", "ok": true, "n": [1, 2.5, -3e4], "s": "caf\\u00e9"},\n';
const ROW_MINIFIED = '{"id":100123,"name":"item-x","ok":true,"n":[1,2.5,-3e4],"s":"caf\\u00e9"},';
const ROW_WIDE = '1,';

/** A valid array of about `bytes` ASCII bytes, as ~1 M-unit chunks (like the worker mirror). */
function fixture(bytes: number, row: string): string[] {
  const chunk = row.repeat(Math.floor((1 << 20) / row.length));
  const out = ['[\n'];
  for (let n = 2; n + chunk.length < bytes; n += chunk.length) out.push(chunk);
  out.push('{}]\n');
  return out;
}

/** What the worker's validate job does: validate, then resolve the reported positions. */
function validate(chunks: string[], skipTable: boolean): number {
  const t0 = performance.now();
  const v = new Validator({ skipTable });
  for (const c of chunks) if (!v.feed(c)) break;
  const outcome = v.end();
  if (outcome.validity !== 'valid') throw new Error('fixture must be valid');
  const r = new PositionResolver(positionsOf(outcome));
  for (const c of chunks) if (r.feed(c)) break;
  r.end();
  return performance.now() - t0;
}

function median(chunks: string[], skipTable: boolean): number {
  validate(chunks, skipTable); // warm-up
  const times = Array.from({ length: RUNS }, () => validate(chunks, skipTable)).sort((a, b) => a - b);
  return times[Math.floor(RUNS / 2)]!;
}

const cases: [string, number, string][] = [
  ['formatted', 10 * MB, ROW_FORMATTED],
  ['minified', 10 * MB, ROW_MINIFIED],
  ['wide array', 10 * MB, ROW_WIDE],
  ['formatted', 100 * MB, ROW_FORMATTED],
];

describe('NFR-03 MOD-Core validation throughput', () => {
  const lines: string[] = [];
  for (const [shape, bytes, row] of cases) {
    it(`NFR-03 validates ${bytes / MB} MB (${shape}) within budget`, () => {
      const chunks = fixture(bytes, row);
      const budget = bytes <= 10 * MB ? 1000 : 10_000;
      for (const skip of [false, true]) {
        const ms = median(chunks, skip);
        const line = `${bytes / MB} MB ${shape}${skip ? ' + skip table' : ''}: median ${ms.toFixed(0)} ms (${(((bytes / MB) * 1000) / ms).toFixed(0)} MB/s)`;
        lines.push(line);
        console.log(line);
        expect(ms).toBeLessThan(budget);
      }
      mkdirSync('tests/fixtures/generated', { recursive: true });
      writeFileSync('tests/fixtures/generated/bench-validate.txt', lines.join('\n') + '\n');
    }, 300_000);
  }
});
