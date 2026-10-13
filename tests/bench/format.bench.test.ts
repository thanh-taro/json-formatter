// NFR-03 benchmark of MOD-Core beautify and minify in isolation (ADR-0005, ADR-0010): 10 MB ≤ 1 s,
// 100 MB ≤ 10 s on the reference machine. Run with `pnpm bench`; medians are printed and written
// to tests/fixtures/generated/bench-format.txt (gitignored). Output is consumed chunk by chunk
// (flat ~1 M-unit strings) the way the worker builds its pending mirror.
import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Validator, type FormatMode } from '../../src/core';

const MB = 1_000_000;
const RUNS = 5;
const ROW_FORMATTED = '  {"id": 100123, "name": "item-x", "ok": true, "n": [1, 2.5, -3e4], "s": "caf\\u00e9"},\n';
const ROW_MINIFIED = '{"id":100123,"name":"item-x","ok":true,"n":[1,2.5,-3e4],"s":"caf\\u00e9"},';
const ROW_WIDE = '1,';

function fixture(bytes: number, row: string): string[] {
  const chunk = row.repeat(Math.floor((1 << 20) / row.length));
  const out = ['[\n'];
  for (let n = 2; n + chunk.length < bytes; n += chunk.length) out.push(chunk);
  out.push('{}]\n');
  return out;
}

function format(chunks: string[], mode: FormatMode): number {
  const t0 = performance.now();
  let units = 0;
  const v = new Validator({
    warnings: false,
    format: { mode, eol: '\n', chunkUnits: 1 << 20, emit: (c) => (units += c.length) },
  });
  for (const c of chunks) if (!v.feed(c)) break;
  if (v.end().validity !== 'valid' || units === 0) throw new Error('fixture must be valid');
  return performance.now() - t0;
}

function median(chunks: string[], mode: FormatMode): number {
  format(chunks, mode); // warm-up
  const times = Array.from({ length: RUNS }, () => format(chunks, mode)).sort((a, b) => a - b);
  return times[Math.floor(RUNS / 2)]!;
}

const MODES: [string, FormatMode][] = [
  ['beautify 2 spaces', { kind: 'beautify', indent: { kind: 'spaces', width: 2 } }],
  ['minify', { kind: 'minify' }],
];
const cases: [string, number, string][] = [
  ['formatted', 10 * MB, ROW_FORMATTED],
  ['minified', 10 * MB, ROW_MINIFIED],
  ['wide array', 10 * MB, ROW_WIDE],
  ['formatted', 100 * MB, ROW_FORMATTED],
];

describe('NFR-03 MOD-Core beautify/minify throughput', () => {
  const lines: string[] = [];
  for (const [shape, bytes, row] of cases) {
    it(`NFR-03 beautifies and minifies ${bytes / MB} MB (${shape}) within budget`, () => {
      const chunks = fixture(bytes, row);
      const budget = bytes <= 10 * MB ? 1000 : 10_000;
      for (const [name, mode] of MODES) {
        const ms = median(chunks, mode);
        const line = `${bytes / MB} MB ${shape} ${name}: median ${ms.toFixed(0)} ms (${(((bytes / MB) * 1000) / ms).toFixed(0)} MB/s)`;
        lines.push(line);
        console.log(line);
        expect(ms).toBeLessThan(budget);
      }
      mkdirSync('tests/fixtures/generated', { recursive: true });
      writeFileSync('tests/fixtures/generated/bench-format.txt', lines.join('\n') + '\n');
    }, 300_000);
  }
});
