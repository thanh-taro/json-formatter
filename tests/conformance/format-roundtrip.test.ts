// NFR-08 / INV-01 on the JSONTestSuite corpus: every y_ document beautified (each indent style)
// and minified keeps its exact token sequence (reference tokenizer, never JSON.parse), and
// minify ∘ beautify = minify. Skipped when the corpus is absent (`pnpm fixtures:jsontestsuite`).
import { describe, expect, it } from 'vitest';
import { formatText, type FormatMode, type IndentStyle } from '../../src/core';
import { hasCorpus, loadCorpus } from '../support/jsontestsuite';
import { tokens } from '../support/reftok';

const STYLES: IndentStyle[] = [
  { kind: 'spaces', width: 2 },
  { kind: 'spaces', width: 4 },
  { kind: 'tab' },
  { kind: 'spaces', width: 7 },
];
const MINIFY: FormatMode = { kind: 'minify' };

describe.skipIf(!hasCorpus())('NFR-08 INV-01 JSONTestSuite round trips', () => {
  it('NFR-08 INV-01 every y_ case beautifies and minifies token-identically', () => {
    const decoder = new TextDecoder('utf-8', { ignoreBOM: true });
    const cases = loadCorpus().filter((c) => c.expect === 'accept');
    expect(cases.length).toBeGreaterThan(90);
    for (const c of cases) {
      // the editor form: one '\n' per line break (ADR-0006 §3)
      const text = decoder.decode(c.bytes).replace(/\r\n?/g, '\n');
      const ref = tokens(text);
      const min = formatText(text, MINIFY);
      expect(min.outcome.validity, c.name).toBe('valid');
      expect(tokens(min.output), c.name).toEqual(ref);
      for (const indent of STYLES) {
        const b = formatText(text, { kind: 'beautify', indent });
        expect(tokens(b.output), c.name).toEqual(ref);
        expect(formatText(b.output, MINIFY).output, c.name).toBe(min.output);
      }
    }
  });
});
