// JSONTestSuite corpus loader (DEP-24, ADR-0010). Fetch it with `pnpm fixtures:jsontestsuite`.
import { existsSync, readdirSync, readFileSync } from 'node:fs';

export const CORPUS_DIR = new URL('../fixtures/JSONTestSuite/test_parsing/', import.meta.url);
export const hasCorpus = (): boolean => existsSync(CORPUS_DIR);

/** y_ must be accepted, n_ must be rejected, i_ is implementation-defined (recorded per case). */
export type Expectation = 'accept' | 'reject' | 'implementation';

export interface Case {
  name: string;
  expect: Expectation;
  bytes: Uint8Array;
}

const PREFIX: Record<string, Expectation> = { y: 'accept', n: 'reject', i: 'implementation' };

export function loadCorpus(): Case[] {
  return readdirSync(CORPUS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((name) => {
      const expect = PREFIX[name[0] ?? ''];
      if (!expect) throw new Error(`unexpected JSONTestSuite file name: ${name}`);
      return { name, expect, bytes: readFileSync(new URL(encodeURIComponent(name), CORPUS_DIR)) };
    });
}
