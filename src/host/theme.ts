// MOD-Host runtime theme controller (ADR-0008 §1).
// Implements: F-008.R1 (address theme, then host messages), F-008.R2 (device preference followed
// live), RULE-16 (unknown values ignored). The boot script has already set the initial
// `data-theme` before first paint; this module re-resolves it on every input and exposes it.
import { signal } from '@preact/signals';
import { parseTheme, resolveTheme, type Theme } from './contract';

const root = document.documentElement;
const LIGHT_QUERY = '(prefers-color-scheme: light)';

function readAddressTheme(): Theme | null {
  try {
    return parseTheme(new URLSearchParams(location.search).get('theme'));
  } catch {
    return null;
  }
}

// Same rule as the boot script: light only when the device asks for it.
const deviceTheme = (query: MediaQueryList | { matches: boolean }): Theme => (query.matches ? 'light' : 'dark');

const sources: { message: Theme | null; address: Theme | null; device: Theme } = {
  message: null,
  address: readAddressTheme(),
  device: deviceTheme(matchMedia(LIGHT_QUERY)),
};

/** The theme in use. */
export const theme = signal<Theme>(resolveTheme(sources));

function apply(): void {
  const next = resolveTheme(sources);
  if (root.getAttribute('data-theme') !== next) root.setAttribute('data-theme', next);
  theme.value = next;
}

/** A valid theme from an accepted host settings message (highest precedence). */
export function setHostTheme(value: Theme): void {
  sources.message = value;
  apply();
}

let started = false;

/** Applies the resolved theme and follows the device preference live. */
export function startTheme(): void {
  if (started) return;
  started = true;
  const query = matchMedia(LIGHT_QUERY);
  query.addEventListener('change', (e) => {
    sources.device = deviceTheme(e);
    apply();
  });
  apply();
}
