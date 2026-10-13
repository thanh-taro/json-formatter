// MOD-Core beautify (RULE-07) and minify (RULE-08): exact layouts, lossless output (INV-01),
// refusal of invalid input (INV-03), bounded output chunks, and the beautified-size prediction
// made during validation (RULE-02). The worker and UI paths are covered in worker-format and e2e.
import { describe, expect, it } from 'vitest';
import {
  beautifiedBytes,
  DEFAULT_INDENT,
  formatText,
  indentText,
  utf8Length,
  validateText,
  type FormatMode,
  type IndentStyle,
} from '../../src/core';

const spaces = (width: number): IndentStyle => ({ kind: 'spaces', width });
const TAB: IndentStyle = { kind: 'tab' };
const beautify = (indent: IndentStyle = DEFAULT_INDENT): FormatMode => ({ kind: 'beautify', indent });
const MINIFY: FormatMode = { kind: 'minify' };

/** Formats a text and returns the output (throws when the input is refused). */
function fmt(text: string | string[], mode: FormatMode, eol = '\n'): string {
  const r = formatText(text, mode, eol);
  if (r.outcome.validity !== 'valid') throw new Error(`refused: ${r.outcome.error?.code ?? r.outcome.validity}`);
  return r.output;
}

describe('MOD-Core beautify (RULE-07)', () => {
  it('F-002.AC1 beautifies a minified object with 2-space indent', () => {
    expect(fmt('{"a":[1,2],"b":{}}', beautify(spaces(2)))).toBe('{\n  "a": [\n    1,\n    2\n  ],\n  "b": {}\n}');
  });

  it('F-002.R2 RULE-01 the default indent style is 2 spaces', () => {
    expect(DEFAULT_INDENT).toEqual({ kind: 'spaces', width: 2 });
    expect(indentText(DEFAULT_INDENT)).toBe('  ');
  });

  it('F-002.AC2 indent style tab indents every nesting level with exactly one tab', () => {
    const out = fmt('{"a":{"b":[1,{"c":true}]}}', beautify(TAB));
    expect(out).toBe('{\n\t"a": {\n\t\t"b": [\n\t\t\t1,\n\t\t\t{\n\t\t\t\t"c": true\n\t\t\t}\n\t\t]\n\t}\n}');
    for (const line of out.split('\n')) expect(line).toMatch(/^\t*[^\t ]/);
  });

  it('F-002.AC3 a custom indent of 3 spaces adds exactly 3 spaces per nesting level', () => {
    const out = fmt('[[1,[2]],3]', beautify(spaces(3)));
    expect(out).toBe('[\n   [\n      1,\n      [\n         2\n      ]\n   ],\n   3\n]');
  });

  it('RULE-01 custom indents of 1 to 8 spaces', () => {
    for (let w = 1; w <= 8; w++) expect(fmt('[1]', beautify(spaces(w)))).toBe(`[\n${' '.repeat(w)}1\n]`);
    expect(indentText(spaces(4))).toBe('    ');
    expect(indentText(TAB)).toBe('\t');
  });

  it('F-002.AC4 numbers keep their spelling and keys keep their order', () => {
    const out = fmt('{"id":12345678901234567890,"x":1.0,"y":1e3,"2":0,"1":0}', beautify());
    expect(out).toBe('{\n  "id": 12345678901234567890,\n  "x": 1.0,\n  "y": 1e3,\n  "2": 0,\n  "1": 0\n}');
  });

  it('F-002.AC5 both members of a duplicate key remain in their original order', () => {
    expect(fmt('{"a":1,"b":2,"a":3}', beautify())).toBe('{\n  "a": 1,\n  "b": 2,\n  "a": 3\n}');
  });

  it('F-002.AC6 an invalid document is refused with the trailing-comma error and no output', () => {
    const r = formatText('{"a":1,}', beautify());
    expect(r.outcome.validity).toBe('invalid');
    expect(r.outcome.error).toMatchObject({ code: 'trailing-comma', pos: 6 });
    expect(r.output).toBe('');
  });

  it('F-002.AC9 CRLF: every line break of the result is CRLF and it ends with one line break', () => {
    const out = fmt('{"a":1,\r\n"b":[]}\r\n', beautify(), '\r\n');
    expect(out).toBe('{\r\n  "a": 1,\r\n  "b": []\r\n}\r\n');
    expect(out.replace(/\r\n/g, '').includes('\n')).toBe(false);
  });

  it('RULE-07 the result ends with a line break only if the input ended with one', () => {
    expect(fmt('[1]', beautify())).toBe('[\n  1\n]');
    expect(fmt('[1]\n', beautify())).toBe('[\n  1\n]\n');
    expect(fmt('[1]\n\n  \n', beautify())).toBe('[\n  1\n]\n');
    expect(fmt('[1]  ', beautify())).toBe('[\n  1\n]');
  });

  it('RULE-07 empty object and empty array stay on one line, also with whitespace inside', () => {
    expect(fmt('{ "a" : [ ] , "b" : {\n} }', beautify())).toBe('{\n  "a": [],\n  "b": {}\n}');
    expect(fmt('[]', beautify())).toBe('[]');
    expect(fmt('{}', beautify())).toBe('{}');
  });

  it('F-002 edge case: a top-level scalar loses its surrounding whitespace, the final break is kept', () => {
    expect(fmt('  42  \n', beautify())).toBe('42\n');
    expect(fmt('\t"x"', beautify())).toBe('"x"');
  });

  it('F-002 edge case: escapes stay escaped and raw characters inside strings are untouched', () => {
    const doc = '{"s":"a\\nb\\t c  d","t":"東京 😀"}';
    expect(fmt(doc, beautify())).toBe('{\n  "s": "a\\nb\\t c  d",\n  "t": "東京 😀"\n}');
  });

  it('RULE-07 a byte-order mark stays the first character', () => {
    expect(fmt('﻿ {"a":1}', beautify())).toBe('﻿{\n  "a": 1\n}');
  });

  it('F-002 edge case: a whitespace-only document is refused with empty-document', () => {
    const r = formatText('  \n ', beautify());
    expect(r.outcome.error?.code).toBe('empty-document');
    expect(r.output).toBe('');
  });

  it('F-002.R1 output is the same for every chunking of the input', () => {
    const doc = '{"a" : [1, 2.50e+3, "x,y" ],\n "b":{"c":null}, "d":"\\u00e9\\""}\n';
    const whole = fmt(doc, beautify());
    for (const size of [1, 2, 3, 7]) {
      const chunks: string[] = [];
      for (let i = 0; i < doc.length; i += size) chunks.push(doc.slice(i, i + size));
      expect(fmt(chunks, beautify())).toBe(whole);
      expect(fmt(chunks, MINIFY)).toBe(fmt(doc, MINIFY));
    }
  });

  it('ADR-0005 pathological expansion (10,000 levels) streams in bounded chunks', () => {
    const doc = '['.repeat(10_000) + ']'.repeat(10_000);
    const chunks: string[] = [];
    let longest = 0;
    let total = 0;
    const outcome = formatText(doc, beautify(), '\n', {
      chunkUnits: 1 << 20,
      emit: (c) => {
        longest = Math.max(longest, c.length);
        total += c.length;
        if (chunks.length < 2) chunks.push(c);
      },
    }).outcome;
    expect(outcome.validity).toBe('valid');
    // 9,999 opening lines, the innermost `[]`, 9,999 closing lines (19,998 breaks); indents of
    // 2 × depth: ≈ 200 M units in total, never held as one string.
    const indents = 2 * (2 * ((9_998 * 9_999) / 2) + 9_999);
    expect(total).toBe(20_000 + 19_998 + indents);
    expect(longest).toBeLessThan((1 << 20) + 2 * 10_000 + 2);
    expect(chunks[0]!.startsWith('[\n  [\n    [')).toBe(true);
  });
});

