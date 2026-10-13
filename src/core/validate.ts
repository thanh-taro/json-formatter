// MOD-Core strict validator (ADR-0005 §1): one hand-written, table-driven, iterative tokenizer
// that consumes the document as string chunks and can suspend/resume at any chunk boundary.
// An explicit container stack replaces recursion (RULE-14). Promoted from the SP-formatter
// prototype (spike/formatter `spikes/formatter/src/core.ts`: JSONTestSuite 95/95 y_, 188/188 n_,
// 110,000 property cases), validation path only — beautify/minify plug their emitters into the
// same state machine (F-002, F-003). Positions are editor positions (UTF-16 units, one per line
// break); the hot loop keeps no line/column state (`resolvePositions` does that afterwards).
//
// Implements: RULE-03 (strict RFC 8259, BOM tolerated with a warning, empty documents),
// RULE-04 (first error with its code-specific position), RULE-05 (warnings, capped at 1,000),
// RULE-14 (depth 10,000), F-005.R3, F-005.R4; ADR-0007 §1 (skip table built in the same pass).
import { classifyNumber } from './numbers';
import { WARNING_CAP, type IssueCode, type RawIssue } from './issues';

// expectations
const S_VALUE = 0; // value expected (top start, after ':', after ',' in an array)
const S_VALUE_OR_CLOSE = 1; // after '['
const S_KEY_OR_CLOSE = 2; // after '{'
const S_KEY = 3; // after ',' in an object
const S_COLON = 4; // after a key
const S_AFTER = 5; // after a value inside a container
const S_END = 6; // after the top-level value

// token in progress
const T_NONE = 0;
const T_STRING = 1;
const T_ESC = 2;
const T_UHEX = 3;
const T_NUM = 4;
const T_LIT = 5;
const T_SLASH = 6;
const T_DONE = 7; // stopped at an error

// number sub-states
const N_MINUS = 0;
const N_ZERO = 1;
const N_INT = 2;
const N_DOT = 3;
const N_FRAC = 4;
const N_E = 5;
const N_ESIGN = 6;
const N_EXP = 7;

// character classes (ASCII)
const C_OTHER = 0;
const C_WS = 1;
const C_QUOTE = 2;
const C_LBRACE = 3;
const C_RBRACE = 4;
const C_LBRACK = 5;
const C_RBRACK = 6;
const C_COMMA = 7;
const C_COLON = 8;
const C_DIGIT = 9;
const C_MINUS = 10;
const C_ALPHA = 11;
const C_SQUOTE = 12;
const C_SLASH = 13;
const C_DOTPLUS = 14;
const C_IDENT = 15; // _ $

const CLS = new Uint8Array(128);
// RULE-03: whitespace is space, tab, line feed, carriage return — nothing else.
CLS[32] = CLS[9] = CLS[10] = CLS[13] = C_WS;
CLS[34] = C_QUOTE;
CLS[123] = C_LBRACE;
CLS[125] = C_RBRACE;
CLS[91] = C_LBRACK;
CLS[93] = C_RBRACK;
CLS[44] = C_COMMA;
CLS[58] = C_COLON;
for (let c = 48; c <= 57; c++) CLS[c] = C_DIGIT;
CLS[45] = C_MINUS;
for (let c = 65; c <= 90; c++) CLS[c] = C_ALPHA;
for (let c = 97; c <= 122; c++) CLS[c] = C_ALPHA;
CLS[39] = C_SQUOTE;
CLS[47] = C_SLASH;
CLS[46] = CLS[43] = C_DOTPLUS;
CLS[95] = CLS[36] = C_IDENT;

const ESC_OK = new Uint8Array(128);
for (const ch of '"\\/bfnrtu') ESC_OK[ch.charCodeAt(0)] = 1;
const HEX = new Uint8Array(128);
for (const ch of '0123456789abcdefABCDEF') HEX[ch.charCodeAt(0)] = 1;

