// MOD-Copy — the only home of user-facing strings (ADR-0011). Strings are generated from
// specs/30-experience/copy.md into messages.gen.ts; IDs and parameters are type-checked.
import { MESSAGES, type MessageId, type MessageParams } from './messages.gen';

export { MESSAGES, type MessageId, type MessageParams };

type Args<Id extends MessageId> = MessageParams[Id] extends undefined ? [] : [params: MessageParams[Id]];

/** The text of a COPY ID with its `{placeholders}` filled in. */
export function t<Id extends MessageId>(id: Id, ...args: Args<Id>): string {
  const text: string = MESSAGES[id];
  const params = args[0] as Record<string, string | number> | undefined;
  if (!params) return text;
  return text.replace(/\{([a-zA-Z]\w*)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

/**
 * Locale-neutral size for messages such as COPY-notice.large and COPY-confirm.very_large:
 * bytes below 1 KB, then KB and MB with one decimal (1 KB = 1,000 B, 1 MB = 1,000,000 B;
 * specs/10-domain/rules.md).
 */
export function formatSize(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(Math.floor(bytes / 100) / 10).toFixed(1)} KB`;
  return `${(Math.floor(bytes / 100_000) / 10).toFixed(1)} MB`;
}

/** Counts and line numbers with the locale's digit grouping (COPY-status.size_lines notes). */
export function formatCount(n: number): string {
  return new Intl.NumberFormat().format(n);
}

/** Messages with a count whose final word is singular when the count is 1 (copy.md notes). */
export type CountedId = 'status.valid_warnings' | 'status.size_lines' | 'status.size_lines_short' | 'issue.more';

/**
 * `t()` for a message with a count (`{count}`, or `{lines}` for the size line): the number is
 * grouped per locale and, when it is 1, the message's final plural word is made singular
 * ("1 warning", "1 line") as the copy.md notes say.
 */
export function tCount(id: CountedId, count: number, size?: string): string {
  const n = formatCount(count);
  const text =
    id === 'status.size_lines' || id === 'status.size_lines_short'
      ? t(id, { size: size ?? '', lines: n })
      : t(id, { count: n });
  return count === 1 ? text.replace(/(\w\w)s(\W*)$/, '$1$2') : text;
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
  return id in MESSAGES ? MESSAGES[id as MessageId] : t('hint.unexpected_character');
}
