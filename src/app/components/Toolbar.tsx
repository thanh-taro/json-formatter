// Implements: CMP-Toolbar — load group (F-001: COPY-action.open, COPY-action.clear), Find (F-010),
// format group (F-002, F-003, F-004: beautify, minify, re-indent, indent selector), view switch
// (F-006, COPY-label.view) and export group (F-007: COPY-action.copy, COPY-action.download);
// "empty document" and "busy" states; toolbar keyboard model (WAI-ARIA APG: one Tab stop,
// Left/Right arrows move between enabled controls, Home/End go to the first/last).
// Implements: CMP-Toolbar "narrow" (QA-001, NFR-07, style.md "Regions") — when the actions do not
// fit, labels hide first (icons stay, with accessible names), then groups collapse into an
// overflow menu (COPY-action.more), as on the SCR-Formatter narrow boards: Beautify, Minify,
// Text | Tree, Copy and More actions stay in the bar; nothing is ever clipped.
// Implements: style.md rule 2 — Beautify is the only filled control (QA-002).
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { t } from '../../copy';
import type { AppController } from '../controller';
import { Icon, type IconName } from './Icon';
import { IndentSelector } from './IndentSelector';

const CONTROLS = 'button, select, input';
const MENU_ID = 'tk-toolbar-more';
/** Controls of the bar itself (the overflow menu has its own arrow-key model). */
const barControls = (bar: HTMLElement) =>
  [...bar.querySelectorAll<HTMLButtonElement | HTMLSelectElement | HTMLInputElement>(CONTROLS)].filter(
    (c) => !c.closest('.tk-menu'),
  );
const controlsOf = (bar: HTMLElement) => barControls(bar).filter((c) => !c.disabled);

type Place = 'label' | 'icon' | 'menu';
type Action = 'open' | 'clear' | 'find' | 'beautify' | 'minify' | 'reindent' | 'indent' | 'copy' | 'download';
type Layout = Record<Action, Place>;

const L = 'label';
const I = 'icon';
const M = 'menu';
/**
 * Layouts from widest to narrowest; the first one whose bar does not overflow is used.
 * 2 is the design's narrow toolbar (SCR-Formatter *_narrow, CMP-Toolbar "narrow · 390 coarse").
 */
const LAYOUTS: Layout[] = [
  { open: L, clear: L, find: L, beautify: L, minify: L, reindent: L, indent: L, copy: L, download: L },
  { open: I, clear: I, find: I, beautify: L, minify: I, reindent: I, indent: L, copy: I, download: I },
  { open: M, clear: M, find: M, beautify: L, minify: I, reindent: M, indent: M, copy: I, download: M },
  { open: M, clear: M, find: M, beautify: I, minify: I, reindent: M, indent: M, copy: I, download: M },
  { open: M, clear: M, find: M, beautify: I, minify: M, reindent: M, indent: M, copy: M, download: M },
];

interface Spec {
  copy:
    | 'action.open'
    | 'action.clear'
    | 'action.find'
    | 'action.beautify'
    | 'action.minify'
    | 'action.reindent'
    | 'action.copy'
    | 'action.download';
  icon: IconName;
}

