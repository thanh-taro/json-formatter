// Independent reference tokenizer for valid JSON (promoted from SP-formatter `test/reftok.ts`),
// the INV-01 oracle: a regular expression, sharing no code with MOD-Core. Never JSON.parse —
// Node 24.19 returns wrong member names for escaped keys (ADR-0005 Consequences).
const RE = /[ \t\n\r]+|(﻿|"(?:[^"\\]|\\.)*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}[\]:,])/y;

/** The token sequence of a valid document (whitespace dropped, a leading BOM kept as a token). */
export function tokens(text: string): string[] {
  const out: string[] = [];
  RE.lastIndex = 0;
  while (RE.lastIndex < text.length) {
    const at = RE.lastIndex;
    const m = RE.exec(text);
    if (!m) throw new Error(`reftok: cannot tokenize at ${at}: ${JSON.stringify(text.slice(at, at + 20))}`);
    if (m[1] !== undefined) out.push(m[1]);
  }
  return out;
}