describe('MOD-Core minify (RULE-08)', () => {
  it('F-003.AC1 minifies to no whitespace outside strings', () => {
    expect(fmt('{\n  "a": [ 1, 2 ],\n  "b": "x y"\n}', MINIFY)).toBe('{"a":[1,2],"b":"x y"}');
  });

  it('F-003.AC2 numbers appear exactly as written', () => {
    expect(fmt('[ 9007199254740993 ,\n 1.50 ]', MINIFY)).toBe('[9007199254740993,1.50]');
  });

  it('F-003.AC3 an invalid document is refused with the single-quotes error and no output', () => {
    const r = formatText("{'a':1}", MINIFY);
    expect(r.outcome.error).toMatchObject({ code: 'single-quotes', pos: 1 });
    expect(r.output).toBe('');
  });

  it('RULE-08 no line breaks, also no final break; the byte-order mark stays first', () => {
    expect(fmt('﻿[\r\n 1\r\n]\r\n', MINIFY)).toBe('﻿[1]');
  });

  it('F-003 edge case: whitespace inside strings is preserved', () => {
    expect(fmt('{ "a b" : " \\t  x " }', MINIFY)).toBe('{"a b":" \\t  x "}');
  });
});

describe('RULE-02 beautified size predicted during validation', () => {
  const cases: [string, IndentStyle, string][] = [
    ['{"a":[1,2],"b":{}}', spaces(2), '\n'],
    ['{"a":[1,2],"b":{}}\n', TAB, '\r\n'],
    ['﻿ { "é" : [ "東京😀", {"x":[[]]} ] }  \n\n', spaces(7), '\n'],
    ['  42 ', spaces(4), '\r\n'],
    ['[[[[1]]],[],{}]', spaces(1), '\n'],
  ];
  for (const [doc, indent, eol] of cases) {
    it(`F-002.R7 RULE-02 the prediction equals the UTF-8 size of the result (${JSON.stringify(doc)})`, () => {
      const v = validateText(doc);
      expect(v.validity).toBe('valid');
      const lines = doc.split(/\r\n|\r|\n/);
      const nonBreakBytes = utf8Length(lines.join(''));
      const out = fmt(doc.replace(/\r\n?/g, '\n'), beautify(indent), eol);
      expect(beautifiedBytes(v.layout!, nonBreakBytes, indent, eol === '\r\n' ? 'crlf' : 'lf')).toBe(
        Buffer.byteLength(out),
      );
    });
  }

  it('F-002.AC10 a 20 KB document nested 10,000 levels deep predicts a result over 100 MB', () => {
    const doc = '['.repeat(10_000) + ']'.repeat(10_000);
    const v = validateText(doc);
    expect(beautifiedBytes(v.layout!, doc.length, spaces(2), 'lf')).toBeGreaterThan(100_000_000);
  });
});
