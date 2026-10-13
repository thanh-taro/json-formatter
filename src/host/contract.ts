// MOD-Host — the host settings contract as pure functions (no DOM), ADR-0008 §1 and §3.
// Implements: RULE-16, F-008.R1, F-008.R2, F-008.R4 (message side), F-008.R5, INV-02, NFR-09.

export type Theme = 'light' | 'dark';

/** Inbound settings message type (portal → tool). */
export const THEME_MESSAGE = 'taro:theme';
/** The only outbound message type (tool → portal). */
export const READY_MESSAGE = 'taro:ready';

/** `light` or `dark`; anything else is not a theme (RULE-16: unknown values are ignored). */
export function parseTheme(value: unknown): Theme | null {
  return value === 'light' || value === 'dark' ? value : null;
}

export interface InboundMessage {
  readonly origin: string;
  readonly source: unknown;
  readonly data: unknown;
}

/**
 * The theme carried by a settings message, or null when the message must be ignored.
 * Implements: F-008.R4 / F-008.AC5 — accepted only from an allow-listed origin and only from the
 * parent window (a sibling frame can reach the tool through `parent.frames`, SP-iframe).
 */
export function acceptThemeMessage(
  message: InboundMessage,
  allowedOrigins: readonly string[],
  parent: unknown,
): Theme | null {
  if (!allowedOrigins.includes(message.origin)) return null;
  if (message.source === null || message.source !== parent) return null;
  const data = message.data;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const { type, value } = data as { type?: unknown; value?: unknown };
  if (type !== THEME_MESSAGE) return null;
  return parseTheme(value);
}

/**
 * Theme precedence (ADR-0008 §1): latest valid host message, then the address parameter, then
 * the device preference. Implements: F-008.R1, F-008.R2.
 */
export function resolveTheme(input: { message: Theme | null; address: Theme | null; device: Theme }): Theme {
  return input.message ?? input.address ?? input.device;
}

/** The ready signal: its type only, never any content (F-008.R5, INV-02). */
export function readyMessage(): { readonly type: typeof READY_MESSAGE } {
  return { type: READY_MESSAGE };
}

/**
 * Explicit target origins for the ready signal, never `*` (ADR-0008 §3): the allowed origin
 * matching `document.referrer`, otherwise every allowed origin (the browser drops the others).
 */
export function readyTargets(referrer: string, allowedOrigins: readonly string[]): string[] {
  let origin: string | null = null;
  try {
    origin = referrer ? new URL(referrer).origin : null;
  } catch {
    origin = null;
  }
  // Defence in depth: the build refuses wildcards in HOST_ORIGINS, and none is ever a target.
  const allowed = allowedOrigins.filter((o) => o !== '*');
  return origin !== null && allowed.includes(origin) ? [origin] : allowed;
}
