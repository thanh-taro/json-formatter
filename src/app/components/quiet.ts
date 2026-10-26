// Implements: F-012 UX notes ("a live switch does not announce anything"), ADR-0014 §4 — a
// message already shown in a live region (notice bar, progress, toast) is re-rendered in the new
// language as data, not as news: once the language differs from the one it was shown in, its
// region is marked `aria-live="off"` in the same update, so the new text is not announced. A new
// message (new key) is live again.
import { useRef } from 'preact/hooks';
import { language, type Language } from '../../copy';

/** True when the message `key` was first shown in another language than the active one. */
export function useQuietAfterSwitch(key: unknown): boolean {
  const lang = language.value;
  const shown = useRef<{ key: unknown; lang: Language } | null>(null);
  if (!shown.current || shown.current.key !== key) shown.current = { key, lang };
  return shown.current.lang !== lang;
}
