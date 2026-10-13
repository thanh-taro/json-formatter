// NFR-08 conformance harness (JSONTestSuite, DEP-24). Skips when the corpus is not fetched.
// MOD-Core's validator replaces the platform oracle below when it lands (F-005).
import { describe, expect, it } from 'vitest';
import { hasCorpus, loadCorpus } from '../support/jsontestsuite';

describe.skipIf(!hasCorpus())('JSONTestSuite corpus', () => {
  it('smoke: corpus loads with y_/n_/i_ cases, and the platform oracle accepts every y_ case', () => {
    const cases = loadCorpus();
    const accept = cases.filter((c) => c.expect === 'accept');
    expect(accept.length).toBeGreaterThan(90);
    expect(cases.filter((c) => c.expect === 'reject').length).toBeGreaterThan(150);
    const decoder = new TextDecoder('utf-8', { fatal: true });
    for (const c of accept) expect(() => JSON.parse(decoder.decode(c.bytes)), c.name).not.toThrow();
  });
});
