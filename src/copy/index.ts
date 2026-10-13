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
