// Shared e2e helpers: tool/host origins and CSP-violation recording.
import type { Page } from '@playwright/test';

export const TOOL = 'http://localhost:4173';
export const HOST = 'http://localhost:4174';
export const UNLISTED = 'http://localhost:4175';
export const ADMIN = 'http://localhost:4179';

/** Token values from tokens.json, as computed colours. */
export const BG = { dark: 'rgb(15, 11, 22)', light: 'rgb(251, 250, 254)' } as const;

declare global {
  interface Window {
    __csp?: string[];
    __firstFrame?: { theme: string | null; bg: string };
  }
}

/** Records CSP violations and the theme/background of the first animation frame, in every frame. */
export async function instrument(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__csp?.push(`${e.effectiveDirective} ${e.blockedURI}`);
    });
    requestAnimationFrame(() => {
      window.__firstFrame = {
        theme: document.documentElement.getAttribute('data-theme'),
        bg: getComputedStyle(document.documentElement).backgroundColor,
      };
    });
  });
}
