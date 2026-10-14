// Implements: NFR-06 (full keyboard operation), SCR-Formatter "Accessibility" — focus is never
// dropped to the page (QA-013, WCAG 2.4.3). Busy operations disable the toolbar (D-005), the
// confirmation and notice bars come and go; when the focused control is disabled or removed that
// way, focus returns to the control that triggered it once it is usable again, or to the editor.
import { effect } from '@preact/signals';
import type { AppController } from './controller';

/** Transient UI: focus inside it returns to where it came from when it goes away. */
const TRANSIENT = '.tk-notice, .tk-dialog, .tk-menu';

const lost = () => !document.activeElement || document.activeElement === document.body;

export function installFocusReturn(root: HTMLElement, app: AppController): () => void {
  /** The last focused element outside transient UI (the "trigger"). */
  let anchor: HTMLElement | null = null;
  /** Where focus goes back to after the current blocking period, if it is lost meanwhile. */
  let invoker: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const onFocusIn = (e: FocusEvent) => {
    const el = e.target;
    if (el instanceof HTMLElement && !el.closest(TRANSIENT)) anchor = el;
  };
  root.addEventListener('focusin', onFocusIn);

  const usable = (el: HTMLElement | null): el is HTMLElement =>
    !!el && el.isConnected && !(el as HTMLButtonElement).disabled && !el.closest('[hidden], [inert]');

  /** Focuses `el` (the editor's host focuses the editor) or the editor when `el` is gone. */
  const restore = (el: HTMLElement | null) => {
    if (!lost()) return;
    if (usable(el) && !el.closest(TRANSIENT)) {
      if (el.classList.contains('tk-editor-host')) app.editor?.focus();
      else el.focus();
      if (!lost()) return;
    }
    app.editor?.focus();
  };

  /** After the render that follows a state change (Preact renders in a microtask). */
  const later = (fn: () => void) => {
    clearTimeout(timer);
    timer = setTimeout(fn, 0);
  };

  // Blocking periods (busy, re-seed, confirmation): remember the trigger, restore it after.
  const stopBlocked = effect(() => {
    const blocked = app.blocked();
    if (blocked) {
      const active = document.activeElement;
      if (!invoker) invoker = active instanceof HTMLElement && active !== document.body ? active : anchor;
      // the confirmation dialog's own buttons are transient; the trigger is what opened it
      if (invoker?.closest(TRANSIENT)) invoker = anchor;
      return;
    }
    const target = invoker;
    if (!target) return;
    later(() => {
      if (app.blocked()) return; // blocked again (Continue → loading): keep waiting
      invoker = null;
      restore(target);
    });
  });

  // A notice bar dismissed (or replaced) while focus was inside it.
  let barFocused = false;
  const stopBar = effect(() => {
    void app.state.bar.value;
    void app.state.busy.value;
    const inBar = !!document.activeElement?.closest?.('.tk-notice');
    if (barFocused || inBar)
      later(() => {
        if (!app.blocked()) restore(anchor);
      });
    barFocused = inBar;
  });
  const onFocusTrack = () => (barFocused = !!document.activeElement?.closest?.('.tk-notice'));
  root.addEventListener('focusin', onFocusTrack);

  return () => {
    clearTimeout(timer);
    stopBlocked();
    stopBar();
    root.removeEventListener('focusin', onFocusIn);
    root.removeEventListener('focusin', onFocusTrack);
  };
}
