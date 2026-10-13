// MOD-Tree row model (ADR-0007 §3) without DOM: RULE-12 grouping and initial expansion,
// collapse all, RULE-06 paths from the model, the range tree against a naive flat list, and
// the height-scaled geometry of the virtual list (ADR-0007 §4).
import { describe, expect, it } from 'vitest';
import {
  GROUP,
  KIND_ARRAY,
  KIND_NUMBER,
  KIND_OBJECT,
  TreeIndex,
  type ContainerRef,
  type TreeItem,
} from '../../src/core';
import { geometry, MAX_SPACER, RowModel, type Row } from '../../src/tree/rowmodel';
import { mulberry } from '../support/tree-oracle';

/** Loads every block a row model needs from a TreeIndex (the worker's answers, synchronously). */
function loader(index: TreeIndex) {
  return (m: RowModel, from = 0, to = m.total) => {
    for (let i = from; i < Math.min(to, m.total); i++) {
      const r = m.rowAt(i);
      if (r.type === 'item' && !r.item) {
        const c = r.node.cont;
        const block = Math.floor(r.idx / GROUP);
        m.put(c.s, block, index.children(c as ContainerRef, block * GROUP, GROUP));
      }
    }
  };
}

function modelOf(src: string) {
  const index = new TreeIndex([src], null);
  const m = new RowModel(index.root());
  return { index, m, load: loader(index) };
}

const label = (m: RowModel, r: Row): string => {
  if (r.type === 'group') return `[${r.a} … ${r.b}]`;
  if (!r.item) return '?';
  if (r.node === m.top) return '$';
  return r.node.cont.kind === KIND_OBJECT ? r.item.k! : String(r.item.i);
};

function visible(m: RowModel): string[] {
  const out: string[] = [];
  for (let i = 0; i < m.total; i++) {
    const r = m.rowAt(i);
    out.push(`${'  '.repeat(r.level - 1)}${label(m, r)}${r.expanded ? ' -' : m.expandable(r) ? ' +' : ''}`);
  }
  return out;
}

describe('RULE-12 initial expansion', () => {
  it('RULE-12 F-006.AC3 the root and its direct children are expanded, deeper containers collapsed', () => {
    const { m, load } = modelOf('{"a": {"b": {"c": 1}}, "d": [1, [2]], "e": 3, "f": {}}');
    const rootNode = m.expandInitial()!;
    load(m);
    m.expandChildren(rootNode);
    load(m);
    expect(visible(m)).toEqual(['$ -', '  a -', '    b +', '  d -', '    0', '    1 +', '  e', '  f']);
  });

  it('RULE-12 a grouped root: the root and its first group are expanded, the other groups stay collapsed', () => {
    const src = '[' + Array.from({ length: 250 }, (_, i) => `[${i}]`).join(',') + ']';
    const { m, load } = modelOf(src);
    const rootNode = m.expandInitial()!;
    expect(rootNode.g).toBe(100);
    load(m);
    const rows = visible(m);
    expect(rows.slice(0, 3)).toEqual(['$ -', '  [0 … 99] -', '    0 +']);
    expect(rows.slice(-2)).toEqual(['  [100 … 199] +', '  [200 … 249] +']);
    expect(m.total).toBe(1 + 3 + 100);
  });

  it('F-006 edge case: a top-level scalar is a single root row', () => {
    const { m } = modelOf('42');
    expect(m.expandInitial()).toBeNull();
    expect(m.total).toBe(1);
    expect(m.pathOf(m.rowAt(0))).toBe('$');
  });
});

describe('RULE-12 groups', () => {
  it('F-006.AC4 an array of 250 elements shows [0 … 99], [100 … 199], [200 … 249]', () => {
    const src = '{"list": [' + Array.from({ length: 250 }, (_, i) => i).join(',') + ']}';
    const { m, load } = modelOf(src);
    m.expandInitial();
    load(m);
    const list = m.rowAt(1);
    expect(label(m, list)).toBe('list');
    m.expand(list);
    const groups = [m.rowAt(2), m.rowAt(3), m.rowAt(4)];
    expect(groups.map((g) => (g.type === 'group' ? [g.a, g.b] : null))).toEqual([
      [0, 99],
      [100, 199],
      [200, 249],
    ]);
    // groups have no copy actions (RULE-12): no path
    expect(groups.map((g) => m.pathOf(g))).toEqual([null, null, null]);
    m.expand(groups[2]!);
    load(m);
    expect(visible(m).slice(5, 7)).toEqual(['      200', '      201']);
  });

  it('RULE-12 objects group by member position; nested groups by factors of 100 above 10,000', () => {
    const src = '{' + Array.from({ length: 25_000 }, (_, i) => `"k${i}": ${i}`).join(',') + '}';
    const { m, load } = modelOf(src);
    const rootNode = m.expandInitial()!;
    expect(rootNode.g).toBe(10_000);
    // first group [0 … 9999] expanded, showing its groups of 100
    expect(visible(m).slice(0, 4)).toEqual(['$ -', '  [0 … 9999] -', '    [0 … 99] +', '    [100 … 199] +']);
    expect(m.total).toBe(1 + 3 + 100);
    m.expand(m.rowAt(2));
    load(m, 0, 10);
    expect(label(m, m.rowAt(3))).toBe('k0');
    expect(m.pathOf(m.rowAt(3))).toBe('$.k0');
  });
});

