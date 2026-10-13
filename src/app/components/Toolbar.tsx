// Implements: CMP-Toolbar — load group wired (F-001: COPY-action.open, COPY-action.clear);
// "empty document" and "busy" states. The other actions arrive with F-002…F-010.
import { t } from '../../copy';
import type { AppController } from '../controller';
import { Icon } from './Icon';

export function Toolbar({ app }: { app: AppController }) {
  const empty = app.state.doc.value.empty;
  const busy = !!app.state.busy.value;
  // Busy: every action disabled except cancel (in the progress bar), D-005.
  const off = empty || busy;
  return (
    <div class="tk-toolbar" role="toolbar" aria-label={t('label.toolbar')}>
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
