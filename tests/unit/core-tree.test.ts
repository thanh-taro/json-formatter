// MOD-Core tree scans (ADR-0007 §2) against an independent oracle: kinds, spans, child counts,
// decoded keys, RULE-06 paths and RULE-11 values, on chunked text (chunks are not line-aligned,
// so tokens cross chunk boundaries) with skip tables of several thresholds; RULE-12 grouping.
import { describe, expect, it } from 'vitest';
import {
  formatPath,
  groupSize,
  isContainer,
  kindName,
  TreeIndex,
  Validator,
  KIND_OBJECT,
  type ContainerRef,
  type SkipTable,
  type TreeItem,
} from '../../src/core';
import {
  crlf,
  deepChains,
  mulberry,
  oracleParse,
  oraclePath,
  records,
  TRICKY,
  wideObject,
  withBigArray,
  type ONode,
} from '../support/tree-oracle';

/** The document as the worker mirror holds it: breaks normalised to '\n', cut into chunks. */
function mirrorOf(src: string, chunk: number): { chunks: string[]; norm: string } {
  const norm = src.replace(/\r\n?/g, '\n');
  const chunks: string[] = [];
  for (let i = 0; i < norm.length; i += chunk) chunks.push(norm.slice(i, i + chunk));
  return { chunks, norm };
}

function skipTableOf(chunks: string[], threshold: number, minCapacity?: number): SkipTable {
  const v = new Validator({
    skipTable: true,
    warnings: false,
    skipThreshold: threshold,
    ...(minCapacity ? { skipMinCapacity: minCapacity } : {}),
  });
  for (const c of chunks) v.feed(c);
  const out = v.end();
  expect(out.validity).toBe('valid');
  return out.skipTable!;
}

const ref = (it: TreeItem): ContainerRef => ({ s: it.s, e: it.e, n: it.n, kind: it.kind });

/** Raw position of each normalised position (CRLF documents have one more unit per break). */
function rawPositions(src: string): (pos: number) => number {
  const map: number[] = [];
  for (let i = 0; i < src.length; i++) {
    map.push(i);
    if (src[i] === '\r' && src[i + 1] === '\n') i++;
  }
  map.push(src.length);
  return (pos) => map[pos]!;
}

function sample(src: string, k: number, seed: number): { nodes: ONode[]; total: number } {
  const rnd = mulberry(seed);
  const nodes: ONode[] = [];
  let total = 0;
  oracleParse(src, (n) => {
    total++;
    if (nodes.length < k) nodes.push(n);
    else {
      const j = Math.floor(rnd() * total);
      if (j < k) nodes[j] = n;
    }
  });
  return { nodes, total };
}

/** Navigates from the root to sampled nodes with 1-child queries and compares everything. */
function check(src: string, threshold: number, chunk: number, k = 600): number {
  const { chunks } = mirrorOf(src, chunk);
  const index = new TreeIndex(chunks, skipTableOf(chunks, threshold));
  const raw = rawPositions(src);
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  const { nodes } = sample(src, k, 12345);
  const root = index.root();
  for (const o of nodes) {
    let item = root;
    const parts: (string | number)[] = [];
    for (const idx of o.idxPath) {
      const rows = index.children(ref(item), idx, 1);
      expect(rows.length).toBe(1);
      const r = rows[0]!;
      expect(r.i).toBe(idx);
      parts.push(item.kind === KIND_OBJECT ? r.k! : r.i);
      item = r;
    }
    const where = oraclePath(o.parts);
    expect(kindName(item.kind), where).toBe(o.kind);
    expect(raw(item.s), where).toBe(o.s);
    expect(raw(item.e), where).toBe(o.e);
    expect(item.n, where).toBe(isContainer(item.kind) ? o.n : 0);
    // RULE-06: the formatter on decoded keys equals the independent formatter
    expect(formatPath(parts)).toBe(oraclePath(o.parts));
    // RULE-11: the span is exactly the source text (breaks written in the document's ending)
    expect(index.text(item.s, item.e).replace(/\n/g, eol)).toBe(src.slice(o.s, o.e));
    if (item.v !== undefined) {
      const text = src.slice(o.s, o.e);
      expect(item.v).toBe(text.length > 200 ? text.slice(0, 200) : text);
      expect(!!item.vt).toBe(text.length > 200);
    }
  }
  return nodes.length;
}

