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
