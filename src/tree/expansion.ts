// MOD-Tree: expansion kept across document versions. A snapshot records the expanded containers
// and groups, the cursor and the scroll position by path (not by document position), and is
// re-applied on the row model of the next version. Pure: no DOM.
//
// Implements: F-006 edge case "after the document changes, nodes that still exist at the same
// path stay expanded; everything else follows RULE-12"; RULE-06 (paths as decoded names and
// indexes); INV-05 (a snapshot never carries positions of an older version).
import { GROUP, isContainer, KIND_ARRAY, KIND_OBJECT, type TreeItem } from '../core';
import type { Cont, RNode, RowModel } from './rowmodel';

/** One path part with the member position it had (objects: decoded name; arrays: index). */
interface Part {
  part: string | number;
  idx: number;
}

/** The expanded state below one expanded container, by path. */
export interface SnapNode {
  /** Expanded groups as [from … to], outer ones first. */
  groups: { from: number; to: number }[];
  /** Expanded child containers. */
  items: (Part & { snap: SnapNode })[];
}

/** A row by path: item steps from the root, then the range of a group row. */
export interface CursorPath {
  steps: Part[];
  group: { from: number; to: number } | null;
}

/** Expansion, selection and scroll of a tree, independent of document positions. */
export interface ExpansionSnapshot {
  /** Null when the root was collapsed. */
  root: SnapNode | null;
  cursor: CursorPath | null;
  selected: boolean;
  /** Virtual top of the viewport (px). */
  top: number;
}

export interface Position {
  node: RNode;
  entry: number;
}

/** The path part of child `idx` of `node`'s container (null while its block is missing). */
function partOf(m: RowModel, node: RNode, idx: number): Part | null {
  if (node.cont.kind !== KIND_OBJECT) return { part: idx, idx };
  const it = m.item(node.cont, idx);
  return it ? { part: it.k ?? '', idx } : null;
}

function snapNode(m: RowModel, node: RNode, out: SnapNode): void {
  for (const [entry, kid] of [...node.kids].sort((a, b) => a[0] - b[0])) {
    if (node.g > 1) {
      out.groups.push({ from: kid.from, to: kid.to - 1 });
      snapNode(m, kid, out);
      continue;
    }
    const part = partOf(m, node, node.from + entry);
    if (!part) continue;
    const snap: SnapNode = { groups: [], items: [] };
    snapNode(m, kid, snap);
    out.items.push({ ...part, snap });
  }
}

/** The container node a (group or container) node belongs to. */
function containerNode(n: RNode): RNode {
  while (n.parent && n.parent.cont === n.cont) n = n.parent;
  return n;
}

/** The path of row (node, entry); null when a block on the way is missing. */
function cursorPath(m: RowModel, node: RNode, entry: number): CursorPath | null {
  let group: CursorPath['group'] = null;
  const steps: Part[] = [];
  if (node.g > 1) {
    const r = m.describe(node, entry);
    if (r.type === 'group') group = { from: r.a, to: r.b };
  } else if (node !== m.top) {
    const p = partOf(m, node, node.from + entry);
    if (!p) return null;
    steps.push(p);
  }
  for (let n = node === m.top ? null : containerNode(node); n;) {
    const parent = n.parent;
    if (!parent || parent === m.top) break;
    const p = partOf(m, parent, parent.from + n.entryInParent);
    if (!p) return null;
    steps.unshift(p);
    n = containerNode(parent);
  }
  return { steps, group };
}

/** Snapshot of the expanded containers and groups, the cursor and the scroll position. */
export function snapshotOf(m: RowModel, cursor: Position | null, selected: boolean, top: number): ExpansionSnapshot {
  const rootNode = m.top.kids.get(0);
  let root: SnapNode | null = null;
  if (rootNode) {
    root = { groups: [], items: [] };
    snapNode(m, rootNode, root);
  }
  const at = cursor && m.attached(cursor.node) ? cursorPath(m, cursor.node, cursor.entry) : null;
  return { root, cursor: at, selected, top };
}

/** Loads block `block` of container `c` into the model (the worker's answer). */
export type BlockLoader = (c: Cont, block: number) => Promise<void>;

interface Budget {
  left: number;
}

async function itemAt(
  m: RowModel,
  load: BlockLoader,
  budget: Budget,
  c: Cont,
  idx: number,
): Promise<TreeItem | undefined> {
  let it = m.item(c, idx);
  if (!it && budget.left > 0) {
    budget.left--;
    await load(c, Math.floor(idx / GROUP));
    it = m.item(c, idx);
  }
  return it;
}

