// Independent reference for MOD-Tree / MOD-Core tree tests (promoted from the SP-tree oracle,
// branch `spike/tree`, `spikes/tree/test/oracle.ts`; ADR-0007 Evidence): a straightforward full
// parse of the RAW source (any line endings) recording every node with its index path,
// decoded keys, kind, raw span and child count. Shares no code with src/core/tree.ts (own key
// decoder, own RULE-06 formatter) and never uses JSON.parse. Plus deterministic fixtures.

export interface ONode {
  idxPath: number[];
  parts: (string | number)[];
  kind: string; // object array string number boolean null
  s: number;
  e: number;
  n: number;
}

export function oracleParse(src: string, collect: (n: ONode) => void): void {
  let i = src.charCodeAt(0) === 0xfeff ? 1 : 0;
  const ws = () => {
    while (i < src.length) {
      const c = src[i];
      if (c === ' ' || c === '\n' || c === '\r' || c === '\t') i++;
      else break;
    }
  };
  type Frame = { node: ONode; isObj: boolean; count: number };
  const stack: Frame[] = [];
  const map: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
  const readString = (): string => {
    i++;
    let out = '';
    for (;;) {
      const c = src[i]!;
      if (c === '"') {
        i++;
        return out;
      }
      if (c === '\\') {
        const d = src[i + 1]!;
        if (d === 'u') {
          out += String.fromCharCode(parseInt(src.slice(i + 2, i + 6), 16));
          i += 6;
        } else {
          out += map[d];
          i += 2;
        }
      } else {
        out += c;
        i++;
      }
    }
  };
  const value = (idxPath: number[], parts: (string | number)[]) => {
    ws();
    const c = src[i]!;
    if (c === '{' || c === '[') {
      const node: ONode = { idxPath, parts, kind: c === '{' ? 'object' : 'array', s: i, e: -1, n: 0 };
      stack.push({ node, isObj: c === '{', count: 0 });
      i++;
      return;
    }
    const s = i;
    let kind = 'number';
    if (c === '"') {
      readString();
      kind = 'string';
    } else {
      while (i < src.length && !',]} \t\r\n'.includes(src[i]!)) i++;
      const w = src.slice(s, i);
      kind = w === 'true' || w === 'false' ? 'boolean' : w === 'null' ? 'null' : 'number';
    }
    collect({ idxPath, parts, kind, s, e: i, n: 0 });
  };
  value([], []);
  while (stack.length) {
    const f = stack[stack.length - 1]!;
    ws();
    const c = src[i];
    if (c === ']' || c === '}') {
      i++;
      f.node.e = i;
      f.node.n = f.count;
      stack.pop();
      collect(f.node);
      continue;
    }
    if (c === ',') {
      i++;
      ws();
    }
    const k = f.count++;
    if (f.isObj) {
      ws();
      const name = readString();
      ws();
      i++; // colon
      value([...f.node.idxPath, k], [...f.node.parts, name]);
    } else value([...f.node.idxPath, k], [...f.node.parts, k]);
  }
}

