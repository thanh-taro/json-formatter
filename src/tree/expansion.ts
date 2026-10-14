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
  /**
   * Objects with duplicate keys (F-006 edge case, RULE-06: identical paths): which occurrence of
   * the name this member was (0-based). Set only when the name is known to repeat (QA-024).
   */
  ord?: number;
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

/**
 * Member names seen in an object container's blocks: positions per name (ascending within the
 * contiguous prefix). `prefix`: blocks 0 … prefix-1 are all scanned, so occurrence numbers of
 * positions below `prefix × GROUP` are exact.
 */
interface NameScan {
  names: Map<string, number[]>;
  blocks: Set<number>;
  prefix: number;
  /** The cached blocks were swept once (restore only). */
  swept: boolean;
}

/** Per object container (by start), the names scanned so far. */
type Scans = Map<number, NameScan>;

function scanOf(scans: Scans, c: Cont): NameScan {
  let scan = scans.get(c.s);
  if (!scan) scans.set(c.s, (scan = { names: new Map(), blocks: new Set(), prefix: 0, swept: false }));
  return scan;
}

/** Records the names of block `b` of `c` when it is cached (no fetch, no recency change). */
function scanBlock(m: RowModel, c: Cont, scan: NameScan, b: number): boolean {
  if (scan.blocks.has(b)) return true;
  const rows = m.peekBlock(c.s, b);
  if (!rows) return false;
  rows.forEach((it, j) => {
    const k = it.k ?? '';
    const at = scan.names.get(k);
    if (at) at.push(b * GROUP + j);
    else scan.names.set(k, [b * GROUP + j]);
  });
  scan.blocks.add(b);
  while (scan.blocks.has(scan.prefix)) scan.prefix++;
  return true;
}

/** Positions of `name` in the contiguous scanned prefix, ascending. */
function prefixPositions(scan: NameScan, name: string): number[] {
  const end = scan.prefix * GROUP;
  return (scan.names.get(name) ?? []).filter((i) => i < end).sort((a, b) => a - b);
}

/**
 * The path part of child `idx` of `node`'s container (null while its block is missing). A name
 * that repeats among the container's cached leading blocks also gets its occurrence number.
 */
function partOf(m: RowModel, scans: Scans, node: RNode, idx: number): Part | null {
  if (node.cont.kind !== KIND_OBJECT) return { part: idx, idx };
  const it = m.item(node.cont, idx);
  if (!it) return null;
  const name = it.k ?? '';
  const scan = scanOf(scans, node.cont);
  for (let b = scan.prefix; b * GROUP < node.cont.n && scanBlock(m, node.cont, scan, b); b++);
  if (idx >= scan.prefix * GROUP) return { part: name, idx };
  const at = prefixPositions(scan, name);
  return at.length > 1 ? { part: name, idx, ord: at.indexOf(idx) } : { part: name, idx };
}

function snapNode(m: RowModel, scans: Scans, node: RNode, out: SnapNode): void {
  for (const [entry, kid] of [...node.kids].sort((a, b) => a[0] - b[0])) {
    if (node.g > 1) {
      out.groups.push({ from: kid.from, to: kid.to - 1 });
      snapNode(m, scans, kid, out);
      continue;
    }
    const part = partOf(m, scans, node, node.from + entry);
    if (!part) continue;
    const snap: SnapNode = { groups: [], items: [] };
    snapNode(m, scans, kid, snap);
    out.items.push({ ...part, snap });
  }
}

/** The container node a (group or container) node belongs to. */
function containerNode(n: RNode): RNode {
  while (n.parent && n.parent.cont === n.cont) n = n.parent;
  return n;
}

/** The path of row (node, entry); null when a block on the way is missing. */
function cursorPath(m: RowModel, scans: Scans, node: RNode, entry: number): CursorPath | null {
  let group: CursorPath['group'] = null;
  const steps: Part[] = [];
  if (node.g > 1) {
    const r = m.describe(node, entry);
    if (r.type === 'group') group = { from: r.a, to: r.b };
  } else if (node !== m.top) {
    const p = partOf(m, scans, node, node.from + entry);
    if (!p) return null;
    steps.push(p);
  }
  for (let n = node === m.top ? null : containerNode(node); n;) {
    const parent = n.parent;
    if (!parent || parent === m.top) break;
    const p = partOf(m, scans, parent, parent.from + n.entryInParent);
    if (!p) return null;
    steps.unshift(p);
    n = containerNode(parent);
  }
  return { steps, group };
}

/** Snapshot of the expanded containers and groups, the cursor and the scroll position. */
export function snapshotOf(m: RowModel, cursor: Position | null, selected: boolean, top: number): ExpansionSnapshot {
  const rootNode = m.top.kids.get(0);
  const scans: Scans = new Map();
  let root: SnapNode | null = null;
  if (rootNode) {
    root = { groups: [], items: [] };
    snapNode(m, scans, rootNode, root);
  }
  const at = cursor && m.attached(cursor.node) ? cursorPath(m, scans, cursor.node, cursor.entry) : null;
  return { root, cursor: at, selected, top };
}

/** Loads block `block` of container `c` into the model (the worker's answer). */
export type BlockLoader = (c: Cont, block: number) => Promise<void>;

/** What one replay carries: the block budget, the names scanned and the shift seen per object. */
interface Replay {
  m: RowModel;
  load: BlockLoader;
  /** Blocks that may still be fetched. */
  left: number;
  scans: Scans;
  /** Per object container (by start): new minus old position of the last member found. */
  shift: Map<number, number>;
}