describe('RULE-12 grouping arithmetic', () => {
  it('RULE-12 F-006.AC4 groups of 100 above 100 children, nested by factors of 100 above 10,000', () => {
    expect(groupSize(0)).toBe(1);
    expect(groupSize(100)).toBe(1);
    expect(groupSize(101)).toBe(100);
    expect(groupSize(250)).toBe(100); // [0 … 99] [100 … 199] [200 … 249]
    expect(groupSize(10_000)).toBe(100);
    expect(groupSize(10_001)).toBe(10_000);
    expect(groupSize(100_000)).toBe(10_000);
    expect(groupSize(1_000_000)).toBe(10_000);
    expect(groupSize(1_000_001)).toBe(1_000_000);
  });
});

describe('RULE-06 paths', () => {
  it('RULE-06 F-006.AC5 member names, indexes and the bracket form', () => {
    expect(formatPath([])).toBe('$');
    expect(formatPath(['items', 0, 'content-type'])).toBe('$.items[0]["content-type"]');
    expect(formatPath(['$x_1', '_a', 'A9'])).toBe('$.$x_1._a.A9');
  });

  it('RULE-06 names are decoded, then re-escaped minimally in the bracket form', () => {
    expect(formatPath(['a"b', '', '1a', 'a\nb', '\ud800', '日本', 'a/b', 'é', '😀'])).toBe(
      '$["a\\"b"][""]["1a"]["a\\nb"]["\\ud800"]["日本"]["a/b"]["é"]["😀"]',
    );
    expect(formatPath(['back\\slash', 'tab\tkey', '\u0001'])).toBe('$["back\\\\slash"]["tab\\tkey"]["\\u0001"]');
  });

  it('RULE-06 escaped keys in the document: "\\u0041BC" is $.ABC, duplicate keys share a path', () => {
    const index = new TreeIndex([TRICKY], skipTableOf([TRICKY], 4096));
    const root = index.root();
    const rows = index.children(ref(root), 0, root.n);
    const paths = rows.map((r) => formatPath([r.k!]));
    expect(paths).toContain('$.ABC');
    expect(paths).toContain('$["a\\"b"]');
    expect(paths).toContain('$["\\ud800"]');
    expect(paths).toContain('$["😀"]');
    expect(paths.filter((p) => p === '$.dup')).toHaveLength(2);
    const dups = rows.filter((r) => r.k === 'dup');
    expect(dups.map((r) => kindName(r.kind))).toEqual(['number', 'object']);
  });
});

describe('RULE-11 values and F-006.R2 rows', () => {
  it('F-006.AC2 user (object, 2 children), id 12345678901234567890, tags (array, 1 child)', () => {
    const src = '{"user":{"id":12345678901234567890,"tags":["a"]}}';
    const index = new TreeIndex([src], null);
    const root = index.root();
    expect(root).toMatchObject({ kind: KIND_OBJECT, n: 1, s: 0, e: src.length });
    const [user] = index.children(ref(root), 0, 1);
    expect(user).toMatchObject({ k: 'user', n: 2 });
    expect(kindName(user!.kind)).toBe('object');
    const [id, tags] = index.children(ref(user!), 0, 2);
    expect(id).toMatchObject({ k: 'id', v: '12345678901234567890' });
    expect(kindName(id!.kind)).toBe('number');
    expect(tags).toMatchObject({ k: 'tags', n: 1 });
    expect(kindName(tags!.kind)).toBe('array');
  });

  it('RULE-11 F-006.AC6 a number keeps its spelling (1.50, -0, 1E+2) and strings keep quotes and escapes', () => {
    const src = '[1.50, -0, 1E+2, "say \\"hi\\" \\u00e9", true, null, {"a": [1]}]';
    const index = new TreeIndex([src], null);
    const rows = index.children(ref(index.root()), 0, 7);
    expect(rows.map((r) => index.text(r.s, r.e))).toEqual([
      '1.50',
      '-0',
      '1E+2',
      '"say \\"hi\\" \\u00e9"',
      'true',
      'null',
      '{"a": [1]}',
    ]);
    expect(rows.map((r) => kindName(r.kind))).toEqual([
      'number',
      'number',
      'number',
      'string',
      'boolean',
      'null',
      'object',
    ]);
  });

  it('RULE-11 CRLF documents: spans are editor positions and values come back byte-exact', () => {
    expect(check(crlf(TRICKY), 8, 7)).toBeGreaterThan(100);
  });

  it('F-006 edge case: a top-level scalar is a single root row', () => {
    for (const src of [' "x\\"y" ', '\ufeff 42', 'true\n', '-1.5e3']) {
      const index = new TreeIndex([src], null);
      const root = index.root();
      expect(isContainer(root.kind)).toBe(false);
      expect(index.text(root.s, root.e)).toBe(src.replace(/^\ufeff/, '').trim());
    }
  });

  it('F-006 edge case: very long strings are cut at 200 characters in the row, the span stays whole', () => {
    const index = new TreeIndex([TRICKY], null);
    const root = index.root();
    const long = index.children(ref(root), 0, root.n).find((r) => r.k === 'long')!;
    expect(long.v).toHaveLength(200);
    expect(long.vt).toBe(1);
    expect(long.e - long.s).toBe(502);
  });
});

