// INV-01 property tests of MOD-Core beautify and minify (ADR-0005 Consequences, ADR-0010),
// promoted from SP-formatter's `test/property.test.ts`: on generated valid documents (random
// insignificant whitespace, number spellings, escapes, duplicate keys, a BOM) the output has the
// same token sequence as the input by an independent reference tokenizer, is independent of
// chunking, round-trips (minify ∘ beautify = minify, beautify idempotent), follows the final-break
// rule, and matches the size predicted by validation; invalid documents are refused.
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';

// Thousands of generated cases: allow for a busy machine (the 5 s default is for unit tests).
vi.setConfig({ testTimeout: 60_000 });
import {
  beautifiedBytes,
  formatText,
  utf8Length,
  validateText,
  type FormatMode,
  type IndentStyle,
} from '../../src/core';
import { tokens } from '../support/reftok';

const NUM_RUNS = Number(process.env['NUM_RUNS'] ?? 10_000);

const ws = fc.stringMatching(/^[ \t\n\r]{0,3}$/);
const num = fc.stringMatching(/^-?(0|[1-9][0-9]{0,24})(\.[0-9]{1,20})?([eE][+-]?[0-9]{1,4})?$/);
const strBody = fc
  .array(
    fc.oneof(
      fc
        .string({ unit: 'binary', maxLength: 6 })
        .map((s) =>
          s.replace(/[\u0000-\u001f"\\]/g, (ch) =>
            ch === '"' ? '\\"' : ch === '\\' ? '\\\\' : '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'),
          ),
        ),
      fc.constantFrom(
        '\\n',
        '\\t',
        '\\/',
        '\\b',
        '\\f',
        '\\r',
        '\\"',
        '\\\\',
        '\\u00e9',
        '\\uD83D\\uDE00',
        '😀',
        '東京',
        ' ',
      ),
    ),
    { maxLength: 4 },
  )
  .map((a) => '"' + a.join('') + '"');
const key = fc.oneof(fc.constantFrom('"a"', '"b"', '"\\u0061"', '"id"'), strBody);

type Tree = { k: 'lit'; v: string } | { k: 'arr'; v: Tree[] } | { k: 'obj'; v: [string, Tree][] };
const { tree } = fc.letrec<{ tree: Tree }>((tie) => ({
  tree: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    fc.oneof(num, strBody, fc.constantFrom('true', 'false', 'null')).map((v) => ({ k: 'lit', v }) as Tree),
    fc.array(tie('tree'), { maxLength: 5 }).map((v) => ({ k: 'arr', v }) as Tree),
    fc.array(fc.tuple(key, tie('tree')), { maxLength: 5 }).map((v) => ({ k: 'obj', v }) as Tree),
  ),
}));

/** Renders a tree with whitespace drawn (cyclically) from `wsl`. */
function render(t: Tree, wsl: string[]): string {
  let i = 0;
  const w = () => wsl[i++ % wsl.length] ?? '';
  const go = (t: Tree): string => {
    if (t.k === 'lit') return t.v;
    if (t.k === 'arr') return '[' + w() + t.v.map((x) => go(x) + w()).join(',' + w()) + ']';
    return '{' + w() + t.v.map(([k, v]) => k + w() + ':' + w() + go(v) + w()).join(',' + w()) + '}';
  };
  return w() + go(t) + w();
}

/** Documents as the editor and the worker mirror hold them: line breaks are one '\n'. */
const doc = fc
  .tuple(tree, fc.array(ws, { minLength: 1, maxLength: 8 }), fc.boolean())
  .map(([t, wsl, bom]) => ((bom ? '\uFEFF' : '') + render(t, wsl)).replace(/\r\n?/g, '\n'));
const chunkSizes = fc.array(fc.integer({ min: 1, max: 9 }), { minLength: 1, maxLength: 6 });
const indent = fc.oneof(
  fc.integer({ min: 1, max: 8 }).map((width): IndentStyle => ({ kind: 'spaces', width })),
  fc.constant<IndentStyle>({ kind: 'tab' }),
);
const eol = fc.constantFrom('\n', '\r\n');

function split(text: string, sizes: number[]): string[] {
  const out: string[] = [];
  for (let i = 0, k = 0; i < text.length; k++) {
    const n = sizes[k % sizes.length]!;
    out.push(text.slice(i, i + n));
    i += n;
  }
  return out;
}

