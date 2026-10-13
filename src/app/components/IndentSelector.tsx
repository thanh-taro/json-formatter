// Implements: CMP-Toolbar indent selector (RULE-01, F-002.R2) — COPY-label.indent with the options
// COPY-indent.spaces2 (default), COPY-indent.spaces4, COPY-indent.tab and COPY-indent.custom; the
// custom choice shows a number field for 1–8 spaces. One selector serves beautify and re-indent
// (CMP-Toolbar "Behavior"); the choice lives in app state (`state.indent`).
import { useState } from 'preact/hooks';
import { MAX_CUSTOM_WIDTH, MIN_CUSTOM_WIDTH, type IndentStyle } from '../../core';
import { t } from '../../copy';
import type { AppController } from '../controller';

/** Custom width offered first (CMP-Toolbar design: "Custom… (3 spaces)"). */
const FIRST_CUSTOM = 3;

/** True when a style is only reachable through the custom choice (not 2 or 4 spaces, not tab). */
const isCustom = (s: IndentStyle) => s.kind === 'spaces' && s.width !== 2 && s.width !== 4;

export function IndentSelector({ app, disabled }: { app: AppController; disabled: boolean }) {
  const indent = app.state.indent.value;
  // The choice is derived from app state, so it survives remounts (narrow overflow menu).
  const [customPicked, setCustomPicked] = useState(false);
  const custom = isCustom(indent) || (customPicked && indent.kind === 'spaces');
  const [lastWidth, setWidth] = useState(FIRST_CUSTOM);
  const width = isCustom(indent) && indent.kind === 'spaces' ? indent.width : lastWidth;
  const value = custom ? 'custom' : indent.kind === 'tab' ? 'tab' : String(indent.width);

  const choose = (v: string) => {
    setCustomPicked(v === 'custom');
    if (v === 'tab') app.setIndent({ kind: 'tab' });
    else app.setIndent({ kind: 'spaces', width: v === 'custom' ? width : Number(v) });
  };
  const setCustomWidth = (raw: string) => {
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n) || raw.trim() === '') return;
    const w = Math.min(MAX_CUSTOM_WIDTH, Math.max(MIN_CUSTOM_WIDTH, n));
    setWidth(w);
    app.setIndent({ kind: 'spaces', width: w });
  };

  return (
    <>
      <label class="tk-select">
        <span class="tk-visually-hidden">{t('label.indent')}</span>
        <select
          value={value}
          disabled={disabled}
          data-indent={value}
          onChange={(e) => choose((e.currentTarget as HTMLSelectElement).value)}
        >
          <option value="2">{t('indent.spaces2')}</option>
          <option value="4">{t('indent.spaces4')}</option>
          <option value="tab">{t('indent.tab')}</option>
          <option value="custom">{t('indent.custom', { n: width })}</option>
        </select>
      </label>
      {custom && (
        <input
          class="tk-indent-width"
          // CMP-Toolbar roving tabindex: reached with the arrow keys, not an extra Tab stop
          tabIndex={-1}
          type="number"
          inputMode="numeric"
          min={MIN_CUSTOM_WIDTH}
          max={MAX_CUSTOM_WIDTH}
          step={1}
          value={width}
          disabled={disabled}
          aria-label={t('indent.custom', { n: width })}
          onChange={(e) => {
            const el = e.currentTarget as HTMLInputElement;
            setCustomWidth(el.value);
            el.value = String(Math.min(MAX_CUSTOM_WIDTH, Math.max(MIN_CUSTOM_WIDTH, Number(el.value) || width)));
          }}
          onInput={(e) => setCustomWidth((e.currentTarget as HTMLInputElement).value)}
        />
      )}
    </>
  );
}
