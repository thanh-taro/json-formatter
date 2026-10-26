// Size gate (NFR-05, architecture.md "Budgets"): compressed critical path of dist/index.html —
// the HTML plus every script, module preload and stylesheet it references — must stay within
// budget. Measured with gzip (the larger of gzip/brotli in practice), 1 KB = 1,000 bytes.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { abs } from './lib/util.mjs';

// NFR-05: ≤ 250 KB compressed critical path; fonts ≤ 90 KB (architecture.md "Budgets", ADR-0014 §7:
// Latin + Vietnamese subsets of both faces, all requested at startup).
const BUDGET = { total: 250_000, js: 250_000, fonts: 90_000 };
const DIST = abs('dist');
const html = fs.readFileSync(path.join(DIST, 'index.html'));
const refs = [...html.toString().matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="(\/[^"]+)"/g)].map((m) => m[1]);
const gz = (buf) => zlib.gzipSync(buf, { level: 9 }).length;

const rows = [['index.html', gz(html)]];
for (const ref of new Set(refs)) {
  if (!/\.(js|css)$/.test(ref)) continue;
  rows.push([ref.slice(1), gz(fs.readFileSync(path.join(DIST, ref)))]);
}
const total = rows.reduce((s, [, n]) => s + n, 0);
const js = rows.filter(([f]) => f.endsWith('.js')).reduce((s, [, n]) => s + n, 0);
const kb = (n) => `${(n / 1000).toFixed(1)} KB`;
for (const [f, n] of rows) console.log(`${kb(n).padStart(9)}  ${f}`);
console.log(`critical path ${kb(total)} / ${kb(BUDGET.total)} (JS ${kb(js)} / ${kb(BUDGET.js)})`);
// WOFF2 is already compressed: its file size is what is transferred.
const fonts = fs
  .readdirSync(path.join(DIST, 'assets'))
  .filter((f) => f.endsWith('.woff2'))
  .reduce((s, f) => s + fs.statSync(path.join(DIST, 'assets', f)).size, 0);
console.log(`fonts ${kb(fonts)} / ${kb(BUDGET.fonts)}`);
if (total > BUDGET.total || js > BUDGET.js || fonts > BUDGET.fonts) {
  console.error('size: over budget (NFR-05)');
  process.exit(1);
}
