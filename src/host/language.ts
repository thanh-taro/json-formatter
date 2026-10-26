// MOD-Host runtime language controller (ADR-0014 §1–2).
// Implements: F-012.R1 (address language from the first render, page language), F-012.R2 (host
// messages switch live), F-012.R3 (browser preferences, then en-US), RULE-19.
// The boot script has already set `<html lang>` before first paint; this module resolves the same
// language when it is imported — before the app's first render — and on every accepted message,
// and hands it to MOD-Copy. The language is never stored (RULE-19).
import { setLanguage, type Language } from '../copy';
import { resolveLanguage } from './contract';

function readAddressLanguage(): string | null {
  try {
    return new URLSearchParams(location.search).get('lang');
  } catch {
    return null;
  }
}

function browserLanguages(): readonly string[] {
  try {
    return navigator.languages?.length ? navigator.languages : [navigator.language];
  } catch {
    return [];
  }
}

const sources: { message: Language | null; address: string | null; browser: readonly string[] } = {
  message: null,
  address: readAddressLanguage(),
  browser: browserLanguages(),
};

function apply(): void {
  const next = resolveLanguage(sources);
  setLanguage(next);
  const root = document.documentElement;
  if (root.getAttribute('lang') !== next) root.setAttribute('lang', next);
}

/** A supported language from an accepted host settings message (highest precedence, RULE-19). */
export function setHostLanguage(value: Language): void {
  sources.message = value;
  apply();
}

// Resolve at import, so the first render already uses the right strings (F-012.AC1).
apply();
