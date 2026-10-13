// NFR-08 conformance (JSONTestSuite, DEP-24; ADR-0010): every y_ case is accepted and every n_
// case rejected by MOD-Core's validator; each i_ case has a recorded expectation derived from
// our rules. Files are decoded like a loaded file (fatal UTF-8 keeping a BOM, RULE-13): bytes
// that are not UTF-8 are rejected on load and never reach the validator. Skips when the corpus
// is not fetched (`pnpm fixtures:jsontestsuite`).
import { describe, expect, it, vi } from 'vitest';

// Thousands of generated cases: allow for a busy machine (the 5 s default is for unit tests).
vi.setConfig({ testTimeout: 60_000 });
import { validateText } from '../../src/core';
import { hasCorpus, loadCorpus } from '../support/jsontestsuite';

type Outcome = 'valid' | 'invalid' | 'empty' | 'not-utf8';

function check(bytes: Uint8Array): { outcome: Outcome; code?: string; warnings?: string[] } {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return { outcome: 'not-utf8' };
  }
  // Exact at any chunking: feed in 7-unit chunks.
  const chunks = text.match(/[\s\S]{1,7}/g) ?? [];
  const r = validateText(chunks);
  if (r.validity === 'invalid') return { outcome: 'invalid', code: r.issues[0]!.code };
  return { outcome: r.validity, warnings: r.issues.map((i) => i.code) };
}

/**
 * Implementation-defined cases (i_): our recorded outcome per RULE-03/05/13/14.
 * - huge/tiny numbers are valid with `unsafe-number` (RULE-05);
 * - lone or invalid surrogate escapes are valid (escapes are syntax; RULE-03);
 * - 500 nested arrays are within RULE-14;
 * - a BOM before a value is valid with a `byte-order-mark` warning (RULE-03);
 * - everything that is not UTF-8 is refused on load (RULE-13).
 */
const IMPLEMENTATION: Record<string, Outcome> = {
  i_number_double_huge_neg_exp: 'valid',
  i_number_huge_exp: 'valid',
  i_number_neg_int_huge_exp: 'valid',
  i_number_pos_double_huge_exp: 'valid',
  i_number_real_neg_overflow: 'valid',
  i_number_real_pos_overflow: 'valid',
  i_number_real_underflow: 'valid',
  i_number_too_big_neg_int: 'valid',
  i_number_too_big_pos_int: 'valid',
  i_number_very_big_negative_int: 'valid',
  i_object_key_lone_2nd_surrogate: 'valid',
  i_string_1st_surrogate_but_2nd_missing: 'valid',
  i_string_1st_valid_surrogate_2nd_invalid: 'valid',
  i_string_incomplete_surrogate_and_escape_valid: 'valid',
  i_string_incomplete_surrogate_pair: 'valid',
  i_string_incomplete_surrogates_escape_valid: 'valid',
  i_string_invalid_lonely_surrogate: 'valid',
  i_string_invalid_surrogate: 'valid',
  'i_string_inverted_surrogates_U+1D11E': 'valid',
  i_string_lone_second_surrogate: 'valid',
  i_structure_500_nested_arrays: 'valid',
  'i_structure_UTF-8_BOM_empty_object': 'valid',
  'i_string_UTF-16LE_with_BOM': 'not-utf8',
  'i_string_UTF-8_invalid_sequence': 'not-utf8',
  'i_string_UTF8_surrogate_U+D800': 'not-utf8',
  'i_string_invalid_utf-8': 'not-utf8',
  i_string_iso_latin_1: 'not-utf8',
  i_string_lone_utf8_continuation_byte: 'not-utf8',
  i_string_not_in_unicode_range: 'not-utf8',
  i_string_overlong_sequence_2_bytes: 'not-utf8',
  i_string_overlong_sequence_6_bytes: 'not-utf8',
  i_string_overlong_sequence_6_bytes_null: 'not-utf8',
  'i_string_truncated-utf-8': 'not-utf8',
  i_string_utf16BE_no_BOM: 'not-utf8',
  i_string_utf16LE_no_BOM: 'not-utf8',
};

// In CI the corpus is fetched first; a missing corpus there is a failure, not a skip.
if (process.env['CI'] && !hasCorpus()) throw new Error('JSONTestSuite corpus missing: run pnpm fixtures:jsontestsuite');

describe.skipIf(!hasCorpus())('NFR-08 JSONTestSuite conformance', () => {
  const cases = loadCorpus();

  it('NFR-08 every y_ case is accepted', () => {
    const accept = cases.filter((c) => c.expect === 'accept');
    expect(accept.length).toBeGreaterThan(90);
    const failures = accept
      .map((c) => ({ name: c.name, ...check(c.bytes) }))
      .filter((r) => r.outcome !== 'valid')
      .map((r) => `${r.name}: ${r.outcome} ${r.code ?? ''}`);
    expect(failures).toEqual([]);
  });

  it('NFR-08 every n_ case is rejected (the 0-byte document is empty per RULE-03)', () => {
    const reject = cases.filter((c) => c.expect === 'reject');
    expect(reject.length).toBeGreaterThan(150);
    const failures: string[] = [];
    for (const c of reject) {
      const r = check(c.bytes);
      // RULE-03: zero characters is empty — neither valid nor invalid (n_structure_no_data).
      if (c.bytes.length === 0) {
        if (r.outcome !== 'empty') failures.push(`${c.name}: ${r.outcome}`);
      } else if (r.outcome !== 'invalid' && r.outcome !== 'not-utf8') failures.push(`${c.name}: ${r.outcome}`);
    }
    expect(failures).toEqual([]);
  });

  it('NFR-08 every i_ case has its recorded outcome', () => {
    const impl = cases.filter((c) => c.expect === 'implementation');
    const actual = Object.fromEntries(impl.map((c) => [c.name.replace(/\.json$/, ''), check(c.bytes).outcome]));
    expect(actual).toEqual(IMPLEMENTATION);
  });

  it('NFR-08 RULE-05 implementation-defined numbers are flagged unsafe; the BOM case warns', () => {
    for (const c of cases.filter((x) => x.name.startsWith('i_number_'))) {
      expect(check(c.bytes).warnings, c.name).toContain('unsafe-number');
    }
    const bom = cases.find((c) => c.name === 'i_structure_UTF-8_BOM_empty_object.json')!;
    expect(check(bom.bytes).warnings).toEqual(['byte-order-mark']);
  });
});
