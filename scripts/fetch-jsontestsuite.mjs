// Fetches the JSONTestSuite corpus (DEP-24, MIT) at a pinned commit into
// tests/fixtures/JSONTestSuite/ (gitignored). Conformance tests skip when it is absent.
// The tarball must match the pinned SHA-256 before anything is extracted (supply chain,
// ADR-0001 rule 7). If GitHub ever re-compresses its archives the hash changes: compare the
// extracted test_parsing/ with the upstream commit before re-pinning.
// Usage: pnpm fixtures:jsontestsuite [--force]
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { abs, rel } from './lib/util.mjs';

export const JSONTESTSUITE_COMMIT = '1ef36fa01286573e846ac449e8683f8833c5b26a'; // master, 2024-11-22
export const JSONTESTSUITE_SHA256 = '32ab2fb37cc26679dbd9164dbb7053bcef10134643d53cb0cef45de7680dcdcc';
const URL_TGZ = `https://codeload.github.com/nst/JSONTestSuite/tar.gz/${JSONTESTSUITE_COMMIT}`;
const DEST = abs('tests/fixtures/JSONTestSuite');
const STAMP = path.join(DEST, 'COMMIT');

if (
  !process.argv.includes('--force') &&
  fs.existsSync(STAMP) &&
  fs.readFileSync(STAMP, 'utf8').trim() === JSONTESTSUITE_COMMIT
) {
  console.log(`JSONTestSuite ${JSONTESTSUITE_COMMIT.slice(0, 7)} already present in ${rel(DEST)}`);
  process.exit(0);
}

const res = await fetch(URL_TGZ);
if (!res.ok) throw new Error(`download failed: ${res.status} ${URL_TGZ}`);
const buf = Buffer.from(await res.arrayBuffer());
const sha = crypto.createHash('sha256').update(buf).digest('hex');
if (sha !== JSONTESTSUITE_SHA256) {
  console.error(
    `JSONTestSuite: tarball sha256 ${sha} does not match the pinned ${JSONTESTSUITE_SHA256}; not extracted.`,
  );
  process.exit(1);
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsontestsuite-'));
const tgz = path.join(tmp, 'suite.tgz');
fs.writeFileSync(tgz, buf);
const top = `JSONTestSuite-${JSONTESTSUITE_COMMIT}`;
execFileSync('tar', ['-xzf', tgz, '-C', tmp, `${top}/test_parsing`, `${top}/LICENSE`]);

fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });
fs.cpSync(path.join(tmp, top, 'test_parsing'), path.join(DEST, 'test_parsing'), { recursive: true });
fs.copyFileSync(path.join(tmp, top, 'LICENSE'), path.join(DEST, 'LICENSE'));
fs.writeFileSync(STAMP, JSONTESTSUITE_COMMIT + '\n');
fs.rmSync(tmp, { recursive: true, force: true });

const count = fs.readdirSync(path.join(DEST, 'test_parsing')).length;
console.log(
  `JSONTestSuite ${JSONTESTSUITE_COMMIT.slice(0, 7)}: ${count} cases → ${rel(DEST)} (tgz sha256 ${sha.slice(0, 16)}… verified)`,
);