/** The new position of a saved child: arrays by index; objects by the name at the same member
 * position, else its first occurrence (searched within the budget). */
async function resolveChild(m: RowModel, load: BlockLoader, budget: Budget, c: Cont, p: Part): Promise<number | null> {
  if (c.kind === KIND_ARRAY) return typeof p.part === 'number' && p.part < c.n ? p.part : null;
  if (typeof p.part !== 'string') return null;
  if (p.idx < c.n && (await itemAt(m, load, budget, c, p.idx))?.k === p.part) return p.idx;
  for (let b = 0; b * GROUP < c.n && budget.left > 0; b++) {
    await itemAt(m, load, budget, c, b * GROUP);
    for (let i = b * GROUP; i < Math.min(c.n, (b + 1) * GROUP); i++) if (m.item(c, i)?.k === p.part) return i;
  }
  return null;
}

/** Expands the groups holding child `idx` under the container node `node`. */
function revealChild(m: RowModel, node: RNode, idx: number): Position {
  let n = node;
  while (n.g > 1) {
    const entry = Math.floor((idx - n.from) / n.g);
    n = n.kids.get(entry) ?? m.expand(m.describe(n, entry))!;
  }
  return { node: n, entry: idx - n.from };
}

/** The group row [from … to] under the container node `node`, through expanded groups. */
function findGroup(m: RowModel, node: RNode, from: number, to: number): Position | null {
  let n = node;
  while (n.g > 1) {
    const entry = Math.floor((from - n.from) / n.g);
    if (entry < 0 || entry >= n.entries) return null;
    const r = m.describe(n, entry);
    if (r.type === 'group' && r.a === from && r.b === to) return { node: n, entry };
    const kid = n.kids.get(entry);
    if (!kid) return null;
    n = kid;
  }
  return null;
}

async function restoreNode(m: RowModel, load: BlockLoader, budget: Budget, node: RNode, snap: SnapNode): Promise<void> {
  for (const g of snap.groups) {
    const at = findGroup(m, node, g.from, g.to);
    if (at) m.expand(m.describe(at.node, at.entry));
  }
  for (const saved of snap.items) {
    if (budget.left <= 0) return;
    const idx = await resolveChild(m, load, budget, node.cont, saved);
    if (idx === null) continue;
    const it = await itemAt(m, load, budget, node.cont, idx);
    if (!it || !isContainer(it.kind) || it.n === 0) continue;
    const at = revealChild(m, node, idx);
    const row = m.describe(at.node, at.entry);
    const kid = row.expanded ? at.node.kids.get(at.entry) : m.expand(row);
    if (kid) await restoreNode(m, load, budget, kid, saved.snap);
  }
}

/**
 * Re-applies `snap` top-down on the model of a new version that already has its RULE-12 initial
 * expansion: children are matched by path (arrays by index; objects by name, same member
 * position first), groups whose ranges still exist are re-expanded, and paths that no longer
 * resolve are dropped. At most `maxBlocks` blocks are fetched, so a huge expanded set cannot
 * stall the build. Returns the cursor's new position (the nearest visible ancestor when its own
 * path no longer resolves), or null.
 */
export async function restoreExpansion(
  m: RowModel,
  snap: ExpansionSnapshot,
  load: BlockLoader,
  maxBlocks = 200,
): Promise<Position | null> {
  const budget: Budget = { left: maxBlocks };
  const rootRow = m.rowAt(0);
  if (snap.root && m.expandable(rootRow)) {
    const rootNode = rootRow.expanded ? m.top.kids.get(0) : m.expand(rootRow);
    if (rootNode) await restoreNode(m, load, budget, rootNode, snap.root);
  }
  if (!snap.cursor) return null;
  let at: Position = { node: m.top, entry: 0 };
  for (const step of snap.cursor.steps) {
    const cont = at.node.kids.get(at.entry);
    if (!cont) return at;
    const idx = await resolveChild(m, load, budget, cont.cont, step);
    if (idx === null) return at;
    // only through expanded groups: the cursor row must be visible
    let n = cont;
    while (n.g > 1) {
      const entry = Math.floor((idx - n.from) / n.g);
      const kid = n.kids.get(entry);
      if (!kid) return { node: n, entry };
      n = kid;
    }
    at = { node: n, entry: idx - n.from };
  }
  const g = snap.cursor.group;
  if (g) {
    const cont = at.node.kids.get(at.entry);
    const found = cont ? findGroup(m, cont, g.from, g.to) : null;
    if (found) at = found;
  }
  return at;
}