const LITS: readonly string[] = ['true', 'false', 'null'];
const OBJECT = 1;
const ARRAY = 2;
/** Objects with more keys than this switch from a linear scan to a `Set` (ADR-0005 §1). */
const LINEAR_KEYS = 16;

/** RULE-14: documents nested up to 10,000 levels are supported. */
export const MAX_DEPTH = 10_000;
/** ADR-0007 §1: containers spanning at least this many positions are indexed. */
export const SKIP_THRESHOLD = 4096;
const SKIP_MIN_CAPACITY = 1 << 16;

/** A character glued to a finished number that makes the whole word an invalid number. */
function isNumContinuation(c: number): boolean {
  return (
    (c >= 48 && c <= 57) ||
    (c >= 65 && c <= 90) ||
    (c >= 97 && c <= 122) ||
    c === 46 ||
    c === 43 ||
    c === 45 ||
    c === 95 ||
    c === 36
  );
}
function isIdentChar(c: number): boolean {
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 36;
}

const SIMPLE_ESC: Record<string, string> = {
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
  '"': '"',
  '\\': '\\',
  '/': '/',
};

/** The member name a valid key body denotes (escapes decoded), for RULE-05 duplicate keys. */
export function decodeKey(raw: string): string {
  return raw.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, e: string) =>
    e.length === 5 ? String.fromCharCode(parseInt(e.slice(1), 16)) : (SIMPLE_ESC[e] ?? e),
  );
}

/**
 * ADR-0007 §1 skip table: every container whose source span is at least `threshold` positions,
 * sorted by start. `ends` are exclusive; `counts` are direct children.
 */
export interface SkipTable {
  starts: Uint32Array;
  ends: Uint32Array;
  counts: Uint32Array;
  n: number;
  /** Effective threshold after any compaction (it doubles when the table is full). */
  threshold: number;
}

export interface ValidatorOptions {
  /** RULE-14 limit (tests only change it). */
  maxDepth?: number;
  /** Collect RULE-05 warnings (default true). */
  warnings?: boolean;
  /** Build the ADR-0007 skip table in the same pass (the worker does in the large tiers). */
  skipTable?: boolean;
  /** Document length in positions when known: bounds the table at max(65,536, 4 × length / T). */
  lengthHint?: number;
  /** Threshold and minimum capacity of the table (tests only change them). */
  skipThreshold?: number;
  skipMinCapacity?: number;
}

/** The outcome of validating a whole document (positions not yet resolved). */
export interface ValidationOutcome {
  /** RULE-03: `empty` is a document of zero characters — neither valid nor invalid, no issue. */
  validity: 'valid' | 'invalid' | 'empty';
  error: RawIssue | null;
  /** RULE-05 warnings in document order (valid documents only), at most 1,000. */
  warnings: RawIssue[];
  /** Warnings beyond the cap. */
  warningOverflow: number;
  /** Document length in editor positions. */
  length: number;
  skipTable: SkipTable | null;
}

/** Resumable strict validator: `feed` chunks in order, then `end`. */
export class Validator {
  private readonly warn: boolean;
  private readonly maxDepth: number;

  private base = 0; // global position of the current chunk
  private expect = S_VALUE;
  private tok = T_NONE;
  private depth = 0;
  private readonly stack: Uint8Array; // OBJECT / ARRAY per depth
  private readonly openPos: Float64Array;
  private readonly commas: Uint32Array; // commas seen per open container (child counts)
  private tokStart = 0;
  private escStart = 0;
  private hexLeft = 0;
  private numState = 0;
  private numDigits = 0;
  private numExp = false;
  private numText = ''; // a number crossing chunks
  private lit = 'true';
  private litPos = 0;
  private isKey = false;
  private keyText = ''; // a key crossing chunks
  private keyHasEsc = false;
  private commaPos = -1;
  private seenValue = false;

  private readonly warnings: RawIssue[] = [];
  private warnOverflow = 0;
  private readonly keys: string[] = [];
  private readonly keyFrame: Int32Array;
  private readonly keySets: (Set<string> | null)[] = [];

