// MOD-Core tree scans (ADR-0007 §2, promoted from the SP-tree prototype on branch `spike/tree`,
// `spikes/tree/src/tree-core.ts`, measured in `.build-my-app/reports/spike-tree.md`). Lazy
// queries over a VALID document held as chunks of flat strings (the worker's compact mirror,
// line breaks normalised to one '\n', so positions are editor positions). No per-node index:
// the skip table built during validation lets a scan jump over large nested containers, and
// per-container checkpoints (the position of every 100th child) are filled while scanning and
// by a background job. Chunks are not line-aligned, so the scanner keeps its token state across
// chunk boundaries (ADR-0007 Consequences). Pure: no DOM, imports only MOD-Core.
//
// Implements: F-006.R2 (key or index, kind, scalar text as written, child counts), F-006.R8
// (bounded work per query); RULE-06 (`formatPath`), RULE-11 (spans are exact source text),
// RULE-12 (`groupSize`); ADR-0007 §2.
import { decodeKey, type SkipTable } from './validate';

export const KIND_OBJECT = 1;
export const KIND_ARRAY = 2;
export const KIND_STRING = 3;
export const KIND_NUMBER = 4;
export const KIND_TRUE = 5;
export const KIND_FALSE = 6;
export const KIND_NULL = 7;

/** ENT-Node `kind`. */
export type NodeKind = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

const KIND_NAMES: readonly NodeKind[] = ['null', 'object', 'array', 'string', 'number', 'boolean', 'boolean', 'null'];

export function kindName(kind: number): NodeKind {
  return KIND_NAMES[kind] ?? 'null';
}

export function isContainer(kind: number): boolean {
  return kind === KIND_OBJECT || kind === KIND_ARRAY;
}

/** RULE-12 group size (children per group); also the checkpoint stride and the block size. */
export const GROUP = 100;
/** ADR-0007 §2: scalar previews are cut at this many characters for display (F-006 edge case). */
export const PREVIEW_MAX = 200;

/** One node as sent from the worker to the main thread (ENT-Node, wire format). */
export interface TreeItem {
  /** Index in its container (member position for objects). */
  i: number;
  /** Decoded member name (object members only). */
  k?: string;
  /** KIND_* constant. */
  kind: number;
  /** Span start (editor position). */
  s: number;
  /** Span end, exclusive. */
  e: number;
  /** Child count (containers), 0 for scalars. */
  n: number;
  /** Scalar source text, cut at PREVIEW_MAX characters. */
  v?: string;
  /** Set when `v` was cut. */
  vt?: 1;
}

/** What a children query needs to know about a container. */
export interface ContainerRef {
  s: number;
  e: number;
  n: number;
  kind: number;
}

/**
 * Implements: RULE-12 — a container with `n` children shows them in groups of this many
 * positions (1 = the children themselves): groups of 100 above 100 children, nested by factors
 * of 100 above 10,000 (groups of 10,000 containing groups of 100, and so on).
 */
