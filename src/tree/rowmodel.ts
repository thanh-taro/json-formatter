// MOD-Tree row model (ADR-0007 §3; promoted from the SP-tree prototype, branch `spike/tree`,
// `spikes/tree/src/rowmodel.ts`). A **range tree, not a flat visible-row list**: each expanded
// container or group is a node holding its RULE-12 group size, a map of expanded entries and
// lazily rebuilt prefix sums; row i is found by binary search per level. Expand and collapse
// are O(depth), collapse-all is O(1); group rows are computed arithmetically from child counts.
// Row data lives in a bounded LRU block cache (100 rows per block). Pure: no DOM.
//
// Implements: F-006.R3, RULE-12 (grouping, initial expansion, collapse all), RULE-06 (paths from
// the path parts held here), F-006.R2.
import {
  formatPath,
  GROUP,
  groupSize,
  isContainer,
  KIND_ARRAY,
  KIND_OBJECT,
  type ContainerRef,
  type TreeItem,
} from '../core';

/** A container whose children are shown, with the path parts that lead to it. */
export interface Cont extends ContainerRef {
  parts: readonly (string | number)[];
}

/** The pseudo container holding the root row. */
const DOC: Cont = { s: -1, e: -1, n: 1, kind: KIND_ARRAY, parts: [] };

export class RNode {
  readonly kids = new Map<number, RNode>();
  private keys: number[] | null = null;
  private cum: number[] | null = null;
  /** Visible rows below this node's header (its entries plus expanded descendants). */
  vis: number;

  constructor(
    readonly parent: RNode | null,
    /** Entry of `parent` this node expands. */
    readonly entryInParent: number,
    readonly cont: Cont,
    /** Child positions [from, to) of `cont` covered by this node. */
    readonly from: number,
    readonly to: number,
    /** Entries are groups of `g` children (1 = the children themselves). */
    readonly g: number,
    /** `aria-level` of the entries. */
    readonly level: number,
  ) {
    this.vis = this.entries;
  }

  get entries(): number {
    return Math.ceil((this.to - this.from) / this.g);
  }

  invalidate(): void {
    this.keys = this.cum = null;
  }

  /** Expanded entries in order with the visible rows before each (prefix sums, rebuilt lazily). */
  sums(): { keys: number[]; cum: number[] } {
    if (!this.keys || !this.cum) {
      const keys = [...this.kids.keys()].sort((a, b) => a - b);
      const cum: number[] = new Array<number>(keys.length);
      let acc = 0;
      for (let j = 0; j < keys.length; j++) {
        cum[j] = acc;
        acc += this.kids.get(keys[j]!)!.vis;
      }
      this.keys = keys;
      this.cum = cum;
    }
    return { keys: this.keys, cum: this.cum };
  }
}

export interface GroupRow {
  type: 'group';
  node: RNode;
  entry: number;
  /** First and last child position of the group (COPY-tree.group `[from … to]`). */
  a: number;
  b: number;
  level: number;
  expanded: boolean;
  setsize: number;
}

export interface ItemRow {
  type: 'item';
  node: RNode;
  entry: number;
  /** Child position in its container. */
  idx: number;
  level: number;
  expanded: boolean;
  setsize: number;
  /** Undefined until its block arrives from the worker. */
  item: TreeItem | undefined;
}

export type Row = GroupRow | ItemRow;

/** Blocks kept per model (100 rows each): a few thousand (ADR-0007 §3). */
export const MAX_BLOCKS = 4000;

export class RowModel {
  readonly top: RNode;
  private readonly cache = new Map<string, TreeItem[]>();

  constructor(readonly root: TreeItem) {
    this.top = new RNode(null, 0, DOC, 0, 1, 1, 1);
    this.cache.set(blockKey(DOC.s, 0), [root]);
  }

  /** Number of visible rows. */
  get total(): number {
    return this.top.vis;
  }

  // ---- block cache -------------------------------------------------------------------------

