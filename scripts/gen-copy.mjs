// copy.md → typed message catalog (ADR-0011, MOD-Copy). Deprecated rows are skipped.
import fs from 'node:fs';
import { abs, emit, GENERATED_HEADER, tableCells } from './lib/util.mjs';

const SOURCE = 'specs/30-experience/copy.md';
const OUT = abs('src/copy/messages.gen.ts');

export function parseCopy(md) {
  const rows = [];
  const seen = new Set();
  for (const line of md.split('\n')) {
    const cells = tableCells(line);
    if (!cells || cells.length < 2) continue;
    const m = /^\*\*COPY-([a-z0-9_]+\.[a-z0-9_]+)\*\*$/.exec(cells[0]);
    if (!m) continue;
    const [, id] = m;
    const text = cells[1];
    const notes = cells[2] ?? '';
    if (/\bdeprecated\b/i.test(notes)) continue;
    if (seen.has(id)) throw new Error(`${SOURCE}: duplicate COPY-${id}`);
    seen.add(id);
    const params = [...new Set([...text.matchAll(/\{([a-zA-Z]\w*)\}/g)].map((x) => x[1]))];
    rows.push({ id, text, params });
  }
  if (rows.length === 0) throw new Error(`${SOURCE}: no COPY rows found`);
  return rows;
}

export function genCopy({ check }) {
  const rows = parseCopy(fs.readFileSync(abs(SOURCE), 'utf8'));
  const paramType = (ps) => (ps.length ? `{ ${ps.map((p) => `${p}: string | number`).join('; ')} }` : 'undefined');
  const ts = `// ${GENERATED_HEADER(SOURCE, 'scripts/gen-copy.mjs')}
// Deprecated strings are not generated. ${rows.length} messages.

/** Every user-facing string, keyed by COPY ID without the \`COPY-\` prefix. */
export const MESSAGES = {
${rows.map((r) => `  ${JSON.stringify(r.id)}: ${JSON.stringify(r.text)},`).join('\n')}
} as const;

export type MessageId = keyof typeof MESSAGES;

/** Placeholder parameters per message (\`undefined\` when the text has none). */
export interface MessageParams {
${rows.map((r) => `  ${JSON.stringify(r.id)}: ${paramType(r.params)};`).join('\n')}
}
`;
  return emit(OUT, ts, { check });
}
