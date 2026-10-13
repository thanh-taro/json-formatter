// The inline boot script (MOD-Host): read once, used by the Vite HTML plugin and by the
// `_headers` generator, so the CSP hash always matches the bytes that are inlined.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { abs } from './util.mjs';

export const BOOT_SOURCE = 'src/host/boot.js';

export function readBootScript() {
  const src = fs.readFileSync(abs(BOOT_SOURCE), 'utf8');
  // Drop comment-only lines and surrounding whitespace; the result is what goes into <script>.
  return src
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n')
    .trim();
}

export function bootScriptHash(code = readBootScript()) {
  return 'sha256-' + crypto.createHash('sha256').update(code, 'utf8').digest('base64');
}