  // ADR-0007 §1 skip table (typed arrays in closing order; sorted by start in `end`)
  private skipT = 0;
  private skipCap = 0;
  private skipN = 0;
  private skipSt = new Uint32Array(0);
  private skipEn = new Uint32Array(0);
  private skipCt = new Uint32Array(0);

  private error: RawIssue | null = null;

  constructor(opts: ValidatorOptions = {}) {
    this.warn = opts.warnings ?? true;
    this.maxDepth = opts.maxDepth ?? MAX_DEPTH;
    this.stack = new Uint8Array(this.maxDepth + 2);
    this.openPos = new Float64Array(this.maxDepth + 2);
    this.commas = new Uint32Array(this.maxDepth + 2);
    this.keyFrame = new Int32Array(this.maxDepth + 2);
    if (opts.skipTable) {
      this.skipT = opts.skipThreshold ?? SKIP_THRESHOLD;
      this.skipCap = Math.max(
        opts.skipMinCapacity ?? SKIP_MIN_CAPACITY,
        Math.ceil((4 * (opts.lengthHint ?? 0)) / this.skipT),
      );
    }
  }

  /** Positions consumed so far. */
  get length(): number {
    return this.base;
  }

  /** True once the first error was found (further input is ignored). */
  get failed(): boolean {
    return this.tok === T_DONE;
  }

  private addWarning(code: IssueCode, pos: number, length: number): void {
    if (this.warnings.length < WARNING_CAP) this.warnings.push({ code, pos, length });
    else this.warnOverflow++;
  }

  private fail(code: IssueCode, pos: number, extra?: Partial<RawIssue>): void {
    if (this.error) return;
    this.error = { code, pos, length: 1, ...extra };
    this.tok = T_DONE;
  }

  // Implements: RULE-05 duplicate-key — one shared key stack with a frame per object; linear
  // scan up to 16 keys, then a lazily created Set (no allocation per object, ADR-0005 §1).
  private checkKey(raw: string, pos: number, length: number, d: number): void {
    const k = this.keyHasEsc ? decodeKey(raw) : raw;
    const from = this.keyFrame[d]!;
    const keys = this.keys;
    let set = this.keySets[d];
    if (set) {
      if (set.has(k)) this.addWarning('duplicate-key', pos, length);
      else set.add(k);
      return;
    }
    for (let j = from; j < keys.length; j++) {
      if (keys[j] === k) {
        this.addWarning('duplicate-key', pos, length);
        return;
      }
    }
    keys.push(k);
    if (keys.length - from > LINEAR_KEYS) {
      set = new Set(keys.slice(from));
      this.keySets[d] = set;
      keys.length = from;
    }
  }

  private closeObjectKeys(d: number): void {
    this.keys.length = this.keyFrame[d]!;
    this.keySets[d] = null;
  }

  // Implements: RULE-05 unsafe-number — fast path for ≤ 15 digits without exponent.
  private finishNumber(text: string, end: number): void {
    if (!this.warn) return;
    if (this.numDigits <= 15 && !this.numExp) return;
    if (classifyNumber(text)) this.addWarning('unsafe-number', this.tokStart, end - this.tokStart);
  }

  // Implements: ADR-0007 §1 — record a large container; on overflow the threshold doubles and
  // smaller entries are dropped (an indexed container's ancestors stay indexed).
  private recordContainer(start: number, end: number, children: number): void {
    if (end - start < this.skipT) return;
    if (this.skipN === this.skipSt.length && this.skipSt.length < this.skipCap) {
      const size = Math.min(this.skipCap, Math.max(Math.min(1024, this.skipCap), this.skipSt.length * 2));
      const grow = (a: Uint32Array) => {
        const b = new Uint32Array(size);
        b.set(a);
        return b;
      };
      this.skipSt = grow(this.skipSt);
      this.skipEn = grow(this.skipEn);
      this.skipCt = grow(this.skipCt);
    }
    while (this.skipN === this.skipSt.length) {
      this.skipT *= 2;
      let w = 0;
      for (let r = 0; r < this.skipN; r++) {
        if (this.skipEn[r]! - this.skipSt[r]! >= this.skipT) {
          this.skipSt[w] = this.skipSt[r]!;
          this.skipEn[w] = this.skipEn[r]!;
          this.skipCt[w] = this.skipCt[r]!;
          w++;
        }
      }
      this.skipN = w;
    }
    // Closing order is post-order, so ancestors (larger spans) are recorded later and survive.
    if (end - start < this.skipT) return;
    this.skipSt[this.skipN] = start;
    this.skipEn[this.skipN] = end;
    this.skipCt[this.skipN] = children;
    this.skipN++;
  }

