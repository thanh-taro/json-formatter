// MOD-Copy — the only home of user-facing strings (ADR-0011, ADR-0014). Strings are generated from
// specs/30-experience/copy.md into messages.gen.ts, one text per language; IDs and parameters are
// type-checked. Implements: F-012.R1 (strings in the active language), F-012.R6 (numbers, sizes
// and plurals per language), RULE-19.
import { signal } from '@preact/signals';
import { CATALOG, LANGUAGES, MESSAGES, type Language, type MessageId, type MessageParams } from './messages.gen';

export { CATALOG, LANGUAGES, MESSAGES, type Language, type MessageId, type MessageParams };

/** The default language (RULE-19): the first language column of copy.md, en-US. */
export const DEFAULT_LANGUAGE: Language = LANGUAGES[0];

/** The active language. Set by MOD-Host (address, host messages, browser); read by `t()`. */
export const language = signal<Language>(DEFAULT_LANGUAGE);

/** Makes `lang` the active language; the same value again changes nothing (F-012 edge cases). */
export function setLanguage(lang: Language): void {
  language.value = lang;
}

type Args<Id extends MessageId> = MessageParams[Id] extends undefined ? [] : [params: MessageParams[Id]];

/** The text of a COPY ID in the active language, with its `{placeholders}` filled in. */
export function t<Id extends MessageId>(id: Id, ...args: Args<Id>): string {
  const text: string = CATALOG[language.value][id];
  const params = args[0] as Record<string, string | number> | undefined;
  if (!params) return text;
  return text.replace(/\{([a-zA-Z]\w*)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

const numberFormats = new Map<string, Intl.NumberFormat>();
function numberFormat(key: string, make: () => Intl.NumberFormat): Intl.NumberFormat {
  let f = numberFormats.get(key);
  if (!f) numberFormats.set(key, (f = make()));
  return f;
}

/**
 * Size for messages such as COPY-status.size_lines, COPY-notice.large and COPY-confirm.very_large:
 * bytes below 1 KB, then KB and MB with one decimal, rounded down (1 KB = 1,000 B, 1 MB =
 * 1,000,000 B; specs/10-domain/rules.md), written with the active language's decimal mark and no
 * digit grouping. Implements: F-012.R6 (vi-VN `1,5 MB`, en-US `1.5 MB`; ADR-0014 §5).
 */
export function formatSize(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  const lang = language.value;
  const oneDecimal = numberFormat(
    `${lang}|size`,
    () => new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false }),
  );
  if (bytes < 1_000_000) return `${oneDecimal.format(Math.floor(bytes / 100) / 10)} KB`;
  return `${oneDecimal.format(Math.floor(bytes / 100_000) / 10)} MB`;
}

/**
 * Counts, line and column numbers with the active language's digit grouping (COPY-status.size_lines
 * notes). Implements: F-012.R6 (vi-VN `1.234`, en-US `1,234`).
 */
export function formatCount(n: number): string {
  const lang = language.value;
  return numberFormat(lang, () => new Intl.NumberFormat(lang)).format(n);
}

/** Messages with a count whose final word is singular when the count is 1 (copy.md notes). */
export type CountedId =
  | 'status.valid_warnings'
  | 'status.size_lines'
  | 'status.size_lines_short'
  | 'issue.more'
  | 'tree.count_keys'
  | 'tree.count_items';

/**
 * `t()` for a message with a count (`{count}`, or `{lines}` for the size line): the number is
 * grouped per language and, in en-US only, when it is 1 the message's final plural word is made
 * singular ("1 warning", "1 line") as the copy.md notes say; vi-VN has no plural forms
 * (F-012.R6, ADR-0014 §5).
 */
export function tCount(id: CountedId, count: number, size?: string): string {
  const n = formatCount(count);
  const text =
    id === 'status.size_lines' || id === 'status.size_lines_short'
      ? t(id, { size: size ?? '', lines: n })
      : t(id, { count: n });
  return count === 1 && language.value === 'en-US' ? text.replace(/(\w\w)s(\W*)$/, '$1$2') : text;
}

/** The parts of an issue a hint needs (ENT-Issue `code` and `params`). */
export interface HintSource {
  code: string;
  params?: { bracket?: string; line?: number } | undefined;
}

/** Implements: F-005.R3, F-005.R4 — the hint for an issue's code (copy.md "Hints"). */
export function hintFor(issue: HintSource): string {
  const id = `hint.${issue.code.replace(/-/g, '_')}`;
  if (id === 'hint.unclosed_container')
    return t(id, { bracket: issue.params?.bracket ?? '', line: formatCount(issue.params?.line ?? 1) });
  if (id === 'hint.unexpected_closing') return t(id, { bracket: issue.params?.bracket ?? '' });
  return id in MESSAGES ? t(id as 'hint.comment') : t('hint.unexpected_character');
}
