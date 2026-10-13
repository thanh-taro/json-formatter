// MOD-Core re-indent (RULE-09): unit detection (tabs vs spaces, most frequent increase, ties,
// no increase), conversion (tabs, spaces, leftover spaces, mixed runs), blank lines, invalid
// documents, chunking, and the size prediction used for the RULE-02 check (F-004.R7).
import { describe, expect, it } from 'vitest';
import { detectUnit, IndentScanner, Reindenter, reindentDelta, reindentText, type IndentStyle } from '../../src/core';

const TAB: IndentStyle = { kind: 'tab' };
const sp = (width: number): IndentStyle => ({ kind: 'spaces', width });

function unitOf(text: string) {
  const s = new IndentScanner();
  s.feed(text);
  return detectUnit(s.end());
}

/** Re-indents with the text cut into chunks of `size` units. */
function chunked(text: string, target: IndentStyle, size: number): string {
  const s = new IndentScanner();
  for (let i = 0; i < text.length; i += size) s.feed(text.slice(i, i + size));
  const unit = detectUnit(s.end());
  if (!unit) return text;
  const r = new Reindenter(unit, target);
  let out = '';
  for (let i = 0; i < text.length; i += size) out += r.feed(text.slice(i, i + size));
  return out + r.end();
}

const doc4 = '{\n    "a": {\n        "b": [\n            1\n        ]\n    }\n}';
const docTab = '{\n\t"a": {\n\t\t"b": 1\n\t}\n}';

