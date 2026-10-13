// MOD-Core text helpers: size tiers, UTF-8 length, line-break scanning (RULE-02, RULE-17).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { LineBreakScanner, MB, documentBytes, dominantLineEnding, tierOf, utf8Length } from '../../src/core';
import { formatSize } from '../../src/copy';

describe('RULE-02 size tiers', () => {
  it('RULE-02 normal up to 10 MB, large above 10 MB up to 100 MB, very large above 100 MB', () => {
    expect(tierOf(0)).toBe('normal');
    expect(tierOf(10 * MB)).toBe('normal');
    expect(tierOf(10 * MB + 1)).toBe('large');
    expect(tierOf(30 * MB)).toBe('large');
    expect(tierOf(100 * MB)).toBe('large');
    expect(tierOf(100 * MB + 1)).toBe('very-large');
    expect(tierOf(150 * MB)).toBe('very-large');
  });

  it('RULE-02 sizes in messages use 1 MB = 1,000,000 bytes', () => {
    expect(formatSize(415)).toBe('415 B');
    expect(formatSize(1500)).toBe('1.5 KB');
    expect(formatSize(30_000_000)).toBe('30.0 MB');
    expect(formatSize(148_349_999)).toBe('148.3 MB');
  });
});

describe('UTF-8 length', () => {
  it('RULE-02 UTF-8 size counting matches TextEncoder for any text', () => {
    const enc = new TextEncoder();
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (s) => {
        expect(utf8Length(s)).toBe(enc.encode(s).length);
      }),
      { numRuns: 2000 },
    );
  });
});

function scan(chunks: string[]): LineBreakScanner {
  const s = new LineBreakScanner();
  for (const c of chunks) s.feed(c);
  return s.end();
}

describe('RULE-17 line endings', () => {
  it('RULE-17 dominant line ending wins, ties and no breaks give LF', () => {
    expect(dominantLineEnding({ lf: 0, crlf: 0 })).toBe('lf');
    expect(dominantLineEnding({ lf: 2, crlf: 2 })).toBe('lf');
    expect(dominantLineEnding({ lf: 1, crlf: 3 })).toBe('crlf');
    expect(dominantLineEnding({ lf: 3, crlf: 1 })).toBe('lf');
  });

  it('RULE-17 a CRLF split between two chunks counts once', () => {
    const s = scan(['{\r', '\n"a":1\r\n}']);
    expect(s.counts).toEqual({ lf: 0, crlf: 2, cr: 0 });
    expect(s.endsWithLineBreak).toBe(false);
  });

  it('RULE-17 lone CR is a break but neither LF nor CRLF', () => {
    const s = scan(['a\rb\r']);
    expect(s.counts).toEqual({ lf: 0, crlf: 0, cr: 2 });
    expect(s.endsWithLineBreak).toBe(true);
  });

  it('RULE-17 counts and sizes do not depend on how the text is split', () => {
    const enc = new TextEncoder();
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('a', 'é', '😀', '\n', '\r\n', '\r', '{', '"'), { maxLength: 60 }),
        fc.array(fc.nat(), { maxLength: 6 }),
        (parts, cuts) => {
          const text = parts.join('');
          const whole = scan([text]);
          const points = [...new Set(cuts.map((c) => c % (text.length + 1)))].sort((a, b) => a - b);
          const chunks: string[] = [];
          let prev = 0;
          for (const p of points) {
            chunks.push(text.slice(prev, p));
            prev = p;
          }
          chunks.push(text.slice(prev));
          const split = scan(chunks);
          expect(split.counts).toEqual(whole.counts);
          expect(split.nonBreakBytes).toBe(whole.nonBreakBytes);
          expect(split.endsWithLineBreak).toBe(whole.endsWithLineBreak);
          // the size written with one uniform line ending
          const lfText = text.replace(/\r\n?/g, '\n');
          expect(documentBytes(whole.nonBreakBytes, whole.breaks, 'lf')).toBe(enc.encode(lfText).length);
        },
      ),
      { numRuns: 1000 },
    );
  });
});
