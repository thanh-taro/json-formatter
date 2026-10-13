// Implements: CMP-Toolbar — load group wired (F-001: COPY-action.open, COPY-action.clear);
// "empty document" and "busy" states; toolbar keyboard model (WAI-ARIA APG: one Tab stop,
// Left/Right arrows move between enabled controls, Home/End go to the first/last). The other
// actions arrive with F-002…F-010.
import { useLayoutEffect, useRef } from 'preact/hooks';
import { t } from '../../copy';
import type { AppController } from '../controller';
import { Icon } from './Icon';

const controlsOf = (bar: HTMLElement) =>
  [...bar.querySelectorAll<HTMLButtonElement | HTMLSelectElement>('button, select')].filter((c) => !c.disabled);

export function Toolbar({ app }: { app: AppController }) {
  const empty = app.state.doc.value.empty;
  const busy = app.blocked();
  // Busy: every action disabled except cancel (in the progress bar), D-005.
  const off = empty || busy;
  const bar = useRef<HTMLDivElement>(null);
  const current = useRef<HTMLElement | null>(null);

  // Roving tabindex: exactly one enabled control is in the Tab order.
  useLayoutEffect(() => {
    const el = bar.current;
    if (!el) return;
    const controls = controlsOf(el);
    const active =
      current.current && controls.includes(current.current as HTMLButtonElement) ? current.current : controls[0];
    for (const c of el.querySelectorAll<HTMLElement>('button, select')) c.tabIndex = c === active ? 0 : -1;
  });

  const move = (target: HTMLElement | undefined) => {
    const el = bar.current;
    if (!el || !target) return;
    for (const c of el.querySelectorAll<HTMLElement>('button, select')) c.tabIndex = c === target ? 0 : -1;
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
    if (e.key === 'ArrowRight') next = controls[(i + 1) % controls.length];
    else if (e.key === 'ArrowLeft') next = controls[(i - 1 + controls.length) % controls.length];
    else if (e.key === 'Home') next = controls[0];
    else if (e.key === 'End') next = controls[controls.length - 1];
    else return;
    e.preventDefault();
    move(next);
  };

  const onFocusIn = (e: FocusEvent) => {
    if (e.target instanceof HTMLElement && e.target !== bar.current) current.current = e.target;
  };

  return (
    <div
      ref={bar}
      class="tk-toolbar"
      role="toolbar"
      aria-label={t('label.toolbar')}
      onKeyDown={onKeyDown}
      onFocusIn={onFocusIn}
    >
      <div class="tk-toolbar__group">
        <button type="button" class="tk-button" disabled={busy} onClick={() => void app.open()}>
          <Icon name="open" />
          {t('action.open')}
        </button>
        <button type="button" class="tk-button" disabled={off} onClick={() => app.clear()}>
          <Icon name="trash" />
          {t('action.clear')}
        </button>
      </div>
      <div class="tk-toolbar__group">
        <button type="button" class="tk-button" disabled={off}>
          {t('action.find')}
        </button>
      </div>
      <div class="tk-toolbar__group">
        <button type="button" class="tk-button" disabled={off}>
          {t('action.beautify')}
        </button>
        <button type="button" class="tk-button" disabled={off}>
          {t('action.minify')}
        </button>
        <button type="button" class="tk-button" disabled={off}>
          {t('action.reindent')}
        </button>
        <label class="tk-select">
          <span class="tk-visually-hidden">{t('label.indent')}</span>
          <select disabled={off}>
            <option value="2">{t('indent.spaces2')}</option>
            <option value="4">{t('indent.spaces4')}</option>
            <option value="tab">{t('indent.tab')}</option>
          </select>
        </label>
      </div>
      <div class="tk-toolbar__group" role="group" aria-label={t('label.view')}>
        <button type="button" class="tk-button" aria-pressed="true" disabled={off}>
          {t('view.text')}
        </button>
        <button type="button" class="tk-button" aria-pressed="false" disabled={off}>
          {t('view.tree')}
        </button>
      </div>
      <div class="tk-toolbar__group tk-toolbar__group--end">
        <button type="button" class="tk-button" disabled={off}>
          {t('action.copy')}
        </button>
        <button type="button" class="tk-button" disabled={off}>
          {t('action.download')}
        </button>
      </div>
    </div>
  );
}