  /** Stores block `block` (rows block × 100 …) of container `cs`; least recently used go first. */
  put(cs: number, block: number, rows: TreeItem[]): void {
    const key = blockKey(cs, block);
    this.cache.delete(key);
    this.cache.set(key, rows);
    if (this.cache.size > MAX_BLOCKS) {
      for (const k of this.cache.keys()) {
        if (this.cache.size <= MAX_BLOCKS * 0.75) break;
        if (k !== blockKey(DOC.s, 0)) this.cache.delete(k);
      }
    }
  }

  has(cs: number, block: number): boolean {
    return this.cache.has(blockKey(cs, block));
  }

  /** Block `block` of container `cs` when cached, without touching its recency. */
  peekBlock(cs: number, block: number): readonly TreeItem[] | undefined {
    return this.cache.get(blockKey(cs, block));
  }

  item(c: ContainerRef, idx: number): TreeItem | undefined {
    const key = blockKey(c.s, Math.floor(idx / GROUP));
    const rows = this.cache.get(key);
    if (!rows) return undefined;
    // touch: most recently used last
    this.cache.delete(key);
    this.cache.set(key, rows);
    return rows[idx % GROUP];
  }

  // ---- rows ----------------------------------------------------------------------------------

  /** Row `i` of the visible rows (0 ≤ i < total). */
  rowAt(i: number): Row {
    let node = this.top;
    for (;;) {
      const { keys, cum } = node.sums();
      // the last expanded entry j whose row index (keys[j] + cum[j]) is ≤ i
      let lo = 0;
      let hi = keys.length - 1;
      let j = -1;
      while (lo <= hi) {
        const m = (lo + hi) >> 1;
        if (keys[m]! + cum[m]! <= i) {
          j = m;
          lo = m + 1;
        } else hi = m - 1;
      }
      let entry: number;
      if (j < 0) entry = i;
      else {
        const at = keys[j]! + cum[j]!;
        if (i === at) entry = keys[j]!;
        else {
          const kid = node.kids.get(keys[j]!)!;
          const inner = i - at - 1;
          if (inner < kid.vis) {
            node = kid;
            i = inner;
            continue;
          }
          entry = i - cum[j]! - kid.vis;
        }
      }
      return this.describe(node, entry);
    }
  }

  describe(node: RNode, entry: number): Row {
    const expanded = node.kids.has(entry);
    if (node.g > 1) {
      const a = node.from + entry * node.g;
      const b = Math.min(a + node.g, node.to) - 1;
      return { type: 'group', node, entry, a, b, level: node.level, expanded, setsize: node.entries };
    }
    const idx = node.from + entry;
    return {
      type: 'item',
      node,
      entry,
      idx,
      level: node.level,
      expanded,
      setsize: node.entries,
      item: this.item(node.cont, idx),
    };
  }

  /** Visible row index of entry `entry` of `node`. */
  indexOf(node: RNode, entry: number): number {
    const { keys } = node.sums();
    let i = entry;
    for (let j = 0; j < keys.length && keys[j]! < entry; j++) i += node.kids.get(keys[j]!)!.vis;
    if (!node.parent) return i;
    return this.indexOf(node.parent, node.entryInParent) + 1 + i;
  }

  /** True while `node` is still part of the model (no ancestor was collapsed). */
  attached(node: RNode): boolean {
    for (let n = node; n.parent; n = n.parent) if (n.parent.kids.get(n.entryInParent) !== n) return false;
    return true;
  }

  /** The row index of the parent row of `row`, or -1 for the root row. */
  parentIndex(row: Row): number {
    const node = row.node;
    if (!node.parent) return -1;
    return this.indexOf(node.parent, node.entryInParent);
  }

  expandable(r: Row): boolean {
    if (r.type === 'group') return true;
    return !!r.item && isContainer(r.item.kind) && r.item.n > 0;
  }

