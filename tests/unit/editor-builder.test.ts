// MOD-Editor document builder (ADR-0006 §1) and the worker mirror (ADR-0005 §2): both must give
// exactly the text the editor would hold, whatever the chunking.
import { ChangeSet, Text } from '@codemirror/state';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { TextBuilder, textChunks } from '../../src/editor/builder';
import { Mirror, MirrorBuilder } from '../../src/worker/mirror';

const lines = (s: string) => s.split(/\r\n?|\n/);
const piece = fc
  .array(fc.constantFrom('a', 'bc', 'é', '😀', '\n', '\r\n', '\r', ' ', '{}'), { maxLength: 40 })
  .map((a) => a.join(''));

function chunked(text: string, cuts: number[]): string[] {
  const points = [...new Set(cuts.map((c) => c % (text.length + 1)))].sort((a, b) => a - b);
  const out: string[] = [];
  let prev = 0;
  for (const p of points) {
    out.push(text.slice(prev, p));
    prev = p;
  }
  out.push(text.slice(prev));
  return out;
}

describe('document builder', () => {
  it('F-001.R2 F-001.R3 the pending text equals the file text split on LF, CRLF and CR, for any chunking', () => {
    fc.assert(
      fc.property(piece, fc.array(fc.nat(), { maxLength: 8 }), (text, cuts) => {
        const b = new TextBuilder();
        for (const c of chunked(text, cuts)) b.push(c);
        const doc = b.finish();
        expect(doc.toJSON()).toEqual(lines(text));
      }),
      { numRuns: 2000 },
    );
  });

  it('F-001.R8 builder works in bounded slices and finishes a long single line', () => {
    const b = new TextBuilder();
    const long = 'x'.repeat(3_000_000);
    b.push(long.slice(0, 1_000_000));
    b.push(long.slice(1_000_000));
    let steps = 0;
    while (!b.step(0)) steps++;
    expect(steps).toBeGreaterThan(3);
    const doc = b.finish();
    expect(doc.lines).toBe(1);
    expect(doc.length).toBe(3_000_000);
  });

  it('F-001.R1 textChunks reproduces the document with the requested line break', () => {
    const doc = Text.of(['{', '  "a": 1', '}']);
    expect([...textChunks(doc, '\n', 4)].join('')).toBe('{\n  "a": 1\n}');
    expect([...textChunks(doc, '\r\n')].join('')).toBe('{\r\n  "a": 1\r\n}');
  });
});

describe('worker mirror', () => {
  it('F-001.R1 the mirror builder normalises breaks like the editor, for any chunking', () => {
    fc.assert(
      fc.property(piece, fc.array(fc.nat(), { maxLength: 8 }), (text, cuts) => {
        const b = new MirrorBuilder();
        for (const c of chunked(text, cuts)) b.push(c);
        expect(b.finish().toString()).toBe(lines(text).join('\n'));
      }),
      { numRuns: 2000 },
    );
  });

  it('F-001.R1 the mirror follows random editor change sets exactly (vs the editor Text)', () => {
    const changeArb = fc.array(fc.tuple(fc.nat(), fc.nat(20), piece), { minLength: 1, maxLength: 4 });
    fc.assert(
      fc.property(piece, fc.array(changeArb, { minLength: 1, maxLength: 6 }), (start, steps) => {
        let doc = Text.of(lines(start));
        let mirror = Mirror.of([doc.sliceString(0)]);
        for (const step of steps) {
          const specs = step
            .map(([at, len, insert]) => {
              const from = at % (doc.length + 1);
              return { from, to: Math.min(doc.length, from + len), insert };
            })
            .sort((a, b) => a.from - b.from)
            .filter((c, i, arr) => i === 0 || c.from >= arr[i - 1]!.to);
          const cs = ChangeSet.of(specs, doc.length);
          // round-trip through JSON as it crosses the thread boundary
          const sent = ChangeSet.fromJSON(cs.toJSON());
          doc = cs.apply(doc);
          mirror = mirror.apply(sent);
          expect(mirror.length).toBe(doc.length);
          expect(mirror.toString()).toBe(doc.sliceString(0));
        }
      }),
      { numRuns: 1000 },
    );
  });

  it('F-001.R4 large mirrors stay in ~1 M-unit chunks and export with the document line ending', () => {
    const b = new MirrorBuilder();
    for (let i = 0; i < 5; i++) b.push('a'.repeat(700_000) + '\r\n');
    const m = b.finish();
    expect(m.chunks.length).toBeGreaterThan(1);
    expect(Math.max(...m.chunks.map((c) => c.length))).toBeLessThanOrEqual(4 << 20);
    expect(m.length).toBe(5 * 700_001);
    expect([...m.iter('\r\n')].join('')).toBe(('a'.repeat(700_000) + '\r\n').repeat(5));
    const cs = ChangeSet.of({ from: 0, to: m.length }, m.length);
    expect(m.apply(cs).length).toBe(0);
  });
});