describe('tree queries vs the oracle (chunked, several skip thresholds)', () => {
  const cases: [string, () => string, number[], number[]][] = [
    ['tricky', () => TRICKY, [8, 64, 4096], [5, 64, 1 << 20]],
    ['tricky CRLF', () => crlf(TRICKY), [8, 4096], [3, 1 << 20]],
    ['BOM', () => '\ufeff{"a":[1,2],"b":{"c":"d"}}', [1, 4096], [2, 100]],
    ['records 400 KB', () => records(400_000), [1024, 4096], [4093, 1 << 16]],
    ['records CRLF', () => crlf(records(200_000, 2)), [4096], [1000]],
    ['big array 20k', () => withBigArray(20_000, 100_000), [1024, 4096], [777, 1 << 20]],
    ['wide object 30k', () => wideObject(30_000), [4096], [997]],
    ['deep chains', () => deepChains(120, 200), [64], [509]],
  ];
  for (const [name, gen, thresholds, chunkSizes] of cases)
    for (const t of thresholds)
      for (const c of chunkSizes)
        it(`RULE-06 RULE-11 ${name}: threshold ${t}, chunks of ${c}`, () => {
          expect(check(gen(), t, c)).toBeGreaterThan(0);
        });
});

describe('blocks and checkpoints (ADR-0007 §2)', () => {
  it('ADR-0007 every block of a 20,000-child array equals the oracle in random order, before and after the background fill', () => {
    const src = withBigArray(20_000, 50_000);
    const { chunks } = mirrorOf(src, 65_537);
    const index = new TreeIndex(chunks, skipTableOf(chunks, 4096));
    const kids: ONode[] = [];
    oracleParse(src, (n) => {
      if (n.idxPath.length === 2 && n.idxPath[0] === 1) kids.push(n);
    });
    kids.sort((a, b) => a.s - b.s);
    const root = index.root();
    const big = index.children(ref(root), 1, 1)[0]!;
    expect(big.n).toBe(20_000);
    const c = ref(big);
    const rnd = mulberry(7);
    const blocks = Array.from({ length: 200 }, (_, b) => b).sort(() => rnd() - 0.5);
    for (const pass of [0, 1]) {
      if (pass === 1) while (!index.fill(c, 1000));
      expect(index.complete(c)).toBe(pass === 1);
      for (const b of blocks.slice(0, 50)) {
        const rows = index.children(c, b * 100, 100);
        expect(rows).toHaveLength(100);
        rows.forEach((r, j) => {
          expect(r.i).toBe(b * 100 + j);
          expect(r.s).toBe(kids[b * 100 + j]!.s);
          expect(r.e).toBe(kids[b * 100 + j]!.e);
        });
      }
    }
  });

  it('ADR-0007 a bounded skip table (threshold doubling) still answers exactly', () => {
    const src = deepChains(400, 300);
    const chunks = [src];
    const table = skipTableOf(chunks, 16, 64);
    expect(table.threshold).toBeGreaterThan(16);
    const index = new TreeIndex(chunks, table);
    const root = index.root();
    expect(root.n).toBe(400);
    const rows = index.children(ref(root), 250, 100);
    expect(rows).toHaveLength(100);
    expect(index.text(rows[0]!.s, rows[0]!.e)).toBe('['.repeat(300) + '1' + ']'.repeat(300));
  });
});
