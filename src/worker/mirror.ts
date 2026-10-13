// MOD-Worker compact document mirror (ADR-0005 §2, SP-pipeline variant E; promoted from
// spike/pipeline `spikes/pipeline/src/rope.ts`). The document as an ordered list of flat
// strings of ~1 M UTF-16 units, line breaks normalised to one '\n' unit so offsets are editor
// positions. ~1× the document bytes — never a CodeMirror `Text` (2.45× the bytes, measured).
// Values are immutable: `apply` returns a new mirror sharing untouched chunks, so a job that
// captured a mirror (export, undo snapshot) is unaffected by later edits.
import type { ChangeSet } from '@codemirror/state';

const FLAT_RE = /^/;
/** Forces V8 to flatten a cons string (rope-shaped strings cost 6.3×, SP-formatter). */
const flat = (s: string): string => (FLAT_RE.test(s), s);
/** Target chunk size in UTF-16 units. */
export const CHUNK_UNITS = 1 << 20;
const MAX_UNITS = 4 << 20;

export class Mirror {
  static readonly empty = new Mirror([], 0);

  private constructor(
    readonly chunks: readonly string[],
    readonly length: number,
  ) {}

  static of(chunks: readonly string[]): Mirror {
    const kept = chunks.filter((c) => c.length > 0);
    return new Mirror(
      kept,
      kept.reduce((n, c) => n + c.length, 0),
    );
  }

  /** The chunks with line breaks written as `eol` (for export, ADR-0006 §3). */
  *iter(eol = '\n'): Generator<string> {
    for (const c of this.chunks) yield eol === '\n' ? c : c.replace(/\n/g, eol);
  }

  /** The text between two positions as chunks (no copy of untouched chunks). */
  *range(from: number, to: number): Generator<string> {
    let off = 0;
    for (const c of this.chunks) {
      const end = off + c.length;
      if (end > from && off < to) {
        const a = Math.max(0, from - off);
        const b = Math.min(c.length, to - off);
        yield a === 0 && b === c.length ? c : c.slice(a, b);
      }
      off = end;
      if (off >= to) break;
    }
  }

  /** Whole text (tests and small documents only). */
  toString(): string {
    return this.chunks.join('');
  }

  /** Applies an editor change set (positions in this document) — ADR-0005 mirror sync. */
  apply(cs: ChangeSet): Mirror {
    if (cs.length !== this.length) throw new RangeError(`change set length ${cs.length} ≠ mirror ${this.length}`);
    const changes: [number, number, string][] = [];
    cs.iterChanges((fromA, toA, _fromB, _toB, ins) => {
      changes.push([fromA, toA, ins.length ? ins.sliceString(0, ins.length, '\n') : '']);
    });
    let chunks = this.chunks as string[];
    let length = this.length;
    for (let k = changes.length - 1; k >= 0; k--) {
      const [from, to, text] = changes[k]!;
      chunks = replace(chunks, from, to, text);
      length += text.length - (to - from);
    }
    return new Mirror(chunks, length);
  }
}

function replace(chunks: readonly string[], from: number, to: number, text: string): string[] {
  if (!chunks.length) return text ? split(flat(text)) : [];
  // first chunk i whose end ≥ from, last chunk j whose end ≥ to
  let off = 0;
  let i = 0;
  while (i < chunks.length - 1 && off + chunks[i]!.length < from) off += chunks[i++]!.length;
  let j = i;
  let offJ = off;
  while (j < chunks.length - 1 && offJ + chunks[j]!.length < to) offJ += chunks[j++]!.length;
  const head = chunks[i]!.slice(0, from - off);
  const tail = chunks[j]!.slice(to - offJ);
  const out = chunks.slice(0, i);
  const mid = flat(head + text + tail);
  if (mid.length) out.push(...split(mid));
  for (let k = j + 1; k < chunks.length; k++) out.push(chunks[k]!);
  return out;
}

function split(s: string): string[] {
  if (s.length <= MAX_UNITS) return [s];
  const out: string[] = [];
  for (let i = 0; i < s.length; i += CHUNK_UNITS) out.push(flat(s.slice(i, i + CHUNK_UNITS)));
  return out;
}

/** Collects text pieces into ~1 M-unit flat chunks, normalising CRLF and lone CR to '\n'
 * (the editor splits on the same three, ADR-0006 §3). A CRLF split across pieces is one break. */
export class MirrorBuilder {
  private chunks: string[] = [];
  private buf: string[] = [];
  private n = 0;
  private pendingCR = false;

  push(s: string): void {
    if (!s) return;
    if (this.pendingCR) {
      this.pendingCR = false;
      if (s.charCodeAt(0) === 10) s = s.slice(1);
      if (!s) return;
    }
    let trailingCR = false;
    if (s.charCodeAt(s.length - 1) === 13) {
      // a break now; an LF starting the next piece belongs to it
      this.pendingCR = true;
      trailingCR = true;
      s = s.slice(0, -1);
    }
    if (s.indexOf('\r') >= 0) s = s.replace(/\r\n?/g, '\n');
    this.pushNormalised(trailingCR ? s + '\n' : s);
  }

  /** Appends a range of an existing mirror (already normalised). */
  pushMirror(m: Mirror, from: number, to: number): void {
    this.pendingCR = false;
    for (const c of m.range(from, to)) this.pushNormalised(c);
  }

  private pushNormalised(s: string): void {
    if (s.length >= CHUNK_UNITS && !this.n) {
      this.chunks.push(flat(s));
      return;
    }
    this.buf.push(s);
    this.n += s.length;
    if (this.n >= CHUNK_UNITS) this.flush();
  }

  private flush(): void {
    if (!this.n) return;
    this.chunks.push(flat(this.buf.length === 1 ? this.buf[0]! : this.buf.join('')));
    this.buf = [];
    this.n = 0;
  }

  finish(): Mirror {
    this.flush();
    const m = Mirror.of(this.chunks);
    this.chunks = [];
    return m;
  }
}
