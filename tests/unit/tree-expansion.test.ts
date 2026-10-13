// MOD-Tree expansion kept across document versions (F-006 edge case; review F-006 M1): a
// snapshot by path re-applied on the row model of the next version.
import { describe, expect, it } from 'vitest';
import { GROUP, KIND_OBJECT, TreeIndex, type ContainerRef } from '../../src/core';
import { restoreExpansion, snapshotOf, type Position } from '../../src/tree/expansion';
import { RowModel, type Cont, type Row } from '../../src/tree/rowmodel';

/** A model of `src` with RULE-12 initial expansion and a synchronous-style block loader. */
async function build(src: string) {
  const index = new TreeIndex([src], null);
  const m = new RowModel(index.root());
  let fetched = 0;
  const load = async (c: Cont, block: number) => {
    fetched++;
    m.put(c.s, block, index.children(c as ContainerRef, block * GROUP, GROUP));
  };
  const rootNode = m.expandInitial();
  if (rootNode && rootNode.g === 1) {
    await load(rootNode.cont, 0);
    m.expandChildren(rootNode);
  }
  const fill = async () => {
    for (let i = 0; i < m.total; i++) {
      const r = m.rowAt(i);
      if (r.type === 'item' && !r.item) await load(r.node.cont, Math.floor(r.idx / GROUP));
    }
  };
  await fill();
  return { m, load, fill, fetched: () => fetched };
}

const label = (m: RowModel, r: Row): string => {
  if (r.type === 'group') return `[${r.a} … ${r.b}]`;
  if (!r.item) return '?';
  if (r.node === m.top) return '$';
  return r.node.cont.kind === KIND_OBJECT ? r.item.k! : String(r.item.i);
};

/** The visible rows as `path +/-` lines. */
function shown(m: RowModel): string[] {
  const out: string[] = [];
  for (let i = 0; i < m.total; i++) {
    const r = m.rowAt(i);
    const path = m.pathOf(r) ?? label(m, r);
    out.push(`${path}${r.expanded ? ' -' : ''}`);
  }
  return out;
}

function find(m: RowModel, path: string): Position {
  for (let i = 0; i < m.total; i++) {
    const r = m.rowAt(i);
    if ((m.pathOf(r) ?? label(m, r)) === path) return { node: r.node, entry: r.entry };
  }
  throw new Error(`no row ${path}`);
}

const expand = (m: RowModel, path: string) => {
  const at = find(m, path);
  m.expand(m.describe(at.node, at.entry));
};

describe('F-006 expansion kept by path across versions', () => {
  it('F-006 a deep expanded node stays expanded after a member is inserted before it; the cursor follows', async () => {
    const v1 = await build('{"order": {"items": [{"meta": {"a": [1]}}, 2]}, "z": {"k": 1}}');
    expand(v1.m, '$.order.items');
    await v1.fill();
    expand(v1.m, '$.order.items[0]');
    await v1.fill();
    expand(v1.m, '$.order.items[0].meta');
    await v1.fill();
    // the user collapsed "z" (a direct child of the root)
    const z = find(v1.m, '$.z');
    v1.m.collapse(v1.m.describe(z.node, z.entry));
    const snap = snapshotOf(v1.m, find(v1.m, '$.order.items[0].meta.a'), true, 0);

    const v2 = await build('{"new": 0, "order": {"x": 1, "items": [{"meta": {"a": [1, 2]}}, 2]}, "z": {"k": 1}}');
    const at = await restoreExpansion(v2.m, snap, v2.load);
    await v2.fill();
    expect(shown(v2.m)).toEqual([
      '$ -',
      '$.new',
      '$.order -',
      '$.order.x',
      '$.order.items -',
      '$.order.items[0] -',
      '$.order.items[0].meta -',
      '$.order.items[0].meta.a',
      '$.order.items[1]',
      // RULE-12 for everything else: a direct child of the root is expanded
      '$.z -',
      '$.z.k',
    ]);
    expect(at && v2.m.pathOf(v2.m.describe(at.node, at.entry))).toBe('$.order.items[0].meta.a');
  });

  it('F-006 paths that no longer exist are dropped; a key that moved is found by name', async () => {
    const v1 = await build('{"a": {"b": {"c": 1}}, "d": {"e": {"f": 1}}}');
    expand(v1.m, '$.a.b');
    expand(v1.m, '$.d.e');
    await v1.fill();
    const snap = snapshotOf(v1.m, find(v1.m, '$.a.b'), true, 0);
    // "a" is gone; "e" moved to the second member position of "d"
    const v2 = await build('{"d": {"y": 0, "e": {"f": 1}}}');
    const at = await restoreExpansion(v2.m, snap, v2.load);
    await v2.fill();
    expect(shown(v2.m)).toEqual(['$ -', '$.d -', '$.d.y', '$.d.e -', '$.d.e.f']);
    // the cursor's path is gone: it lands on the nearest row that still exists (the root)
    expect(at && v2.m.pathOf(v2.m.describe(at.node, at.entry))).toBe('$');
  });

  it('RULE-12 F-006 expanded groups whose ranges still exist are re-expanded, array children by index', async () => {
    const arr = (n: number) => '[' + Array.from({ length: n }, (_, i) => `[${i}]`).join(',') + ']';
    const v1 = await build(`{"list": ${arr(250)}}`);
    expand(v1.m, '[200 … 249]');
    await v1.fill();
    expand(v1.m, '$.list[201]');
    await v1.fill();
    const snap = snapshotOf(v1.m, find(v1.m, '$.list[201][0]'), true, 0);
    const v2 = await build(`{"list": ${arr(260)}}`);
    const at = await restoreExpansion(v2.m, snap, v2.load);
    await v2.fill();
    const rows = shown(v2.m);
    expect(rows).toContain('[200 … 259] -');
    expect(rows).toContain('$.list[201] -');
    expect(at && v2.m.pathOf(v2.m.describe(at.node, at.entry))).toBe('$.list[201][0]');
  });

  it('F-006 the replay fetches at most the given number of blocks', async () => {
    const members = Array.from({ length: 300 }, (_, i) => `"k${i}": {"v": ${i}}`).join(',');
    const v1 = await build(`{"o": {${members}}}`);
    for (let g = 0; g < 3; g++) expand(v1.m, `[${g * 100} … ${g * 100 + 99}]`);
    await v1.fill();
    for (let i = 0; i < 300; i += 10) expand(v1.m, `$.o.k${i}`);
    await v1.fill();
    const snap = snapshotOf(v1.m, null, false, 0);
    const v2 = await build(`{"o": {"first": 0, ${members}}}`);
    const before = v2.fetched();
    await restoreExpansion(v2.m, snap, v2.load, 2);
    expect(v2.fetched() - before).toBeLessThanOrEqual(2);
  });
});
