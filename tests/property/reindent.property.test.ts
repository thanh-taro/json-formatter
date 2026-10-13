// Property-based tests of the MOD-Core re-indenter (RULE-09, F-004.R2, ADR-0010): for any text
// of lines with random indentation and content (valid JSON or not), re-indenting changes only the
// leading run of spaces and tabs of each line — same number of lines, every line's text after its
// indentation identical — is independent of chunking, and its predicted size is exact.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { detectUnit, IndentScanner, Reindenter, reindentDelta, reindentIsNoop, type IndentStyle } from '../../src/core';

const NUM_RUNS = Number(process.env['NUM_RUNS'] ?? 10_000);

const indent = fc.stringMatching(/^[ \t]{0,12}$/);
const rest = fc.oneof(
  fc.constant(''),
  fc.stringMatching(/^[^ \t\n][^\n]{0,12}$/),
  fc.constantFrom('"a": [1, 2],', '}', '],', '"x\\ty":  1', '{"k": "v"  }'),
);
const lines = fc.array(fc.tuple(indent, rest), { maxLength: 30 });
const target: fc.Arbitrary<IndentStyle> = fc.oneof(
  fc.constant<IndentStyle>({ kind: 'tab' }),
  fc.integer({ min: 1, max: 8 }).map((width): IndentStyle => ({ kind: 'spaces', width })),
);
const lead = (line: string) => /^[ \t]*/.exec(line)![0].length;

function run(text: string, style: IndentStyle, size: number) {
  const scan = new IndentScanner();
  for (let i = 0; i < text.length; i += size) scan.feed(text.slice(i, i + size));
  const stats = scan.end();
  const unit = detectUnit(stats);
  if (!unit) return null;
  const r = new Reindenter(unit, style);
  let out = '';
  for (let i = 0; i < text.length; i += size) out += r.feed(text.slice(i, i + size));
  return {
    out: out + r.end(),
    delta: reindentDelta(stats, unit, style),
    unit,
    noop: reindentIsNoop(stats, unit, style),
  };
}

describe('RULE-09 re-indent properties', () => {
  it('F-004.R2 RULE-09 re-indenting changes only leading indentation, at any chunking', () => {
    fc.assert(
      fc.property(lines, target, fc.integer({ min: 1, max: 9 }), fc.boolean(), (ls, style, size, finalBreak) => {
        const text = ls.map(([a, b]) => a + b).join('\n') + (finalBreak && ls.length ? '\n' : '');
        const whole = run(text, style, Math.max(1, text.length));
        const res = run(text, style, size);
        const indented = ls.some(([a, b]) => a.length > 0 && b.length > 0);
        if (!indented) {
          expect(res).toBeNull();
          return;
        }
        expect(res).not.toBeNull();
        const { out, delta, unit, noop } = res!;
        expect(out).toBe(whole!.out);
        expect(delta).toBe(out.length - text.length);
        expect(noop).toBe(out === text);
        const before = text.split('\n');
        const after = out.split('\n');
        expect(after.length).toBe(before.length);
        for (let i = 0; i < before.length; i++) {
          const a = before[i]!;
          const b = after[i]!;
          // the text after the indentation is unchanged
          expect(b.slice(lead(b))).toBe(a.slice(lead(a)));
          // blank lines are unchanged
          if (lead(a) === a.length) expect(b).toBe(a);
          else {
            // independent oracle (review m-4): tabs + ⌊spaces ÷ N⌋ units, then N's remainder
            const ind = a.slice(0, lead(a));
            const tabs = ind.split('\t').length - 1;
            const spaces = ind.length - tabs;
            const n = unit.spaces;
            const units = n === null ? tabs : tabs + Math.floor(spaces / n);
            const kept = n === null ? spaces : spaces % n;
            const unitText = style.kind === 'tab' ? '\t' : ' '.repeat(style.width);
            expect(b.slice(0, lead(b))).toBe(unitText.repeat(units) + ' '.repeat(kept));
          }
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