describe('RULE-09 re-indent', () => {
  it('F-004.AC1 4·n leading spaces become n tabs', () => {
    expect(reindentText(doc4, TAB)?.text).toBe('{\n\t"a": {\n\t\t"b": [\n\t\t\t1\n\t\t]\n\t}\n}');
  });

  it('F-004.AC2 each leading tab becomes 2 spaces', () => {
    expect(reindentText(docTab, sp(2))?.text).toBe('{\n  "a": {\n    "b": 1\n  }\n}');
  });

  it('F-004.AC3 a compact array line keeps its content and the line count is unchanged', () => {
    const src = '{\n  "xs": [1, 2, 3],\n  "y": {\n    "z": true\n  }\n}';
    const out = reindentText(src, sp(4))!.text;
    expect(out.split('\n')).toContain('    "xs": [1, 2, 3],');
    expect(out.split('\n').length).toBe(src.split('\n').length);
    expect(out).toBe('{\n    "xs": [1, 2, 3],\n    "y": {\n        "z": true\n    }\n}');
  });

  it('F-004.AC4 an invalid document with a trailing comma is re-indented and keeps the comma', () => {
    const src = '{\n  "a": 1,\n  "b": [\n    2,\n  ],\n}';
    expect(reindentText(src, sp(4))?.text).toBe('{\n    "a": 1,\n    "b": [\n        2,\n    ],\n}');
  });

  it('F-004.AC6 a single-line document has no indentation: nothing to change', () => {
    expect(reindentText('{"a":[1,2,3]}', sp(4))).toBeNull();
    expect(unitOf('')).toBeNull();
    expect(unitOf('{\n"a": 1\n}')).toBeNull();
  });

  it('RULE-09 unit is a tab when more indented lines start with a tab than with a space', () => {
    expect(unitOf('[\n\t1,\n\t2,\n  3\n]')).toEqual({ tab: true, spaces: 2 });
    // equal counts → spaces
    expect(unitOf('[\n\t1,\n  2\n]')?.tab).toBe(false);
  });

  it('RULE-09 N is the most frequent positive increase between consecutive non-blank lines', () => {
    // increases: 2 (0→2), 2 (2→4), 4 (0→4) → N = 2 (most frequent)
    expect(unitOf('a\n  b\n    c\nd\n    e')).toEqual({ tab: false, spaces: 2 });
    // increases 3,3 then 2 → 3
    expect(unitOf('a\n   b\n      c\nd\n  e\nf\n   g')).toEqual({ tab: false, spaces: 3 });
  });

  it('RULE-09 ties between increases go to the smaller N', () => {
    // increases: 4 once, 2 once → 2
    expect(unitOf('a\n    b\nc\n  d')).toEqual({ tab: false, spaces: 2 });
    expect(unitOf('a\n  b\nc\n    d')).toEqual({ tab: false, spaces: 2 });
  });

  it('RULE-09 with no increase, N is the smallest positive leading-space count', () => {
    expect(unitOf('      a\n    b\n   c')).toEqual({ tab: false, spaces: 3 });
    expect(unitOf('  a')).toEqual({ tab: false, spaces: 2 });
  });

  it('RULE-09 blank lines are skipped when comparing consecutive lines', () => {
    // 0 → (blank) → 3: the increase is 3, not 0 → 3 via the blank line's 6 spaces
    expect(unitOf('a\n      \n   b\n      c')).toEqual({ tab: false, spaces: 3 });
  });

  it('RULE-09 a tab unit still computes N from space-indented lines and converts them', () => {
    const src = '[\n\t1,\n\t[\n\t\t2,\n    3\n\t]\n]';
    expect(unitOf(src)).toEqual({ tab: true, spaces: 4 });
    expect(reindentText(src, sp(2))?.text).toBe('[\n  1,\n  [\n    2,\n  3\n  ]\n]');
  });

  it('RULE-09 a tab unit with no space-indented lines keeps leading spaces unchanged', () => {
    const src = '[\n\t1,\n\t\t2\n]';
    expect(unitOf(src)).toEqual({ tab: true, spaces: null });
    expect(reindentText(src, sp(4))?.text).toBe('[\n    1,\n        2\n]');
  });

  it('RULE-09 spaces that are not a whole number of units are kept after the converted units', () => {
    // N = 2; 5 spaces = 2 units + 1 space
    expect(reindentText('a\n  b\n    c\n     d', TAB)?.text).toBe('a\n\tb\n\t\tc\n\t\t d');
    // 1 space with N = 2: 0 units, 1 space kept
    expect(reindentText('a\n  b\n    c\n d', sp(4))?.text).toBe('a\n    b\n        c\n d');
  });

  it('RULE-09 mixed tabs and spaces: each tab is one unit, spaces ⌊count ÷ N⌋ units, rest kept', () => {
    // unit: spaces (2 space-starts vs 1 tab-start), N = 2; "\t   x" = 1 + 1 units + 1 space
    const src = 'a\n  b\n    c\n\t   x';
    expect(reindentText(src, sp(4))?.text).toBe('a\n    b\n        c\n         x');
    // a space before a tab: still 1 tab + 2 spaces = 2 units
    expect(reindentText('a\n  b\n    c\n  \td', TAB)?.text).toBe('a\n\tb\n\t\tc\n\t\td');
  });

  it('RULE-09 blank lines, whitespace-only lines and line breaks are unchanged', () => {
    const src = '{\n\n    "a": 1,\n   \t \n    "b": 2\n}\n';
    expect(reindentText(src, sp(2))?.text).toBe('{\n\n  "a": 1,\n   \t \n  "b": 2\n}\n');
    // a final whitespace-only line without a line break
    expect(reindentText('[\n    1\n    ', sp(2))?.text).toBe('[\n  1\n    ');
  });

  it('RULE-09 lines with no indentation are unchanged and content whitespace is untouched', () => {
    const src = '{\n  "a b":  "x\\ty",\n  "c": 1}  ';
    expect(reindentText(src, sp(4))?.text).toBe('{\n    "a b":  "x\\ty",\n    "c": 1}  ');
  });

  it('RULE-09 the custom widths 1–8 are honoured', () => {
    for (let w = 1; w <= 8; w++)
      expect(reindentText('[\n  [\n    1\n  ]\n]', sp(w))?.text).toBe(
        `[\n${' '.repeat(w)}[\n${' '.repeat(2 * w)}1\n${' '.repeat(w)}]\n]`,
      );
  });

  it('RULE-09 the result does not depend on how the text is cut into chunks', () => {
    const src = '{\n    "a": [\n\t    1,\n  \n        2\n    ],\n     "b": "x  y"\n}\n';
    const whole = reindentText(src, TAB)!.text;
    for (const size of [1, 2, 3, 5, 7, 64]) expect(chunked(src, TAB, size)).toBe(whole);
  });

  it('F-004.R7 the predicted size change matches the converted text', () => {
    const cases: [string, IndentStyle][] = [
      [doc4, TAB],
      [docTab, sp(8)],
      ['a\n  b\n    c\n     d\n\t e', sp(3)],
      ['[\n\t1,\n\t\t2\n  ]', sp(4)],
      ['[\n 1,\n  [\n   2\n  ]\n]', sp(4)],
    ];
    for (const [src, target] of cases) {
      const scan = new IndentScanner();
      scan.feed(src);
      const stats = scan.end();
      const unit = detectUnit(stats)!;
      const out = reindentText(src, target)!.text;
      expect(reindentDelta(stats, unit, target)).toBe(out.length - src.length);
    }
  });
});
