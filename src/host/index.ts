// MOD-Host — theme, origin-checked host messages, ready signal, offline worker (ADR-0008, ADR-0012).
export { theme, setTheme, startTheme } from './theme';

/** Origins allowed to embed the tool and send settings messages (deploy setting HOST_ORIGINS). */
export const ALLOWED_HOST_ORIGINS: readonly string[] = __HOST_ORIGINS__;

/** True when the tool runs inside a host frame. */
export function isEmbedded(): boolean {
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
}