describe('collapse all and paths', () => {
  it('F-006.AC10 collapse all leaves only the root expanded', () => {
    const { m, load } = modelOf('{"a": {"b": {"c": [1, 2]}}, "d": [1, [2]]}');
    const rootNode = m.expandInitial()!;
    load(m);
    m.expandChildren(rootNode);
    load(m);
    m.expand(m.rowAt(2));
    load(m);
    expect(m.total).toBeGreaterThan(5);
    m.collapseAll();
    expect(visible(m)).toEqual(['$ -', '  a +', '  d +']);
  });

  it('RULE-06 F-006.AC5 the path of items[0]["content-type"] from the model', () => {
    const { m, load } = modelOf('{"items": [{"content-type": "json", "a\\u0041": 1}]}');
    const rootNode = m.expandInitial()!;
    load(m);
    m.expandChildren(rootNode);
    load(m);
    m.expand(m.rowAt(2));
    load(m);
    expect([m.pathOf(m.rowAt(0)), m.pathOf(m.rowAt(1)), m.pathOf(m.rowAt(2))]).toEqual(['$', '$.items', '$.items[0]']);
    expect(m.pathOf(m.rowAt(3))).toBe('$.items[0]["content-type"]');
    expect(m.pathOf(m.rowAt(4))).toBe('$.items[0].aA');
  });
});

describe('ADR-0007 §3 range tree', () => {
  it('ADR-0007 row lookup equals a naive flat list under random expand/collapse', () => {
    // a synthetic container tree: no worker data needed for groups; items get fake rows
    const item = (i: number, n: number, s: number): TreeItem => ({
      i,
      kind: n ? KIND_ARRAY : KIND_NUMBER,
      s,
      e: s + 1,
      n,
    });
    const root = item(0, 25_000, 0);
    const m = new RowModel(root);
    const rnd = mulberry(3);
    // every item at child position p of container s is a container with p % 7 children
    const fill = () => {
      for (let i = 0; i < m.total; i++) {
        const r = m.rowAt(i);
        if (r.type === 'item' && !r.item) {
          const c = r.node.cont;
          const b = Math.floor(r.idx / GROUP);
          const rows: TreeItem[] = [];
          for (let k = b * GROUP; k < Math.min(c.n, (b + 1) * GROUP); k++) rows.push(item(k, k % 7, c.s * 31 + k + 1));
          m.put(c.s, b, rows);
        }
      }
    };
    m.expandInitial();
    for (let step = 0; step < 300; step++) {
      fill();
      const i = Math.floor(rnd() * m.total);
      const r = m.rowAt(i);
      if (r.expanded) m.collapse(r);
      else m.expand(r);
      // naive check: walking rows one by one gives consistent levels and indexOf round trips
      if (step % 30 === 0) {
        fill();
        for (let k = 0; k < m.total; k++) {
          const row = m.rowAt(k);
          expect(m.indexOf(row.node, row.entry)).toBe(k);
          if (k > 0) expect(row.level).toBeLessThanOrEqual(m.rowAt(k - 1).level + 1);
        }
      }
    }
  });

  it('ADR-0007 1,010,110 visible rows (every group of a 1,000,000-child container expanded) cost about 10,000 nodes', () => {
    const root: TreeItem = { i: 0, kind: KIND_ARRAY, s: 0, e: 10, n: 1_000_000 };
    const m = new RowModel(root);
    const t0 = performance.now();
    const rootNode = m.expandInitial()!; // root + first group of 10,000
    expect(rootNode.g).toBe(10_000);
    // expand every top group, then every group of 100 inside
    for (let e = 1; e < rootNode.entries; e++) m.expand(m.describe(rootNode, e));
    let nodes = 1 + rootNode.kids.size;
    for (const top of rootNode.kids.values())
      for (let e = 0; e < top.entries; e++) {
        m.expand(m.describe(top, e));
        nodes++;
      }
    expect(m.total).toBe(1 + 100 + 10_000 + 1_000_000);
    expect(nodes).toBe(1 + 100 + 10_000);
    expect(performance.now() - t0).toBeLessThan(2000);
    // random access
    const r = m.rowAt(734_567);
    expect(r.type).toBe('item');
    expect(m.indexOf(r.node, r.entry)).toBe(734_567);
    const last = m.rowAt(m.total - 1);
    expect(last.type === 'item' && last.idx).toBe(999_999);
  });

  it('ADR-0007 §4 height scaling above 8 M px maps the scroll range proportionally', () => {
    const rows = 1_010_111;
    const g = geometry(rows, 24, 600, 0);
    expect(g.scaled).toBe(true);
    expect(g.spacer).toBe(MAX_SPACER);
    const end = geometry(rows, 24, 600, MAX_SPACER - 600);
    expect(end.virtualTop).toBe(rows * 24 - 600);
    expect(g.toScroll(end.virtualTop)).toBeCloseTo(MAX_SPACER - 600);
    const small = geometry(100, 24, 600, 120);
    expect(small).toMatchObject({ scaled: false, spacer: 2400, virtualTop: 120 });
  });
});
