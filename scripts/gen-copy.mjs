// copy.md → typed message catalog, one text per language (ADR-0011, ADR-0014 §3, MOD-Copy).
// Implements: F-012.AC12 — every COPY ID that is not deprecated has a text in every language,
// with the same placeholders; otherwise the build fails. Each table's header names its language
// columns (| ID | en-US | vi-VN | Notes |); the first language is the default (RULE-19).
// Deprecated rows are skipped.
import fs from 'node:fs';
import { abs, emit, GENERATED_HEADER, tableCells } from './lib/util.mjs';

const SOURCE = 'specs/30-experience/copy.md';
const OUT = abs('src/copy/messages.gen.ts');
const LANGUAGE_TAG = /^[a-z]{2}-[A-Z]{2}$/;

const placeholders = (text) => [...new Set([...text.matchAll(/\{([a-zA-Z]\w*)\}/g)].map((x) => x[1]))].sort();

/** Parses copy.md into `{ languages, rows: [{ id, texts: { [lang]: text }, params }] }`. */
export function parseCopy(md) {
  const rows = [];
  const seen = new Set();
  let languages = null; // from the first table header; every table must use the same columns
  let columns = null; // the current table's language columns
  for (const line of md.split('\n')) {
    const cells = tableCells(line);
    if (!cells || cells.length < 2) continue;
    if (cells[0] === 'ID') {
      columns = cells.slice(1).filter((c) => LANGUAGE_TAG.test(c));
      if (columns.length === 0) throw new Error(`${SOURCE}: table header has no language columns`);
      if (cells.slice(1, 1 + columns.length).join() !== columns.join()) {
        throw new Error(`${SOURCE}: language columns must come right after ID`);
      }
      if (languages === null) languages = columns;
      else if (columns.join() !== languages.join()) {
        throw new Error(`${SOURCE}: table languages ${columns.join(', ')} differ from ${languages.join(', ')}`);
      }
      continue;
    }
    const m = /^\*\*COPY-([a-z0-9_]+\.[a-z0-9_]+)\*\*$/.exec(cells[0]);
    if (!m) continue;
    if (!columns) throw new Error(`${SOURCE}: COPY row before any table header`);
    const [, id] = m;
    const notes = cells[1 + columns.length] ?? '';
    if (/\bdeprecated\b/i.test(notes)) continue;
    if (seen.has(id)) throw new Error(`${SOURCE}: duplicate COPY-${id}`);
    seen.add(id);
    const texts = {};
    columns.forEach((lang, i) => {
      const text = cells[1 + i] ?? '';
      if (text === '') throw new Error(`${SOURCE}: COPY-${id} has no ${lang} text`);
      texts[lang] = text;
    });
    const params = placeholders(texts[columns[0]]);
    for (const lang of columns.slice(1)) {
      if (placeholders(texts[lang]).join() !== params.join()) {
        throw new Error(`${SOURCE}: COPY-${id} placeholders differ between ${columns[0]} and ${lang}`);
      }
    }
    rows.push({ id, texts, params });
  }
  if (rows.length === 0 || languages === null) throw new Error(`${SOURCE}: no COPY rows found`);
  return { languages, rows };
}

export function genCopy({ check }) {
  const { languages, rows } = parseCopy(fs.readFileSync(abs(SOURCE), 'utf8'));
  const paramType = (ps) => (ps.length ? `{ ${ps.map((p) => `${p}: string | number`).join('; ')} }` : 'undefined');
  const table = (lang) =>
    `  ${JSON.stringify(lang)}: {\n${rows.map((r) => `    ${JSON.stringify(r.id)}: ${JSON.stringify(r.texts[lang])},`).join('\n')}\n  },`;
  const ts = `// ${GENERATED_HEADER(SOURCE, 'scripts/gen-copy.mjs')}
// Deprecated strings are not generated. ${rows.length} messages × ${languages.length} languages.

/** Supported languages, in copy.md column order; the first is the default (RULE-19). */
export const LANGUAGES = ${JSON.stringify(languages)} as const;

export type Language = (typeof LANGUAGES)[number];

/** Every user-facing string per language, keyed by COPY ID without the \`COPY-\` prefix. */
export const CATALOG = {
${languages.map(table).join('\n')}
} as const;

/** The default language's strings. */
export const MESSAGES = CATALOG[${JSON.stringify(languages[0])}];

export type MessageId = keyof typeof MESSAGES;

/** Placeholder parameters per message (\`undefined\` when the text has none). */
export interface MessageParams {
${rows.map((r) => `  ${JSON.stringify(r.id)}: ${paramType(r.params)};`).join('\n')}
}
`;
  return emit(OUT, ts, { check });
}
