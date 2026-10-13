// Property-based harness smoke (fast-check, ADR-0010). The INV-01 round-trip properties are
// written with MOD-Core (F-002, F-003); this only proves the runner and arbitraries work.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

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
