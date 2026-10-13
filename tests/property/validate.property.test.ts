// Property-based tests of the MOD-Core validator (ADR-0010, fast-check), promoted from
// SP-formatter's property suite: valid documents with random insignificant whitespace, number
// spellings, escapes, duplicate keys and a BOM; random single-character mutations of them.
// Oracles: validity agrees with JSON.parse (differential; BOM and depth are specified
// differently and excluded), the result is independent of chunking, the validator never throws.
// JSON.parse is used for validity only, never for member names (Node 24.19 bug, ADR-0005).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { validateText, type ValidationResult } from '../../src/core';

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
        'é',
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

const doc = fc
  .tuple(tree, fc.array(ws, { minLength: 1, maxLength: 8 }), fc.boolean())
  .map(([t, wsl, bom]) => (bom ? '\uFEFF' : '') + render(t, wsl));
const chunkSizes = fc.array(fc.integer({ min: 1, max: 9 }), { minLength: 1, maxLength: 6 });

function split(text: string, sizes: number[]): string[] {
  const out: string[] = [];
  for (let i = 0, k = 0; i < text.length; k++) {
    const n = sizes[k % sizes.length]!;
    out.push(text.slice(i, i + n));
    i += n;
  }
  return out;
}

const summary = (r: ValidationResult) => JSON.stringify([r.validity, r.issues, r.warningOverflow]);

function nativeValid(text: string): boolean {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  try {
    JSON.parse(body);
    return true;
  } catch {
    return false;
  }
}

describe('property: MOD-Core validator', () => {
  it('NFR-08 generated valid documents are valid, with the same result for any chunking', () => {
    fc.assert(
      fc.property(doc, chunkSizes, (text, sizes) => {
        const whole = validateText(text);
        expect(whole.validity).toBe('valid');
        expect(nativeValid(text)).toBe(true);
        expect(summary(validateText(split(text, sizes)))).toBe(summary(whole));
        // RULE-05: a BOM is always the first warning, at line 1 column 1.
        if (text.charCodeAt(0) === 0xfeff)
          expect(whole.issues[0]).toMatchObject({ code: 'byte-order-mark', line: 1, column: 1 });
      }),
      { numRuns: NUM_RUNS, seed: Number(process.env['SEED'] ?? 20261013) },
    );
  });

  it('NFR-08 RULE-04 mutated documents: validity agrees with JSON.parse; error and position independent of chunking', () => {
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
      fc.property(mutated, chunkSizes, (text, sizes) => {
        const r = validateText(text);
        if (text.length === 0) expect(r.validity).toBe('empty');
        else expect(r.validity === 'valid').toBe(nativeValid(text));
        expect(summary(validateText(split(text, sizes)))).toBe(summary(r));
        if (r.validity === 'invalid') {
          expect(r.issues).toHaveLength(1);
          const e = r.issues[0]!;
          expect(e.severity).toBe('error');
          expect(e.pos).toBeGreaterThanOrEqual(0);
          expect(e.pos).toBeLessThanOrEqual(text.length);
        }
      }),
      { numRuns: NUM_RUNS, seed: Number(process.env['SEED'] ?? 7) },
    );
  });

  it('NFR-08 the validator never throws on arbitrary text', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 40 }), chunkSizes, (text, sizes) => {
        const r = validateText(split(text, sizes));
        expect(['valid', 'invalid', 'empty']).toContain(r.validity);
      }),
      { numRuns: NUM_RUNS, seed: Number(process.env['SEED'] ?? 99) },
    );
  });
});
