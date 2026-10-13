// Implements: F-008.R2 (device preference followed live), MOD-Host.
// The boot script sets the initial theme; this module exposes it as a signal and keeps
// following the device preference while no explicit theme was given. Host messages
// (taro:theme, F-008.R1) are added with F-008.
import { signal } from '@preact/signals';
import type { Theme } from '../app/styles/tokens.gen';

const root = document.documentElement;

function readTheme(): Theme {
  return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

export const theme = signal<Theme>(readTheme());

export function setTheme(value: Theme): void {
  root.setAttribute('data-theme', value);
  theme.value = value;
}

export function startTheme(): void {
  if (root.getAttribute('data-theme-source') !== 'device') return;
  const query = matchMedia('(prefers-color-scheme: light)');
  query.addEventListener('change', (e) => setTheme(e.matches ? 'light' : 'dark'));
}
