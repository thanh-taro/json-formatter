// MOD-Core validator (ADR-0005, ADR-0010): RULE-03/04/05/14 codes and positions per ENT-Issue,
// exact at any chunking. Cases promoted from SP-formatter's rules.test.ts.
import { describe, expect, it } from 'vitest';
import { resolvePositions, Validator, validateText, type Issue } from '../../src/core';

/** Splits `text` into chunks of `size` units (0 = one chunk). */
function chunked(text: string, size: number): string[] {
  if (!size) return [text];
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

/** The first error as `{code, line, column}`, or the validity when there is none. */
function err(text: string, size = 0) {
  const r = validateText(chunked(text, size));
  const e = r.issues.find((i) => i.severity === 'error');
  return e ? { code: e.code, line: e.line, column: e.column } : { validity: r.validity };
}

/** Warnings as `[code, line, column]`. */
function warnings(text: string, size = 0) {
  const r = validateText(chunked(text, size));
  expect(r.validity).toBe('valid');
  return r.issues.map((w) => [w.code, w.line, w.column]);
}

const deep = (n: number, mixed = false) =>
  mixed
    ? Array.from({ length: n }, (_, i) => (i % 2 ? '[' : '{"k":')).join('') +
      Array.from({ length: n }, (_, i) => ((n - 1 - i) % 2 ? ']' : '}')).join('')
    : '['.repeat(n) + ']'.repeat(n);

const ALL_CHUNKINGS = [0, 1, 3];

function expectError(text: string, code: string, line: number, column: number) {
  for (const size of ALL_CHUNKINGS) expect(err(text, size), `chunk ${size}`).toEqual({ code, line, column });
}

describe('F-005 acceptance examples (MOD-Core)', () => {
  it('F-005.AC2 trailing comma at line 2 column 8', () => {
    expectError('{"a": 1,\n "b": 2,\n}', 'trailing-comma', 2, 8);
  });

  it('F-005.AC3 invalid literal True at line 1 column 7', () => {
    expectError('{"a": True}', 'invalid-literal', 1, 7);
  });

  it('F-005.AC4 extra content at line 1 column 10', () => {
    expectError('{"a": 1} {"b": 2}', 'extra-content', 1, 10);
  });

  it('F-005.AC5 duplicate-key at the second "a" and unsafe-number at the number', () => {
    const text = '{"a":1,"a":2,"id":9007199254740993}';
    for (const size of [0, 1, 2, 5]) {
      expect(warnings(text, size)).toEqual([
        ['duplicate-key', 1, 8],
        ['unsafe-number', 1, 19],
      ]);
    }
    const r = validateText(text);
    expect(r.issues.map((i) => [i.severity, i.length])).toEqual([
      ['warning', 3],
      ['warning', 16],
    ]);
  });

  it('F-005.AC9 RULE-03 a document of zero characters is empty with no issue', () => {
    const r = validateText('');
    expect(r.validity).toBe('empty');
    expect(r.issues).toEqual([]);
    expect(validateText([]).validity).toBe('empty');
  });

  it('F-005.AC10 only spaces and line breaks → empty-document at line 1 column 1', () => {
    expectError('  \n \n', 'empty-document', 1, 1);
    expectError(' \r\n\t', 'empty-document', 1, 1);
  });

  it('F-005.AC11 RULE-14 10,001 nested arrays → too-deep at the opening bracket of level 10,001', () => {
    const text = deep(10_001);
    expect(err(text)).toEqual({ code: 'too-deep', line: 1, column: 10_001 });
    expect(err(text, 4096)).toEqual({ code: 'too-deep', line: 1, column: 10_001 });
  });
});

// [document, code, line, column] — one row per RULE-04 code and position (plus variants).
const ERRORS: [string, string, number, number][] = [
  ['[1,2,]', 'trailing-comma', 1, 5],
  ['{"a":1,}', 'trailing-comma', 1, 7],
  ['{"a":1 // c\n}', 'comment', 1, 8],
  ['/* c */ {}', 'comment', 1, 1],
  ['{} // trailing', 'comment', 1, 4],
  ["{'a':1}", 'single-quotes', 1, 2],
  ["['x']", 'single-quotes', 1, 2],
  ['{a:1}', 'unquoted-key', 1, 2],
  ['{"a":1, b:2}', 'unquoted-key', 1, 9],
  ['{_id:1}', 'unquoted-key', 1, 2],
  ['[1 2]', 'missing-comma', 1, 4],
  ['{"a":1\n "b":2}', 'missing-comma', 2, 2],
  ['[{} {}]', 'missing-comma', 1, 5],
  ['{"a" 1}', 'missing-colon', 1, 6],
  ['{"a"}', 'missing-colon', 1, 5],
  ['["abc', 'unclosed-string', 1, 2],
  ['{"a":"x\\', 'unclosed-string', 1, 6],
  ['{"a":[1,2\n', 'unclosed-container', 2, 1],
  ['[', 'unclosed-container', 1, 2],
  ['[1}', 'unexpected-closing', 1, 3],
  ['}', 'unexpected-closing', 1, 1],
  ['{"a":}', 'unexpected-closing', 1, 6],
  ['{]', 'unexpected-closing', 1, 2],
  ['[nul]', 'invalid-literal', 1, 2],
  ['[truex]', 'invalid-literal', 1, 2],
  ['[NaN]', 'invalid-literal', 1, 2],
  ['undefined', 'invalid-literal', 1, 1],
  ['tru', 'invalid-literal', 1, 1],
  ['[01]', 'invalid-number', 1, 2],
  ['[1.]', 'invalid-number', 1, 2],
  ['[-]', 'invalid-number', 1, 2],
  ['[.5]', 'invalid-number', 1, 2],
  ['[+1]', 'invalid-number', 1, 2],
  ['[1e]', 'invalid-number', 1, 2],
  ['[1x]', 'invalid-number', 1, 2],
  ['[-Infinity]', 'invalid-number', 1, 2],
  ['-', 'invalid-number', 1, 1],
  ['["a\\x"]', 'invalid-escape', 1, 4],
  ['["\\u12G4"]', 'invalid-escape', 1, 3],
  ['["a\tb"]', 'control-character', 1, 4],
  ['["a\nb"]', 'control-character', 1, 4],
  ['["😀\u0001"]', 'control-character', 1, 4],
  ['[1]]', 'extra-content', 1, 4],
  ['1 2', 'extra-content', 1, 3],
  ['["😀",\n  @]', 'unexpected-character', 2, 3],
  ['[1,,2]', 'unexpected-character', 1, 4],
  ['/', 'unexpected-character', 1, 1],
  ['[1] /x', 'unexpected-character', 1, 5],
  ['[1, ]', 'unexpected-character', 1, 4],
  ['[1]﻿', 'extra-content', 1, 4],
];

describe('RULE-04 error codes and positions', () => {
  for (const [doc, code, line, column] of ERRORS) {
    it(`RULE-04 ${code} in ${JSON.stringify(doc)} at ${line}:${column}`, () => expectError(doc, code, line, column));
  }

  it('RULE-04 only the first syntax error is reported', () => {
    const r = validateText('[1,,2,]\n{');
    expect(r.validity).toBe('invalid');
    expect(r.issues).toHaveLength(1);
  });

  it('RULE-04 unclosed-container names the innermost open bracket and the line it opened on', () => {
    const r = validateText('{\n "a": [1,\n 2');
    expect(r.issues[0]).toMatchObject({
      code: 'unclosed-container',
      line: 3,
      column: 3,
      params: { bracket: '[', line: 2 },
    });
    const o = validateText('{"a":1');
    expect(o.issues[0]?.params).toEqual({ bracket: '{', line: 1 });
  });

  it('RULE-04 unexpected-closing names the bracket', () => {
    expect(validateText('[1}').issues[0]?.params).toEqual({ bracket: '}' });
    expect(validateText('{]').issues[0]?.params).toEqual({ bracket: ']' });
  });

  it('RULE-04 an error marks one character; the end of the document marks nothing', () => {
    expect(validateText('[1,]').issues[0]).toMatchObject({ pos: 2, length: 1 });
    expect(validateText('[1').issues[0]).toMatchObject({ pos: 2, length: 0 });
  });

  it('RULE-04 the error at the very end of a 1-line minified document has an exact column', () => {
    const body = Array.from({ length: 20_000 }, (_, i) => `{"i":${i}}`).join(',');
    const text = `[${body}`;
    expect(err(text)).toEqual({ code: 'unclosed-container', line: 1, column: text.length + 1 });
    expect(err(text, 1000)).toEqual({ code: 'unclosed-container', line: 1, column: text.length + 1 });
  });
});

describe('RULE-03 strict standard, byte-order mark, empty', () => {
  it('RULE-03 any value at top level is valid', () => {
    for (const doc of ['1', '"s"', 'true', 'null', '[]', '{}', ' -0.5e+3 ', '\t\r\n[]\r\n'])
      expect(validateText(doc).validity, doc).toBe('valid');
  });

  it('RULE-03 RULE-05 a leading byte-order mark is tolerated and reported at line 1 column 1', () => {
    const r = validateText('﻿{}');
    expect(r.validity).toBe('valid');
    expect(r.issues.map((i) => [i.code, i.line, i.column, i.offset])).toEqual([['byte-order-mark', 1, 1, 0]]);
  });

  it('RULE-03 a byte-order mark is not counted in columns or offsets', () => {
    const r = validateText('﻿[x]');
    expect(r.issues[0]).toMatchObject({ code: 'invalid-literal', line: 1, column: 2, offset: 1 });
  });

  it('RULE-03 a document with only a byte-order mark contains no value', () => {
    expect(err('﻿')).toEqual({ code: 'empty-document', line: 1, column: 1 });
  });
});

describe('RULE-05 warnings', () => {
  it('RULE-05 duplicate keys compare decoded names; nested objects are separate scopes', () => {
    expect(warnings('{"a":1,"\\u0061":2}')).toEqual([['duplicate-key', 1, 8]]);
    expect(warnings('{"a":{"a":{"a":1}},"b":1}')).toEqual([]);
    expect(warnings('{"a":{"x":1},"a":2,"a":3}')).toEqual([
      ['duplicate-key', 1, 14],
      ['duplicate-key', 1, 20],
    ]);
    expect(warnings('{"\\n":1,"\\u000a":2}')).toEqual([['duplicate-key', 1, 9]]);
  });

  it('RULE-05 duplicate keys in objects with more than 16 keys', () => {
    const keys = Array.from({ length: 40 }, (_, i) => `"k${i}":${i}`).join(',');
    expect(warnings(`{${keys},"k3":0}`).map((w) => w[0])).toEqual(['duplicate-key']);
  });

  it('RULE-05 duplicate keys spanning chunks are still found', () => {
    expect(warnings('{"abcdef":1,"abcdef":2}', 3)).toEqual([['duplicate-key', 1, 13]]);
  });

  it('RULE-05 unsafe-number definition', () => {
    const flagged = (n: string) => warnings(`[${n}]`).length === 1;
    for (const n of [
      '9007199254740992',
      '-9007199254740993',
      '12345678901234567890',
      '1e400',
      '-1e400',
      '1e-400',
      '123456789012345678',
      '0.123456789012345678',
      '1.000000000000000001',
    ])
      expect(flagged(n), n).toBe(true);
    for (const n of [
      '9007199254740991',
      '-9007199254740991',
      '0.1',
      '1.50',
      '1e3',
      '0',
      '-0',
      '0e400',
      '0.0000000000000000000000001',
      '1.000000000000000000000',
      '1e300',
      '0.12345678901234567',
    ])
      expect(flagged(n), n).toBe(false);
  });

  it('RULE-05 a number at the very end of the document is classified', () => {
    expect(warnings('9007199254740993')).toEqual([['unsafe-number', 1, 1]]);
    expect(warnings('9007199254740993', 4)).toEqual([['unsafe-number', 1, 1]]);
  });

  it('RULE-05 warnings are capped at 1,000 with a count of the rest', () => {
    const r = validateText('[' + Array(1500).fill('1e999').join(',') + ']');
    expect(r.validity).toBe('valid');
    expect(r.issues).toHaveLength(1000);
    expect(r.warningOverflow).toBe(500);
  });

  it('RULE-05 an invalid document reports its error only', () => {
    const r = validateText('{"a":1,"a":2,}');
    expect(r.issues.map((i) => i.code)).toEqual(['trailing-comma']);
  });
});

describe('RULE-14 depth without recursion', () => {
  it('RULE-14 10,000 nested arrays are valid', () => {
    expect(validateText(deep(10_000)).validity).toBe('valid');
  });

  it('RULE-14 10,000 mixed object/array levels are valid', () => {
    expect(validateText(deep(10_000, true)).validity).toBe('valid');
  });

  it('RULE-14 1,000,000 opening brackets stop at level 10,001 without a stack overflow', () => {
    expect(err('['.repeat(1_000_000))).toEqual({ code: 'too-deep', line: 1, column: 10_001 });
  });
});

describe('ENT-Issue line, column and offset', () => {
  it('ENT-Issue LF, CRLF and a lone CR each count as one break', () => {
    expectError('\r\n\r\n[x]', 'invalid-literal', 3, 2);
    expectError('\r\r[x]', 'invalid-literal', 3, 2);
    expectError('\n\n[x]', 'invalid-literal', 3, 2);
  });

  it('ENT-Issue columns count code points (an emoji is one column)', () => {
    expectError('["😀😀", x]', 'invalid-literal', 1, 8);
  });

  it('ENT-Issue offset is in code points: a CRLF document counts two per break', () => {
    // The editor holds '\n' breaks; the document's line ending decides the offset.
    const lf = validateText('[\n1,]', { lineEnding: 'lf' }).issues[0]!;
    const crlf = validateText('[\n1,]', { lineEnding: 'crlf' }).issues[0]!;
    expect([lf.line, lf.column, lf.offset]).toEqual([2, 2, 3]);
    expect([crlf.line, crlf.column, crlf.offset]).toEqual([2, 2, 4]);
    expect(validateText('[\r\n1,]').issues[0]!.offset).toBe(4);
  });

  it('ENT-Issue a trailing break starts a new, empty line', () => {
    expect(resolvePositions(['[1]\n'], [4])).toEqual([{ line: 2, column: 1, offset: 4 }]);
  });

  it('ENT-Issue positions resolve the same for any chunking, in any order', () => {
    const text = '﻿ab\r\ncd😀e\rf\ng';
    const positions = [12, 0, 3, 7, 5, 1, 14];
    const whole = resolvePositions([text], positions);
    for (const size of [1, 2, 3, 5]) expect(resolvePositions(chunked(text, size), positions)).toEqual(whole);
    expect(whole[2]).toEqual({ line: 1, column: 3, offset: 2 });
  });
});

describe('ADR-0007 skip table built during validation', () => {
  it('ADR-0007 records containers of at least 4 KB with their spans and child counts, sorted by start', () => {
    const big = '[' + Array.from({ length: 1000 }, (_, i) => `"${'x'.repeat(5)}${i}"`).join(',') + ']';
    const text = `{"a":${big},"b":[1,2],"c":{"k":${big}}}`;
    const v = new Validator({ skipTable: true, lengthHint: text.length });
    for (const c of chunked(text, 777)) v.feed(c);
    const out = v.end();
    const table = out.skipTable!;
    const rows = Array.from({ length: table.n }, (_, i) => [table.starts[i], table.ends[i], table.counts[i]]);
    const firstBig = text.indexOf('[');
    const secondBig = text.lastIndexOf('{"k":') + 5;
    expect(rows).toEqual([
      [0, text.length, 3],
      [firstBig, firstBig + big.length, 1000],
      [secondBig - 5, secondBig + big.length + 1, 1],
      [secondBig, secondBig + big.length, 1000],
    ]);
  });

  it('ADR-0007 the table stays bounded: the threshold doubles and ancestors stay indexed', () => {
    // 2,000 containers of 40 positions, threshold 16, at most 64 entries (scaled-down bounds).
    const inner = '[' + '1,'.repeat(19) + '1]';
    const text = '[' + Array(2000).fill(inner).join(',') + ']';
    const v = new Validator({ skipTable: true, skipThreshold: 16, skipMinCapacity: 64 });
    for (const c of chunked(text, 1000)) v.feed(c);
    const t = v.end().skipTable!;
    expect(t.n).toBeLessThanOrEqual(64);
    expect(t.threshold).toBeGreaterThan(40);
    expect([t.starts[0], t.ends[0], t.counts[0]]).toEqual([0, text.length, 2000]);
    // Bound from the document length: max(minimum, 4 × length / T).
    const sized = new Validator({ skipTable: true, skipThreshold: 16, skipMinCapacity: 64, lengthHint: text.length });
    sized.feed(text);
    const all = sized.end().skipTable!;
    expect(all.n).toBe(2001);
    expect(all.threshold).toBe(16);
  });

  it('ADR-0007 no table is built unless asked, and none for an invalid document', () => {
    expect(validateText('[1]').outcome.skipTable).toBeNull();
    const v = new Validator({ skipTable: true });
    v.feed('[1,');
    expect(v.end().skipTable).toBeNull();
  });
});

describe('MOD-Core validator robustness', () => {
  it('smoke: input after the first error is ignored', () => {
    const v = new Validator();
    expect(v.feed('[1,,')).toBe(false);
    expect(v.feed('2]')).toBe(false);
    const issue: Issue | undefined = validateText('[1,,2]').issues[0];
    expect(issue?.code).toBe('unexpected-character');
  });
});
