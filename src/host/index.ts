// MOD-Host — theme, origin-checked host messages, ready signal (ADR-0008); offline worker
// (ADR-0012) arrives with F-011.
// Implements: F-008.R1, F-008.R2, F-008.R4 (message side), F-008.R5, F-008.R6, RULE-16, INV-02,
// NFR-09 (message-origin side).
import { acceptThemeMessage, readyMessage, readyTargets } from './contract';
import { setHostTheme, startTheme } from './theme';

export { theme } from './theme';
export type { Theme } from './contract';

/** Origins allowed to embed the tool and send settings messages (deploy setting HOST_ORIGINS). */
export const ALLOWED_HOST_ORIGINS: readonly string[] = __HOST_ORIGINS__;

/** True when the tool runs inside a host frame (a cross-origin `top` that throws counts). */
export function isEmbedded(): boolean {
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
}

let started = false;

/**
 * Starts the host relationship once: theme controller, and — only when embedded with a
 * non-empty allow-list (RULE-16) — the settings listener and a single ready signal sent after
 * the first render. Call after the first `render()`.
 */
export function startHost({
  allowedOrigins = ALLOWED_HOST_ORIGINS,
}: { allowedOrigins?: readonly string[] } = {}): void {
  if (started) return;
  started = true;
  startTheme();
  const embedded = isEmbedded();
  document.documentElement.toggleAttribute('data-embedded', embedded);
  if (!embedded || allowedOrigins.length === 0) return; // standalone only (F-008.R6)

  // Implements: F-008.R4 / AC5 — allow-listed origin and the parent window, else ignored silently.
  window.addEventListener('message', (event) => {
    const value = acceptThemeMessage(
      { origin: event.origin, source: event.source, data: event.data },
      allowedOrigins,
      window.parent,
    );
    if (value) setHostTheme(value);
  });

  // Implements: F-008.R5 / AC6 — one ready signal after the first paint, explicit targets only.
  requestAnimationFrame(() =>
    setTimeout(() => {
      for (const target of readyTargets(document.referrer, allowedOrigins)) {
        window.parent.postMessage(readyMessage(), target);
      }
    }, 0),
  );
}