/** RULE-06, written independently of src/core/tree.ts `formatPath`. */
export function oraclePath(parts: (string | number)[]): string {
  let out = '$';
  for (const p of parts) {
    if (typeof p === 'number') {
      out += '[' + p + ']';
      continue;
    }
    let ident = p.length > 0;
    for (let j = 0; j < p.length && ident; j++) {
      const c = p.charCodeAt(j);
      const letter = (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 36;
      const digit = c >= 48 && c <= 57;
      if (!(letter || (digit && j > 0))) ident = false;
    }
    if (ident) {
      out += '.' + p;
      continue;
    }
    let q = '"';
    const esc: Record<number, string> = { 34: '\\"', 92: '\\\\', 8: '\\b', 12: '\\f', 10: '\\n', 13: '\\r', 9: '\\t' };
    for (let j = 0; j < p.length; j++) {
      const c = p.charCodeAt(j);
      if (esc[c]) q += esc[c];
      else if (c < 0x20) q += '\\u' + c.toString(16).padStart(4, '0');
      else if (c >= 0xd800 && c <= 0xdbff && j + 1 < p.length && (p.charCodeAt(j + 1) & 0xfc00) === 0xdc00) {
        q += p[j]! + p[j + 1]!;
        j++;
      } else if (c >= 0xd800 && c <= 0xdfff) q += '\\u' + c.toString(16).padStart(4, '0');
      else q += p[j];
    }
    out += '[' + q + '"]';
  }
  return out;
}

/** Deterministic PRNG. */
export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Realistic records (nested objects, arrays, CJK, escapes, big numbers), about `bytes` long. */
export function records(bytes: number, seed = 1): string {
  const rnd = mulberry(seed);
  const out: string[] = [];
  let n = 0;
  for (let i = 0; n < bytes; i++) {
    const r =
      `{"id": ${1e15 + i}, "name": "user_${i} \\"q\\" 日本", "score": ${(rnd() * 1000).toFixed(2)}, ` +
      `"ok": ${rnd() < 0.5}, "none": null, "tags": [${Array.from({ length: Math.floor(rnd() * 4) }, (_, k) => `"t${k}"`).join(', ')}], ` +
      `"nested": {"a\\u0041": [${i}, {"x": []}], "e": {}}}`;
    out.push(r);
    n += r.length + 4;
  }
  return '[\n  ' + out.join(',\n  ') + '\n]\n';
}

/** A document whose member "big" is an array of `children` elements between two record blocks. */
export function withBigArray(children: number, padBytes = 0): string {
  const parts: string[] = [];
  for (let i = 0; i < children; i++) parts.push(`{"i": ${i}, "t": ${i % 3 ? 'true' : 'null'}}`);
  const pad = padBytes ? records(padBytes, 3).trimEnd() : '[]';
  return '{\n  "head": ' + pad + ',\n  "big": [' + parts.join(',') + '],\n  "tail": 1\n}\n';
}

/** Many nested chains (adversarial for the skip table). */
export function deepChains(count: number, depth: number): string {
  const chain = '['.repeat(depth) + '1' + ']'.repeat(depth);
  return '[' + new Array(count).fill(chain).join(',') + ']\n';
}

export function wideObject(n: number): string {
  const p: string[] = [];
  for (let i = 0; i < n; i++) p.push(`"k${i}": ${i}`);
  return '{' + p.join(', ') + '}';
}

export const crlf = (s: string): string => s.replace(/\n/g, '\r\n');

/** Escaped and duplicate keys, big numbers, long strings, empty containers (SP-tree TRICKY). */
export const TRICKY = [
  '{',
  '  "simple": 1,',
  '  "content-type": "application/json",',
  '  "a\\"b": "quote in key",',
  '  "\\u0041BC": "escaped ident",',
  '  "": "empty key",',
  '  "1abc": "digit first",',
  '  "$ok_1": true,',
  '  "日本": "non-ascii key",',
  '  "a\\nb": "newline escape",',
  '  "\\ud83d\\ude00": "emoji escape",',
  '  "\\ud800": "lone surrogate",',
  '  "tab\\tkey": null,',
  '  "back\\\\slash": false,',
  '  "dup": 1,',
  '  "dup": {"x": [1, 2]},',
  '  "big": 12345678901234567890,',
  '  "prec": 1.50,',
  '  "neg0": -0,',
  '  "exp": 1E+2,',
  '  "tiny": 2.5e-3,',
  '  "s": "say \\"hi\\" \\\\ \\/ \\u00e9 😀",',
  '  "long": "' + 'x'.repeat(500) + '",',
  '  "nested": {"items": [{"content-type": "x", "k.v": [1, [2, [3]]]}], "e1": {}, "e2": [ ]},',
  '  "arr250": [' + Array.from({ length: 250 }, (_, i) => i).join(',') + '],',
  '  "spaces": [  1 ,  "x"  , { }  , [ ] ],',
  '  "user": {"id": 12345678901234567890, "tags": ["a"]}',
  '}',
  '',
].join('\n');
