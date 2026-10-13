// Implements: CMP-Toolbar (shell: groups and the empty-document state; actions arrive with F-001…F-007).
import { t } from '../../copy';

interface Props {
  /** Empty document: everything but Open is disabled (CMP-Toolbar "empty document"). */
  empty: boolean;
}

export function Toolbar({ empty }: Props) {
  return (
    <div class="tk-toolbar" role="toolbar" aria-label={t('label.toolbar')}>
      <div class="tk-toolbar__group">
        <button type="button" class="tk-button">
          {t('action.open')}
        </button>
        <button type="button" class="tk-button" disabled={empty}>
          {t('action.clear')}
        </button>
      </div>
      <div class="tk-toolbar__group">
        <button type="button" class="tk-button" disabled={empty}>
          {t('action.find')}
        </button>
      </div>
      <div class="tk-toolbar__group">
        <button type="button" class="tk-button" disabled={empty}>
          {t('action.beautify')}
        </button>
        <button type="button" class="tk-button" disabled={empty}>
          {t('action.minify')}
        </button>
        <button type="button" class="tk-button" disabled={empty}>
          {t('action.reindent')}
        </button>
        <label class="tk-select">
          <span class="tk-visually-hidden">{t('label.indent')}</span>
          <select disabled={empty}>
            <option value="2">{t('indent.spaces2')}</option>
            <option value="4">{t('indent.spaces4')}</option>
            <option value="tab">{t('indent.tab')}</option>
          </select>
        </label>
      </div>
      <div class="tk-toolbar__group" role="group" aria-label={t('label.view')}>
        <button type="button" class="tk-button" aria-pressed="true" disabled={empty}>
          {t('view.text')}
        </button>
        <button type="button" class="tk-button" aria-pressed="false" disabled={empty}>
          {t('view.tree')}
        </button>
      </div>
      <div class="tk-toolbar__group tk-toolbar__group--end">
        <button type="button" class="tk-button" disabled={empty}>
          {t('action.copy')}
        </button>
        <button type="button" class="tk-button" disabled={empty}>
          {t('action.download')}
        </button>
      </div>
    </div>
  );
}