  /** Implements: F-006.R3 — shows a row's children, in RULE-12 groups when there are many. */
  expand(r: Row): RNode | null {
    if (r.expanded || !this.expandable(r)) return null;
    const node = r.node;
    let kid: RNode;
    if (r.type === 'group') {
      kid = new RNode(node, r.entry, node.cont, r.a, r.b + 1, node.g / GROUP, node.level + 1);
    } else {
      const it = r.item!;
      const part = node === this.top ? null : node.cont.kind === KIND_OBJECT ? (it.k ?? '') : it.i;
      const cont: Cont = {
        s: it.s,
        e: it.e,
        n: it.n,
        kind: it.kind,
        parts: part === null ? [] : [...node.cont.parts, part],
      };
      kid = new RNode(node, r.entry, cont, 0, it.n, groupSize(it.n), node.level + 1);
    }
    node.kids.set(r.entry, kid);
    node.invalidate();
    this.bump(node, kid.vis);
    return kid;
  }

  collapse(r: Row): void {
    const kid = r.node.kids.get(r.entry);
    if (!kid) return;
    r.node.kids.delete(r.entry);
    r.node.invalidate();
    this.bump(r.node, -kid.vis);
  }

  private bump(node: RNode | null, d: number): void {
    for (let n = node; n; n = n.parent) {
      n.vis += d;
      n.invalidate();
    }
  }

  /** Implements: F-006.R3 / F-006.AC10 — collapse all: only the root remains expanded (O(1)). */
  collapseAll(): void {
    const rootNode = this.top.kids.get(0);
    if (!rootNode) return;
    const fresh = new RNode(this.top, 0, rootNode.cont, rootNode.from, rootNode.to, rootNode.g, rootNode.level);
    this.top.kids.set(0, fresh);
    this.top.invalidate();
    this.top.vis = 1 + fresh.vis;
  }

  /**
   * Implements: RULE-12 initial expansion — the root and its direct children are expanded; when
   * the root itself is grouped, the root and its first group (other groups stay collapsed).
   * Returns the root's node, or null for a scalar or empty root. Call `expandChildren` once the
   * root's first block has arrived (ungrouped roots only).
   */
  expandInitial(): RNode | null {
    const rootNode = this.expand(this.rowAt(0));
    if (!rootNode) return null;
    if (rootNode.g > 1) this.expand(this.describe(rootNode, 0));
    return rootNode;
  }

  /** The direct children of `node` that are non-empty containers, expanded (RULE-12). */
  expandChildren(node: RNode): void {
    for (let e = node.entries - 1; e >= 0; e--) {
      const r = this.describe(node, e);
      if (r.type === 'item' && this.expandable(r)) this.expand(r);
    }
  }

  /** Implements: RULE-06 — the path of an item row; null for group rows (no copy actions). */
  pathOf(r: Row): string | null {
    if (r.type === 'group' || !r.item) return null;
    if (r.node === this.top) return '$';
    const c = r.node.cont;
    return formatPath([...c.parts, c.kind === KIND_OBJECT ? (r.item.k ?? '') : r.item.i]);
  }
}

const blockKey = (cs: number, block: number) => `${cs}:${block}`;

/** Spacer height cap (below Gecko's ~17.9 M px element limit, ADR-0007 §4). */
export const MAX_SPACER = 8_000_000;

/**
 * ADR-0007 §4 height scaling: with more rows than fit in MAX_SPACER, the scroll position maps
 * proportionally onto the virtual height. Returns the virtual top of the viewport and the
 * spacer height for a real `scrollTop`; `toScroll` maps a virtual top back.
 */
export function geometry(total: number, rowHeight: number, viewport: number, scrollTop: number) {
  const height = total * rowHeight;
  const scaled = height > MAX_SPACER;
  const spacer = scaled ? MAX_SPACER : height;
  const range = Math.max(0, height - viewport);
  const realRange = Math.max(1, spacer - viewport);
  const virtualTop = scaled ? Math.min(range, (scrollTop * range) / realRange) : scrollTop;
  const toScroll = (virtual: number) =>
    scaled ? (Math.max(0, Math.min(range, virtual)) * realRange) / range : virtual;
  return { height, scaled, spacer, virtualTop, toScroll };
}