/** Blocks a missing name may fetch around its old position before it is dropped (QA-024). */
const NEAR_BLOCKS = 2;

/** Makes block `b` of `c` available (fetched within the budget) and scans its names. */
async function ensureBlock(r: Replay, c: Cont, b: number): Promise<boolean> {
  if (!r.m.has(c.s, b)) {
    if (r.left <= 0) return false;
    r.left--;
    await r.load(c, b);
  }
  if (c.kind === KIND_OBJECT) scanBlock(r.m, c, scanOf(r.scans, c), b);
  return r.m.has(c.s, b);
}

async function itemAt(r: Replay, c: Cont, idx: number): Promise<TreeItem | undefined> {
  return (await ensureBlock(r, c, Math.floor(idx / GROUP))) ? r.m.item(c, idx) : undefined;
}

/**
 * The new position of a saved child. Arrays: by index. Objects: a name known to repeat by its
 * occurrence (QA-024: duplicates after an earlier insert); otherwise the name at the old
 * position (moved by the shift already seen in this object), then among the blocks already
 * cached, then in at most NEAR_BLOCKS blocks around the old position — a renamed or removed
 * member is dropped cheaply instead of searching the whole object (QA-024: budget).
 */
async function resolveChild(r: Replay, c: Cont, p: Part): Promise<number | null> {
  if (c.kind === KIND_ARRAY) return typeof p.part === 'number' && p.part < c.n ? p.part : null;
  if (typeof p.part !== 'string') return null;
  const name = p.part;
  const scan = scanOf(r.scans, c);
  const blocks = Math.ceil(c.n / GROUP);
  if (p.ord !== undefined) {
    for (;;) {
      const at = prefixPositions(scan, name);
      if (at.length > p.ord) return at[p.ord]!;
      if (scan.prefix >= blocks || !(await ensureBlock(r, c, scan.prefix))) return null;
    }
  }
  const shift = r.shift.get(c.s) ?? 0;
  const found = (idx: number) => (r.shift.set(c.s, idx - p.idx), idx);
  for (const guess of shift ? [p.idx + shift, p.idx] : [p.idx]) {
    if (guess >= 0 && guess < c.n && (await itemAt(r, c, guess))?.k === name) return found(guess);
  }
  if (!scan.swept) {
    scan.swept = true;
    for (let b = 0; b < blocks; b++) scanBlock(r.m, c, scan, b);
  }
  const home = Math.min(blocks - 1, Math.max(0, Math.floor((p.idx + shift) / GROUP)));
  const nearest = (): number | null => {
    const at = scan.names.get(name);
    if (!at?.length) return null;
    return at.reduce((a, b) => (Math.abs(b - p.idx - shift) < Math.abs(a - p.idx - shift) ? b : a));
  };
  let hit = nearest();
  for (let d = 1, fetched = 0; hit === null && fetched < NEAR_BLOCKS && d < blocks; d++) {
    for (const b of [home - d, home + d]) {
      if (b < 0 || b >= blocks || scan.blocks.has(b) || fetched >= NEAR_BLOCKS) continue;
      if (!r.m.has(c.s, b)) fetched++;
      if (!(await ensureBlock(r, c, b))) return null;
    }
    hit = nearest();
  }
  return hit === null ? null : found(hit);
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

async function restoreNode(r: Replay, node: RNode, snap: SnapNode): Promise<void> {
  const m = r.m;
  for (const g of snap.groups) {
    const at = findGroup(m, node, g.from, g.to);
    if (at) m.expand(m.describe(at.node, at.entry));
  }
  for (const saved of snap.items) {
    if (r.left <= 0) return;
    const idx = await resolveChild(r, node.cont, saved);
    if (idx === null) continue;
    const it = await itemAt(r, node.cont, idx);
    if (!it || !isContainer(it.kind) || it.n === 0) continue;
    const at = revealChild(m, node, idx);
    const row = m.describe(at.node, at.entry);
    const kid = row.expanded ? at.node.kids.get(at.entry) : m.expand(row);
    if (kid) await restoreNode(r, kid, saved.snap);
  }
}

/**
 * Re-applies `snap` top-down on the model of a new version that already has its RULE-12 initial
 * expansion: children are matched by path (arrays by index; objects by name, same member
 * position first), groups whose ranges still exist are re-expanded, and paths that no longer
 * resolve are dropped (cheaply: a missing name looks only near its old position). Duplicate
 * keys are matched by occurrence. At most `maxBlocks` blocks are fetched, so a huge expanded set cannot
 * stall the build. Returns the cursor's new position (the nearest visible ancestor when its own
 * path no longer resolves), or null.
 */
export async function restoreExpansion(
  m: RowModel,
  snap: ExpansionSnapshot,
  load: BlockLoader,
  maxBlocks = 200,
): Promise<Position | null> {
  const r: Replay = { m, load, left: maxBlocks, scans: new Map(), shift: new Map() };
  const rootRow = m.rowAt(0);
  if (snap.root && m.expandable(rootRow)) {
    const rootNode = rootRow.expanded ? m.top.kids.get(0) : m.expand(rootRow);
    if (rootNode) await restoreNode(r, rootNode, snap.root);
  }
  if (!snap.cursor) return null;
  let at: Position = { node: m.top, entry: 0 };
  for (const step of snap.cursor.steps) {
    const cont = at.node.kids.get(at.entry);
    if (!cont) return at;
    const idx = await resolveChild(r, cont.cont, step);
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
