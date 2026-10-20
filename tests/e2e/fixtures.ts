// Shared e2e helpers: tool/host origins and CSP-violation recording.
import type { Page } from '@playwright/test';

// Same port scheme as tests/e2e/server.mjs (E2E_PORT_BASE, default 4400).
const BASE = Number(process.env.E2E_PORT_BASE ?? 4400);
export const TOOL = `http://localhost:${BASE}`;
export const HOST = `http://localhost:${BASE + 1}`;
export const UNLISTED = `http://localhost:${BASE + 2}`;
export const ADMIN = `http://localhost:${BASE + 6}`;

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