export function groupSize(n: number): number {
  if (n <= GROUP) return 1;
  let g = GROUP;
  while (g * GROUP < n) g *= GROUP;
  return g;
}

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * Implements: RULE-06 — `$`, then `.name` for identifier-like member names (ASCII letter, `_`
 * or `$`, then ASCII letters, digits, `_` or `$`), otherwise `["name"]` with the decoded name
 * re-escaped minimally (`"`, `\`, control characters and lone surrogates; nothing else, as
 * `JSON.stringify` does), and `[n]` for array elements.
 */
export function formatPath(parts: readonly (string | number)[]): string {
  let p = '$';
  for (const x of parts) {
    if (typeof x === 'number') p += `[${x}]`;
    else if (IDENT.test(x)) p += `.${x}`;
    else p += `[${JSON.stringify(x)}]`;
  }
  return p;
}

function lowerBound(a: Uint32Array, n: number, x: number): number {
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const m = (lo + hi) >>> 1;
    if (a[m]! < x) lo = m + 1;
    else hi = m;
  }
  return lo;
}

function scalarKind(c: number): number {
  if (c === 34) return KIND_STRING;
  if (c === 116) return KIND_TRUE;
  if (c === 102) return KIND_FALSE;
  if (c === 110) return KIND_NULL;
  return KIND_NUMBER;
}

const isDelim = (c: number) => c === 44 || c === 93 || c === 125 || c <= 32;

// scanner modes
const M_WS = 0;
const M_STR = 1;
const M_ESC = 2;
const M_SCALAR = 3;

/** Checkpoints of one container: `offs[k]` is the position right after the separator before
 * child k × 100 (k = 0: after the opening bracket); `filled` entries are known. */
interface Checkpoints {
  offs: Float64Array;
  filled: number;
}

const NO_SKIP: SkipTable = {
  starts: new Uint32Array(0),
  ends: new Uint32Array(0),
  counts: new Uint32Array(0),
  n: 0,
  threshold: 0,
};

/** Lazy tree queries over one version of a valid document (ADR-0007 §2). */
export class TreeIndex {
  readonly length: number;
  private readonly starts: Float64Array;
  private readonly skip: SkipTable;
  private readonly cps = new Map<number, Checkpoints>();

  constructor(
    private readonly chunks: readonly string[],
    skip: SkipTable | null,
  ) {
    this.skip = skip ?? NO_SKIP;
    this.starts = new Float64Array(chunks.length + 1);
    let off = 0;
    for (let k = 0; k < chunks.length; k++) {
      this.starts[k] = off;
      off += chunks[k]!.length;
    }
    this.starts[chunks.length] = off;
    this.length = off;
  }

  /** Index of the chunk holding `pos` (the last chunk for the end of the document). */
  private locate(pos: number): number {
    let lo = 0;
    let hi = this.chunks.length - 1;
    while (lo < hi) {
      const m = (lo + hi + 1) >>> 1;
      if (this.starts[m]! <= pos) lo = m;
      else hi = m - 1;
    }
    return lo;
  }

  /** The source text in [from, to). */
  text(from: number, to: number): string {
    if (to <= from) return '';
    let k = this.locate(from);
    let out = '';
    while (k < this.chunks.length && this.starts[k]! < to) {
      const base = this.starts[k]!;
      const c = this.chunks[k]!;
      out += c.slice(Math.max(0, from - base), Math.min(c.length, to - base));
      k++;
    }
    return out;
  }

  private checkpoints(c: ContainerRef): Checkpoints | null {
    if (c.n <= GROUP) return null;
    let cp = this.cps.get(c.s);
    if (!cp) {
      cp = { offs: new Float64Array(Math.ceil(c.n / GROUP)), filled: 1 };
      cp.offs[0] = c.s + 1;
      this.cps.set(c.s, cp);
    }
    return cp;
  }

  /** True when the scan for child `from` of `c` starts at most 100 children before it. */
  ready(c: ContainerRef, from: number): boolean {
    const cp = this.checkpoints(c);
    return !cp || Math.floor(from / GROUP) <= cp.filled - 1;
  }

  /** True when every checkpoint of `c` is known. */
  complete(c: ContainerRef): boolean {
    const cp = this.checkpoints(c);
    return !cp || cp.filled === cp.offs.length;
  }

  /** The top-level value (BOM and whitespace before it skipped). */
  root(): TreeItem {
    for (let k = 0; k < this.chunks.length; k++) {
      const s = this.chunks[k]!;
      const base = this.starts[k]!;
      for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c <= 32 || (c === 0xfeff && base + i === 0)) continue;
        const start = base + i;
        if (c === 123 || c === 91) {
          const kind = c === 123 ? KIND_OBJECT : KIND_ARRAY;
          const sk = this.skip;
          const at = lowerBound(sk.starts, sk.n, start);
          if (at < sk.n && sk.starts[at] === start) return { i: 0, kind, s: start, e: sk.ends[at]!, n: sk.counts[at]! };
          const info = { e: -1, n: 0 };
          this.scan({ s: start, e: -1, n: -1, kind }, 0, 0, null, info);
          return { i: 0, kind, s: start, e: info.e, n: info.n };
        }
        return this.makeItem(0, scalarKind(c), start, this.scalarEnd(start, c), 0, -1, -1);
      }
    }
    throw new RangeError('empty document');
  }

  /** End of the scalar starting at `start` (whose first character is `c`). */
  private scalarEnd(start: number, c: number): number {
    let k = this.locate(start);
    let s = this.chunks[k]!;
    let base = this.starts[k]!;
    let i = start - base + 1;
    let esc = false;
    for (;;) {
      if (i >= s.length) {
        k++;
        if (k >= this.chunks.length) return this.length;
        s = this.chunks[k]!;
        base = this.starts[k]!;
        i = 0;
        continue;
      }
      const ch = s.charCodeAt(i);
      if (c === 34) {
        if (esc) esc = false;
        else if (ch === 92) esc = true;
        else if (ch === 34) return base + i + 1;
      } else if (isDelim(ch)) return base + i;
      i++;
    }
  }

  /** Children [from, from + count) of `c`. */
  children(c: ContainerRef, from: number, count: number): TreeItem[] {
    const out: TreeItem[] = [];
    if (count > 0 && from < c.n) this.scan(c, from, Math.min(count, c.n - from), out, null);
    return out;
  }

  /** Background fill: extends the checkpoints of `c` by up to `maxChildren` children.
   * Returns true when they are complete. */
  fill(c: ContainerRef, maxChildren: number): boolean {
    const cp = this.checkpoints(c);
    if (!cp || cp.filled === cp.offs.length) return true;
    this.scan(c, (cp.filled - 1) * GROUP + maxChildren, 0, null, null);
    return cp.filled === cp.offs.length;
  }

  private makeItem(i: number, kind: number, s: number, e: number, n: number, keyS: number, keyE: number): TreeItem {
    const it: TreeItem = { i, kind, s, e, n };
    if (keyS >= 0) {
      const raw = this.text(keyS + 1, keyE - 1);
      it.k = raw.indexOf('\\') >= 0 ? decodeKey(raw) : raw;
    }
    if (kind >= KIND_STRING) {
      const len = e - s;
      it.v = this.text(s, s + Math.min(len, PREVIEW_MAX));
      if (len > PREVIEW_MAX) it.vt = 1;
    }
    return it;
  }

  /**
   * Scans the direct children of `c` from the nearest checkpoint at or before child `from`,
   * collecting children [from, from + count) into `out` (when given) and stopping after the
   * last one. Without `out`, it stops once child `from` is reached — or, with `info`, at the
   * container's end, reporting its end and child count. Nested containers are skipped through
   * the skip table when indexed, otherwise by scanning.
   */
  private scan(
    c: ContainerRef,
    from: number,
    count: number,
    out: TreeItem[] | null,
    info: { e: number; n: number } | null,
  ): void {
    const chunks = this.chunks;
    const starts = this.starts;
    const sk = this.skip;
    const skN = sk.n;
    const isObj = c.kind === KIND_OBJECT;
    const cp = this.checkpoints(c);
    let idx = 0;
    let pos = c.s + 1;
    if (cp) {
      const k = Math.min(Math.floor(from / GROUP), cp.filled - 1);
      idx = k * GROUP;
      pos = cp.offs[k]!;
    }
    const stopIdx = out ? from + count : from;
    let skI = lowerBound(sk.starts, skN, pos);
    let depth = 1;
    let expectKey = isObj;
    let keyS = -1;
    let keyE = -1;
    let seenChild = false;
    let childStart = 0;
    let childKind = 0;
    let commas2 = 0;
    let nonEmpty2 = 0;
    let mode = M_WS;
    let tokStart = 0;
    let tokKind = 0;
    let k = this.locate(pos);
    let s = chunks[k] ?? '';
    let base = starts[k]!;
    let i = pos - base;
    const want = (n: number) => out !== null && n >= from && n < stopIdx;
    // Moves the cursor to `p` (after a skip-table jump).
    const jump = (p: number) => {
      k = this.locate(p);
      s = chunks[k]!;
      base = starts[k]!;
      i = p - base;
    };

    outer: for (;;) {
      if (i >= s.length) {
        k++;
        if (k >= chunks.length) break;
        s = chunks[k]!;
        base = starts[k]!;
        i = 0;
        continue;
      }
      if (mode === M_STR) {
        let ch = 0;
        const n = s.length;
        while (i < n) {
          ch = s.charCodeAt(i);
          if (ch === 34 || ch === 92) break;
          i++;
        }
        if (i >= n) continue;
        i++;
        if (ch === 92) {
          mode = M_ESC;
          continue;
        }
        mode = M_WS;
        if (depth === 1) {
          const e = base + i;
          if (expectKey) {
            if (want(idx)) {
              keyS = tokStart;
              keyE = e;
            }
            expectKey = false;
          } else {
            seenChild = true;
            if (want(idx)) out!.push(this.makeItem(idx, KIND_STRING, tokStart, e, 0, keyS, keyE));
          }
        }
        continue;
      }
      if (mode === M_ESC) {
        // the escaped character (a `\uXXXX` escape's hex digits are ordinary characters)
        i++;
        mode = M_STR;
        continue;
      }
      const ch = s.charCodeAt(i);
      if (mode === M_SCALAR) {
        if (!isDelim(ch)) {
          i++;
          continue;
        }
        mode = M_WS;
        if (depth === 1 && want(idx)) out!.push(this.makeItem(idx, tokKind, tokStart, base + i, 0, keyS, keyE));
        // the delimiter is handled below
      }
      if (ch <= 32) {
        i++;
        continue;
      }
      if (depth === 1) {
        switch (ch) {
          case 34:
            mode = M_STR;
            tokStart = base + i;
            i++;
            continue;
          case 44:
            idx++;
            expectKey = isObj;
            keyS = -1;
            if (cp && idx % GROUP === 0 && idx / GROUP === cp.filled && cp.filled < cp.offs.length)
              cp.offs[cp.filled++] = base + i + 1;
            i++;
            if (idx >= stopIdx && (out || !info)) break outer;
            continue;
          case 58:
            i++;
            continue;
          case 123:
          case 91: {
            seenChild = true;
            const p = base + i;
            const kind = ch === 123 ? KIND_OBJECT : KIND_ARRAY;
            while (skI < skN && sk.starts[skI]! < p) skI++;
            if (skI < skN && sk.starts[skI] === p) {
              const e = sk.ends[skI]!;
              if (want(idx)) out!.push(this.makeItem(idx, kind, p, e, sk.counts[skI]!, keyS, keyE));
              skI = lowerBound(sk.starts, skN, e);
              jump(e);
              continue;
            }
            depth = 2;
            childStart = p;
            childKind = kind;
            commas2 = 0;
            nonEmpty2 = 0;
            i++;
            continue;
          }
          case 125:
          case 93:
            if (info) {
              info.e = base + i + 1;
              info.n = seenChild ? idx + 1 : 0;
            }
            break outer;
          default:
            seenChild = true;
            mode = M_SCALAR;
            tokStart = base + i;
            tokKind = scalarKind(ch);
            i++;
            continue;
        }
      }
      // inside a child container that is not indexed (depth ≥ 2)
      if (ch === 34) {
        mode = M_STR;
        if (depth === 2) nonEmpty2 = 1;
        i++;
        continue;
      }
      if (ch === 123 || ch === 91) {
        if (depth === 2) nonEmpty2 = 1;
        const p = base + i;
        while (skI < skN && sk.starts[skI]! < p) skI++;
        if (skI < skN && sk.starts[skI] === p) {
          const e = sk.ends[skI]!;
          skI = lowerBound(sk.starts, skN, e);
          jump(e);
          continue;
        }
        depth++;
        i++;
        continue;
      }
      if (ch === 125 || ch === 93) {
        depth--;
        i++;
        if (depth === 1 && want(idx))
          out!.push(this.makeItem(idx, childKind, childStart, base + i, nonEmpty2 ? commas2 + 1 : 0, keyS, keyE));
        continue;
      }
      if (ch === 44) {
        if (depth === 2) commas2++;
      } else if (depth === 2) nonEmpty2 = 1;
      i++;
    }
  }
}
