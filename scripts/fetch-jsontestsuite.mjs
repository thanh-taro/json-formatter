// Fetches the JSONTestSuite corpus (DEP-24, MIT) at a pinned commit into
// tests/fixtures/JSONTestSuite/ (gitignored). Conformance tests skip when it is absent.
// Usage: pnpm fixtures:jsontestsuite [--force]
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { abs, rel } from './lib/util.mjs';

export const JSONTESTSUITE_COMMIT = '1ef36fa01286573e846ac449e8683f8833c5b26a'; // master, 2024-11-22
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
const sha = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
console.log(`JSONTestSuite ${JSONTESTSUITE_COMMIT.slice(0, 7)}: ${count} cases → ${rel(DEST)} (tgz sha256 ${sha}…)`);