  /** Feeds the next chunk. Returns false once an error has been found. */
  feed(s: string): boolean {
    if (this.tok === T_DONE) return false;
    const n = s.length;
    if (n === 0) return true;
    const base = this.base;
    const warn = this.warn;
    const stack = this.stack;
    const skip = this.skipT !== 0;
    let expect = this.expect;
    let tok = this.tok;
    let depth = this.depth;
    let i = 0;
    let c = 0;

    outer: while (i < n) {
      // ---- continue a token in progress ----
      if (tok !== T_NONE) {
        if (tok === T_STRING) {
          while (i < n) {
            c = s.charCodeAt(i);
            if (c === 34 || c === 92 || c < 32) break;
            i++;
          }
          if (i === n) break outer;
          if (c === 34) {
            i++;
            tok = T_NONE;
            if (this.isKey) {
              if (warn) {
                const local = this.tokStart - base;
                const raw = local >= 0 ? s.slice(local + 1, i - 1) : this.keyText + s.slice(0, i - 1);
                this.keyText = '';
                this.checkKey(raw, this.tokStart, base + i - this.tokStart, depth);
              }
              expect = S_COLON;
            } else expect = depth === 0 ? S_END : S_AFTER;
            continue;
          }
          if (c === 92) {
            if (this.isKey) this.keyHasEsc = true;
            this.escStart = base + i;
            i++;
            tok = T_ESC;
            continue;
          }
          // RULE-04 control-character — the character (a raw line break included).
          this.fail('control-character', base + i);
          break outer;
        }
        if (tok === T_ESC) {
          c = s.charCodeAt(i);
          if (c < 128 && ESC_OK[c]) {
            i++;
            if (c === 117) {
              tok = T_UHEX;
              this.hexLeft = 4;
            } else tok = T_STRING;
            continue;
          }
          // RULE-04 invalid-escape — the backslash.
          this.fail('invalid-escape', this.escStart);
          break outer;
        }
        if (tok === T_UHEX) {
          while (i < n && this.hexLeft > 0) {
            c = s.charCodeAt(i);
            if (c < 128 && HEX[c]) {
              i++;
              this.hexLeft--;
            } else {
              this.fail('invalid-escape', this.escStart);
              break outer;
            }
          }
          if (this.hexLeft === 0) tok = T_STRING;
          continue;
        }
        if (tok === T_NUM) {
          let st = this.numState;
          let digits = this.numDigits;
          numloop: while (i < n) {
            c = s.charCodeAt(i);
            const d = c >= 48 && c <= 57;
            switch (st) {
              case N_MINUS:
                if (c === 48) st = N_ZERO;
                else if (d) st = N_INT;
                else break numloop;
                digits++;
                break;
              case N_ZERO:
                if (c === 46) st = N_DOT;
                else if (c === 101 || c === 69) st = N_E;
                else break numloop;
                break;
              case N_INT:
                if (d) digits++;
                else if (c === 46) st = N_DOT;
                else if (c === 101 || c === 69) st = N_E;
                else break numloop;
                break;
              case N_DOT:
                if (d) {
                  st = N_FRAC;
                  digits++;
                } else break numloop;
                break;
              case N_FRAC:
                if (d) digits++;
                else if (c === 101 || c === 69) st = N_E;
                else break numloop;
                break;
              case N_E:
                if (c === 43 || c === 45) st = N_ESIGN;
                else if (d) st = N_EXP;
                else break numloop;
                this.numExp = true;
                break;
              case N_ESIGN:
                if (d) st = N_EXP;
                else break numloop;
                break;
              case N_EXP:
                if (!d) break numloop;
                break;
            }
            i++;
          }
          this.numState = st;
          this.numDigits = digits;
          if (i === n) break outer;
          if ((st === N_ZERO || st === N_INT || st === N_FRAC || st === N_EXP) && !isNumContinuation(c)) {
            tok = T_NONE;
            const local = this.tokStart - base;
            this.finishNumber(local >= 0 ? s.slice(local, i) : this.numText + s.slice(0, i), base + i);
            this.numText = '';
            expect = depth === 0 ? S_END : S_AFTER;
            continue;
          }
          // RULE-04 invalid-number — first character of the number.
          this.fail('invalid-number', this.tokStart);
          break outer;
        }
        if (tok === T_LIT) {
          const lit = this.lit;
          let p = this.litPos;
          while (i < n && p < lit.length) {
            if (s.charCodeAt(i) !== lit.charCodeAt(p)) {
              this.fail('invalid-literal', this.tokStart);
              break outer;
            }
            i++;
            p++;
          }
          this.litPos = p;
          if (i === n) break outer;
          if (isIdentChar(s.charCodeAt(i))) {
            this.fail('invalid-literal', this.tokStart);
            break outer;
          }
          tok = T_NONE;
          expect = depth === 0 ? S_END : S_AFTER;
          continue;
        }
        if (tok === T_SLASH) {
          c = s.charCodeAt(i);
          this.fail(c === 47 || c === 42 ? 'comment' : 'unexpected-character', this.tokStart);
          break outer;
        }
        break outer; // T_DONE
      }

      // ---- between tokens ----
      c = s.charCodeAt(i);
      const cls = c < 128 ? CLS[c]! : C_OTHER;
      if (cls === C_WS) {
        i++;
        while (i < n) {
          c = s.charCodeAt(i);
          if (c === 32 || c === 10 || c === 13 || c === 9) i++;
          else break;
        }
        continue;
      }
      // Implements: RULE-03 — a leading byte-order mark is tolerated and reported (RULE-05).
      if (c === 0xfeff && base + i === 0) {
        if (warn) this.addWarning('byte-order-mark', 0, 1);
        i++;
        continue;
      }
      if (cls === C_SLASH) {
        // RULE-04 comment — the first '/'; a lone '/' is an unexpected character.
        this.tokStart = base + i;
        i++;
        if (i < n) {
          c = s.charCodeAt(i);
          this.fail(c === 47 || c === 42 ? 'comment' : 'unexpected-character', this.tokStart);
          break;
        }
        tok = T_SLASH;
        break;
      }

      switch (expect) {
        case S_VALUE:
        case S_VALUE_OR_CLOSE: {
          if (cls === C_RBRACK && expect === S_VALUE_OR_CLOSE) {
            // empty array
            if (skip) this.recordContainer(this.openPos[depth]!, base + i + 1, 0);
            depth--;
            i++;
            expect = depth === 0 ? S_END : S_AFTER;
            continue;
          }
          this.seenValue = true;
          switch (cls) {
            case C_QUOTE:
              this.tokStart = base + i;
              this.isKey = false;
              tok = T_STRING;
              i++;
              continue;
            case C_DIGIT:
            case C_MINUS:
              this.tokStart = base + i;
              tok = T_NUM;
              this.numExp = false;
              this.numState = c === 45 ? N_MINUS : c === 48 ? N_ZERO : N_INT;
              this.numDigits = c === 45 ? 0 : 1;
              i++;
              continue;
            case C_LBRACE:
            case C_LBRACK: {
              // Implements: RULE-14 / RULE-04 too-deep — the opening bracket that exceeds it.
              if (depth >= this.maxDepth) {
                this.fail('too-deep', base + i);
                break outer;
              }
              depth++;
              stack[depth] = cls === C_LBRACE ? OBJECT : ARRAY;
              this.openPos[depth] = base + i;
              this.commas[depth] = 0;
              if (cls === C_LBRACE && warn) {
                this.keyFrame[depth] = this.keys.length;
                this.keySets[depth] = null;
              }
              expect = cls === C_LBRACE ? S_KEY_OR_CLOSE : S_VALUE_OR_CLOSE;
              i++;
              continue;
            }
            case C_ALPHA: {
              this.tokStart = base + i;
              const idx = c === 116 ? 0 : c === 102 ? 1 : c === 110 ? 2 : -1;
              if (idx < 0) {
                this.fail('invalid-literal', base + i);
                break outer;
              }
              this.lit = LITS[idx]!;
              this.litPos = 1;
              tok = T_LIT;
              i++;
              continue;
            }
            case C_SQUOTE:
              this.fail('single-quotes', base + i);
              break outer;
            case C_DOTPLUS:
              this.fail('invalid-number', base + i);
              break outer;
            case C_RBRACE:
            case C_RBRACK:
              // RULE-04 trailing-comma — the comma; otherwise unexpected-closing — the bracket.
              if (depth > 0 && this.commaPos >= 0 && stack[depth] === (cls === C_RBRACE ? OBJECT : ARRAY))
                this.fail('trailing-comma', this.commaPos);
              else this.fail('unexpected-closing', base + i, { bracket: cls === C_RBRACE ? '}' : ']' });
              break outer;
            default:
              this.fail('unexpected-character', base + i);
              break outer;
          }
        }
        // falls through: unreachable (every case above continues or breaks out)
        case S_KEY_OR_CLOSE:
        case S_KEY: {
          if (cls === C_QUOTE) {
            this.tokStart = base + i;
            this.isKey = true;
            this.keyText = '';
            this.keyHasEsc = false;
            tok = T_STRING;
            i++;
            continue;
          }
          if (cls === C_RBRACE) {
            if (expect === S_KEY) {
              this.fail('trailing-comma', this.commaPos);
              break outer;
            }
            // empty object
            if (warn) this.closeObjectKeys(depth);
            if (skip) this.recordContainer(this.openPos[depth]!, base + i + 1, 0);
            depth--;
            i++;
            expect = depth === 0 ? S_END : S_AFTER;
            continue;
          }
          if (cls === C_SQUOTE) this.fail('single-quotes', base + i);
          else if (cls === C_ALPHA || cls === C_IDENT || cls === C_DIGIT) this.fail('unquoted-key', base + i);
          else if (cls === C_RBRACK) this.fail('unexpected-closing', base + i, { bracket: ']' });
          else this.fail('unexpected-character', base + i);
          break outer;
        }
        case S_COLON: {
          if (cls === C_COLON) {
            i++;
            this.commaPos = -1;
            expect = S_VALUE;
            continue;
          }
          // RULE-04 missing-colon — first character of the token after the key.
          this.fail('missing-colon', base + i);
          break outer;
        }
        case S_AFTER: {
          if (cls === C_COMMA) {
            this.commaPos = base + i;
            this.commas[depth]!++;
            i++;
            expect = stack[depth] === OBJECT ? S_KEY : S_VALUE;
            continue;
          }
          if (cls === C_RBRACE || cls === C_RBRACK) {
            const want = cls === C_RBRACE ? OBJECT : ARRAY;
            if (stack[depth] !== want) {
              this.fail('unexpected-closing', base + i, { bracket: cls === C_RBRACE ? '}' : ']' });
              break outer;
            }
            if (want === OBJECT && warn) this.closeObjectKeys(depth);
            if (skip) this.recordContainer(this.openPos[depth]!, base + i + 1, this.commas[depth]! + 1);
            depth--;
            i++;
            expect = depth === 0 ? S_END : S_AFTER;
            continue;
          }
          // RULE-04 missing-comma — first character of the token after the missing comma.
          if (
            cls === C_QUOTE ||
            cls === C_SQUOTE ||
            cls === C_LBRACE ||
            cls === C_LBRACK ||
            cls === C_DIGIT ||
            cls === C_MINUS ||
            cls === C_ALPHA
          )
            this.fail('missing-comma', base + i);
          else this.fail('unexpected-character', base + i);
          break outer;
        }
        case S_END:
          // RULE-04 extra-content — first character after the top-level value.
          this.fail('extra-content', base + i);
          break outer;
      }
    }

    this.expect = expect;
    if (this.tok !== T_DONE) this.tok = tok;
    this.depth = depth;
    this.base = base + n;
    // Keys and numbers crossing the chunk boundary keep their text so far.
    if (warn && this.tok !== T_DONE) {
      const local = this.tokStart - base;
      if ((this.tok === T_STRING || this.tok === T_ESC || this.tok === T_UHEX) && this.isKey)
        this.keyText = local >= 0 ? s.slice(local + 1, n) : this.keyText + s;
      else if (this.tok === T_NUM) this.numText = local >= 0 ? s.slice(local, n) : this.numText + s;
    }
    return this.tok !== T_DONE;
  }

