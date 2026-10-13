// Property-based harness smoke (fast-check, ADR-0010). The INV-01 round-trip properties are
// written with MOD-Core (F-002, F-003); this only proves the runner and arbitraries work.
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';

// Thousands of generated cases: allow for a busy machine (the 5 s default is for unit tests).
vi.setConfig({ testTimeout: 60_000 });

describe('property harness', () => {
  it('smoke: fast-check generates JSON values that the platform parser round-trips', () => {
    fc.assert(
      fc.property(fc.json(), (text) => {
        expect(JSON.stringify(JSON.parse(text))).toBe(JSON.stringify(JSON.parse(JSON.stringify(JSON.parse(text)))));
      }),
      { numRuns: 200 },
    );
  });
});