function fmt(text: string | string[], mode: FormatMode, nl = '\n'): string {
  const r = formatText(text, mode, nl);
  expect(r.outcome.validity).toBe('valid');
  return r.output;
}

const MINIFY: FormatMode = { kind: 'minify' };
/** Strings removed, so what is left is structure and insignificant whitespace. */
const outsideStrings = (s: string) => s.replace(/"(?:[^"\\]|\\.)*"/g, '""');

describe('property: lossless formatting (INV-01)', () => {
  it('INV-01 F-002.R3 beautify keeps every token, is chunk-independent and idempotent', () => {
    fc.assert(
      fc.property(doc, chunkSizes, indent, eol, (text, sizes, ind, nl) => {
        const mode: FormatMode = { kind: 'beautify', indent: ind };
        const b = fmt(text, mode, nl);
        expect(tokens(b)).toEqual(tokens(text));
        expect(fmt(split(text, sizes), mode, nl)).toBe(b);
        // beautify ∘ beautify = beautify (on the editor form of the result)
        const editorForm = b.replace(/\r\n/g, '\n');
        expect(fmt(editorForm, mode, nl)).toBe(b);
        // RULE-07: ends with a line break only if the input did; breaks only of the given kind
        expect(/\n$/.test(b)).toBe(/\n$/.test(text));
        if (nl === '\n') expect(b.includes('\r')).toBe(false);
        else expect(b.replace(/\r\n/g, '').includes('\n')).toBe(false);
      }),
      { numRuns: NUM_RUNS, seed: Number(process.env['SEED'] ?? 20261013) },
    );
  });

  it('INV-01 F-003.R2 minify keeps every token, leaves no whitespace outside strings, and minify ∘ beautify = minify', () => {
    fc.assert(
      fc.property(doc, chunkSizes, indent, (text, sizes, ind) => {
        const m = fmt(text, MINIFY);
        expect(tokens(m)).toEqual(tokens(text));
        expect(fmt(split(text, sizes), MINIFY)).toBe(m);
        expect(/[ \t\r\n]/.test(outsideStrings(m))).toBe(false);
        expect(fmt(fmt(text, { kind: 'beautify', indent: ind }), MINIFY)).toBe(m);
      }),
      { numRuns: NUM_RUNS, seed: Number(process.env['SEED'] ?? 1013) },
    );
  });

  it('RULE-02 F-002.R7 the beautified size predicted by validation is exact', () => {
    fc.assert(
      fc.property(doc, indent, eol, (text, ind, nl) => {
        const v = validateText(text);
        const nonBreakBytes = utf8Length(text.replace(/\n/g, ''));
        const out = fmt(text, { kind: 'beautify', indent: ind }, nl);
        expect(beautifiedBytes(v.layout!, nonBreakBytes, ind, nl === '\n' ? 'lf' : 'crlf')).toBe(utf8Length(out));
      }),
      { numRuns: NUM_RUNS, seed: Number(process.env['SEED'] ?? 77) },
    );
  });

  it('INV-03 F-002.R4 F-003.R3 invalid documents are refused with the validator’s first error', () => {
    const mutated = fc
      .tuple(
        doc,
        fc.nat(),
        fc.constantFrom('del', 'ins', 'rep'),
        fc.constantFrom(...'{}[],:"\'/\\-+.0123456789aetrufnl xX\u0001\uFEFF\n'.split('')),
      )
      .map(([t, p, op, ch]) => {
        const i = t.length ? p % t.length : 0;
        if (op === 'del') return t.slice(0, i) + t.slice(i + 1);
        if (op === 'ins') return t.slice(0, i) + ch + t.slice(i);
        return t.slice(0, i) + ch + t.slice(i + 1);
      });
    fc.assert(
      fc.property(mutated, chunkSizes, indent, (text, sizes, ind) => {
        const v = validateText(text);
        for (const mode of [MINIFY, { kind: 'beautify', indent: ind } as FormatMode]) {
          const r = formatText(split(text, sizes), mode);
          expect(r.outcome.validity).toBe(v.validity);
          if (v.validity === 'invalid') expect(r.outcome.error).toEqual(v.outcome.error);
          else if (v.validity === 'valid') expect(tokens(r.output)).toEqual(tokens(text));
        }
      }),
      { numRuns: NUM_RUNS, seed: Number(process.env['SEED'] ?? 5) },
    );
  });
});