  /** Ends the input and returns the outcome. */
  end(): ValidationOutcome {
    const endPos = this.base;
    if (this.tok !== T_DONE) {
      if (this.tok === T_STRING || this.tok === T_ESC || this.tok === T_UHEX) {
        // RULE-04 unclosed-string — the opening quote.
        this.fail('unclosed-string', this.tokStart);
      } else if (this.tok === T_NUM) {
        const st = this.numState;
        if (st === N_ZERO || st === N_INT || st === N_FRAC || st === N_EXP) {
          this.tok = T_NONE;
          this.finishNumber(this.numText, endPos);
          this.expect = this.depth === 0 ? S_END : S_AFTER;
        } else this.fail('invalid-number', this.tokStart);
      } else if (this.tok === T_LIT) {
        if (this.litPos === this.lit.length) {
          this.tok = T_NONE;
          this.expect = this.depth === 0 ? S_END : S_AFTER;
        } else this.fail('invalid-literal', this.tokStart);
      } else if (this.tok === T_SLASH) {
        this.fail('unexpected-character', this.tokStart);
      }
      if (!this.error) {
        if (this.depth > 0) {
          // RULE-04 unclosed-container — end of document; the hint names the innermost open
          // bracket and the line it opened on.
          const d = this.depth;
          this.fail('unclosed-container', endPos, {
            length: 0,
            bracket: this.stack[d] === OBJECT ? '{' : '[',
            openPos: this.openPos[d]!,
          });
        } else if (!this.seenValue) {
          // RULE-03: zero characters is empty; RULE-04 empty-document: only whitespace (or a BOM).
          if (endPos === 0)
            return { validity: 'empty', error: null, warnings: [], warningOverflow: 0, length: 0, skipTable: null };
          this.fail('empty-document', 0);
        }
      }
    }
    if (this.error) {
      return {
        validity: 'invalid',
        error: this.error,
        warnings: [],
        warningOverflow: 0,
        length: endPos,
        skipTable: null,
      };
    }
    return {
      validity: 'valid',
      error: null,
      warnings: this.warnings,
      warningOverflow: this.warnOverflow,
      length: endPos,
      skipTable: this.skipT ? this.finishSkipTable() : null,
    };
  }

  private finishSkipTable(): SkipTable {
    const n = this.skipN;
    const idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    const st = this.skipSt;
    idx.sort((a, b) => st[a]! - st[b]!);
    const starts = new Uint32Array(n);
    const ends = new Uint32Array(n);
    const counts = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      const k = idx[i]!;
      starts[i] = st[k]!;
      ends[i] = this.skipEn[k]!;
      counts[i] = this.skipCt[k]!;
    }
    return { starts, ends, counts, n, threshold: this.skipT };
  }
}