export function Toolbar({ app }: { app: AppController }) {
  const empty = app.state.doc.value.empty;
  const busy = app.blocked();
  // Busy: every action disabled except cancel (in the progress bar), D-005.
  const off = empty || busy;
  const view = app.state.view.value;
  const bar = useRef<HTMLDivElement>(null);
  const current = useRef<HTMLElement | null>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [, refit] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const layout = LAYOUTS[step]!;

  // Roving tabindex: exactly one enabled control of the bar is in the Tab order.
  useLayoutEffect(() => {
    const el = bar.current;
    if (!el) return;
    const controls = controlsOf(el);
    const active =
      current.current && controls.includes(current.current as HTMLButtonElement) ? current.current : controls[0];
    for (const c of barControls(el)) c.tabIndex = c === active ? 0 : -1;
  });

  // Narrow (QA-001): after every render (content can grow, e.g. the custom indent width field),
  // step down until the bar's content fits its width. `fit` re-renders after a shrink.
  useLayoutEffect(() => {
    const el = bar.current;
    if (el && el.scrollWidth > el.clientWidth + 1 && step < LAYOUTS.length - 1) setStep(step + 1);
  });

  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    let width = el.clientWidth;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      if (w > width)
        setStep(0); // wider: start again from the full toolbar
      else if (w < width) refit((n) => n + 1);
      width = w;
    });
    ro.observe(el);
    // web fonts change the widths once loaded
    void document.fonts?.ready.then(() => {
      setStep(0);
      refit((n) => n + 1);
    });
    return () => ro.disconnect();
  }, []);

  const move = (target: HTMLElement | undefined) => {
    const el = bar.current;
    if (!el || !target) return;
    for (const c of barControls(el)) c.tabIndex = c === target ? 0 : -1;
    current.current = target;
    target.focus();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const el = bar.current;
    if (!el) return;
    const controls = controlsOf(el);
    const i = controls.indexOf(e.target as HTMLButtonElement);
    if (i < 0) return;
    let next: HTMLElement | undefined;
    // the indent width field keeps Left/Right for its caret (Up/Down change its value)
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && e.target instanceof HTMLInputElement) return;
    if (e.key === 'ArrowRight') next = controls[(i + 1) % controls.length];
    else if (e.key === 'ArrowLeft') next = controls[(i - 1 + controls.length) % controls.length];
    else if (e.key === 'Home') next = controls[0];
    else if (e.key === 'End') next = controls[controls.length - 1];
    else return;
    e.preventDefault();
    move(next);
  };

  const onFocusIn = (e: FocusEvent) => {
    if (e.target instanceof HTMLElement && e.target !== bar.current && !e.target.closest('.tk-menu'))
      current.current = e.target;
  };

  // ---- overflow menu (COPY-action.more) ---------------------------------------------------

  const menuItems = () =>
    [...(menuRef.current?.querySelectorAll<HTMLElement>('.tk-menu__item, select') ?? [])].filter(
      (c) => !(c as HTMLButtonElement).disabled,
    );
  /** Anchors the menu under the More actions button, aligned to its inline end. */
  const place = () => {
    const b = moreRef.current?.getBoundingClientRect();
    const m = menuRef.current;
    if (!b || !m) return;
    m.style.setProperty('--tk-menu-top', `${b.bottom}px`);
    m.style.setProperty('--tk-menu-end', `${Math.max(0, window.innerWidth - b.right)}px`);
  };
  const closeMenu = () => {
    const m = menuRef.current;
    if (m?.matches(':popover-open')) m.hidePopover();
  };
  useEffect(() => {
    const m = menuRef.current;
    if (!m) return;
    const onToggle = (e: Event) => {
      const open = (e as ToggleEvent).newState === 'open';
      setMenuOpen(open);
      if (open) menuItems()[0]?.focus();
      // light dismiss or Escape with focus inside: back to the menu button
      else if (!document.activeElement || document.activeElement === document.body) moreRef.current?.focus();
    };
    m.addEventListener('toggle', onToggle);
    m.addEventListener('keydown', onMenuKeyDown);
    return () => {
      m.removeEventListener('toggle', onToggle);
      m.removeEventListener('keydown', onMenuKeyDown);
    };
  });
  // The menu closes when it is no longer needed (wider layout, busy).
  useEffect(() => {
    if (busy) closeMenu();
  }, [busy, step]);

  const onMoreKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const m = menuRef.current;
    if (!m) return;
    if (m.matches(':popover-open')) {
      const items = menuItems();
      (e.key === 'ArrowDown' ? items[0] : items[items.length - 1])?.focus();
      return;
    }
    place();
    m.showPopover();
  };

  const onMenuKeyDown = (e: KeyboardEvent) => {
    const items = menuItems();
    const i = items.indexOf(e.target as HTMLElement);
    // the custom width field keeps Up/Down for its value; the selector opens with Space/Enter
    const field = e.target instanceof HTMLInputElement;
    let next: HTMLElement | undefined;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeMenu();
      moreRef.current?.focus();
      return;
    }
    if (e.key === 'Tab') {
      // APG menu button: Tab closes the menu and moves on from the button
      closeMenu();
      moreRef.current?.focus();
      return;
    }
    if (field && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) return;
    if (e.key === 'ArrowDown') next = items[(i + 1) % items.length];
    else if (e.key === 'ArrowUp') next = items[(i - 1 + items.length) % items.length];
    else if (e.key === 'Home') next = items[0];
    else if (e.key === 'End') next = items[items.length - 1];
    else return;
    e.preventDefault();
    e.stopPropagation();
    next?.focus();
  };

  /** Runs a menu action: the menu closes and focus goes back to its button first (QA-013). */
  const fromMenu = (run: () => void) => () => {
    closeMenu();
    moreRef.current?.focus();
    run();
  };

  // ---- actions ------------------------------------------------------------------------------

  const action = (key: Exclude<Action, 'indent'>, spec: Spec, disabled: boolean, run: () => void, extra = '') => {
    const where = layout[key];
    if (where === 'menu') return null;
    return (
      <button
        type="button"
        class={`tk-button${where === 'icon' ? ' tk-button--icon' : ''}${extra}`}
        disabled={disabled}
        onClick={run}
      >
        <Icon name={spec.icon} />
        <span class={where === 'icon' ? 'tk-visually-hidden' : undefined}>{t(spec.copy)}</span>
      </button>
    );
  };
  const menuAction = (key: Exclude<Action, 'indent'>, spec: Spec, disabled: boolean, run: () => void, extra = '') =>
    layout[key] === 'menu' ? (
      <button type="button" class={`tk-menu__item${extra}`} tabIndex={-1} disabled={disabled} onClick={fromMenu(run)}>
        <Icon name={spec.icon} />
        {t(spec.copy)}
      </button>
    ) : null;

  const S = {
    open: { copy: 'action.open', icon: 'open' },
    clear: { copy: 'action.clear', icon: 'trash' },
    find: { copy: 'action.find', icon: 'search' },
    beautify: { copy: 'action.beautify', icon: 'beautify' },
    minify: { copy: 'action.minify', icon: 'minify' },
    reindent: { copy: 'action.reindent', icon: 'reindent' },
    copy: { copy: 'action.copy', icon: 'copy' },
    download: { copy: 'action.download', icon: 'download' },
  } satisfies Record<string, Spec>;

  const run = {
    open: () => void app.open(),
    clear: () => app.clear(),
    find: () => app.find.show(),
    beautify: () => void app.format('beautify'),
    minify: () => void app.format('minify'),
    // Implements: F-004.R1 — re-indent with the indent selector's style (CMP-Toolbar).
    reindent: () => void app.reindent(),
    copy: () => app.copy(),
    download: () => app.download(),
  };

  const load = [action('open', S.open, busy, run.open), action('clear', S.clear, off, run.clear)].filter(Boolean);
  const findBtn = action('find', S.find, off, run.find);
  const format = [
    action('beautify', S.beautify, off, run.beautify, ' tk-button--primary'),
    action('minify', S.minify, off, run.minify),
    action('reindent', S.reindent, off, run.reindent),
    layout.indent !== 'menu' ? <IndentSelector key="indent" app={app} disabled={off} /> : null,
  ].filter(Boolean);
  const exportGroup = [action('copy', S.copy, off, run.copy), action('download', S.download, off, run.download)].filter(
    Boolean,
  );
  const narrow = Object.values(layout).includes('menu');

  return (
    <header class="tk-header">
      <div
        ref={bar}
        class={narrow ? 'tk-toolbar tk-toolbar--narrow' : 'tk-toolbar'}
        role="toolbar"
        aria-label={t('label.toolbar')}
        data-layout={step}
        onKeyDown={onKeyDown}
        onFocusIn={onFocusIn}
      >
        {load.length > 0 && <div class="tk-toolbar__group">{load}</div>}
        {findBtn && <div class="tk-toolbar__group">{findBtn}</div>}
        {format.length > 0 && <div class="tk-toolbar__group">{format}</div>}
        {/* Implements: F-006.R1 — the view switch (COPY-label.view). */}
        <div class="tk-toolbar__group tk-toolbar__view" role="group" aria-label={t('label.view')}>
          <button
            type="button"
            class="tk-button"
            aria-pressed={view === 'text'}
            disabled={off}
            onClick={() => app.showTextView()}
          >
            {t('view.text')}
          </button>
          <button
            type="button"
            class="tk-button"
            aria-pressed={view === 'tree'}
            disabled={off}
            onClick={() => app.showTreeView()}
          >
            {t('view.tree')}
          </button>
        </div>
        <div class="tk-toolbar__group tk-toolbar__group--end">
          {exportGroup}
          {narrow && (
            <button
              ref={moreRef}
              type="button"
              class="tk-button tk-button--icon"
              aria-expanded={menuOpen ? 'true' : 'false'}
              aria-controls={MENU_ID}
              popovertarget={MENU_ID}
              disabled={busy}
              onClick={place}
              onKeyDown={onMoreKeyDown}
            >
              <Icon name="more" />
              <span class="tk-visually-hidden">{t('action.more')}</span>
            </button>
          )}
        </div>
        {narrow && (
          <div ref={menuRef} id={MENU_ID} class="tk-menu" popover="auto" role="group" aria-label={t('action.more')}>
            {menuAction('open', S.open, busy, run.open)}
            {menuAction('find', S.find, off, run.find)}
            <hr class="tk-menu__separator" />
            {menuAction('minify', S.minify, off, run.minify)}
            {menuAction('reindent', S.reindent, off, run.reindent)}
            {layout.indent === 'menu' && (
              <div class="tk-menu__field">
                <IndentSelector app={app} disabled={off} />
              </div>
            )}
            <hr class="tk-menu__separator" />
            {menuAction('copy', S.copy, off, run.copy)}
            {menuAction('download', S.download, off, run.download)}
            <hr class="tk-menu__separator" />
            {menuAction('clear', S.clear, off, run.clear, ' tk-menu__item--danger')}
          </div>
        )}
      </div>
    </header>
  );
}
