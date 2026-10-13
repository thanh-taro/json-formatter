// Implements: CMP-StatusBar (empty state, cursor; privacy statement and details),
// F-009.R1 (privacy statement always visible), F-009.R2 (details popover, dismissible),
// F-009 edge case "narrow" (icon labelled COPY-privacy.badge_label).
// Validity, size and lines arrive with F-005.
import type { Signal } from '@preact/signals';
import { t } from '../../copy';
import type { DocState } from '../state';
import { Icon } from './Icon';

const DETAILS_ID = 'tk-privacy-details';
const LABEL_ID = 'tk-privacy-label';
const TITLE_ID = 'tk-privacy-title';

interface Props {
  doc: Signal<DocState>;
  cursor: Signal<{ line: number; column: number }>;
}

export function StatusBar({ doc, cursor }: Props) {
  return (
    <footer class="tk-statusbar">
      <span class="tk-statusbar__validity" role="status">
        {doc.value.empty ? t('status.empty') : ''}
      </span>
      <span class="tk-statusbar__facts">{t('status.cursor', cursor.value)}</span>
      <PrivacyStatement />
    </footer>
  );
}

/**
 * COPY-privacy.badge with its details in a native popover (platform-mapping: `popover`). The
 * browser owns open/close, Escape, light dismiss, focus return and the invoker's expanded state.
 */
function PrivacyStatement() {
  return (
    <>
      <button
        type="button"
        class="tk-statusbar__privacy"
        popovertarget={DETAILS_ID}
        aria-haspopup="dialog"
        aria-describedby={LABEL_ID}
        data-testid="privacy-badge"
      >
        <Icon name="shield-check" />
        <span class="tk-statusbar__privacy-text">{t('privacy.badge')}</span>
        <span class="tk-statusbar__privacy-icon-label tk-visually-hidden">{t('privacy.badge_label')}</span>
      </button>
      <span id={LABEL_ID} class="tk-visually-hidden">
        {t('privacy.badge_label')}
      </span>
      <div id={DETAILS_ID} class="tk-privacy" popover="auto" role="dialog" aria-labelledby={TITLE_ID}>
        <div class="tk-privacy__header">
          <Icon name="shield-check" class="tk-privacy__icon" />
          <span id={TITLE_ID} class="tk-privacy__title">
            {t('privacy.badge_label')}
          </span>
          <button type="button" class="tk-icon-button" popovertarget={DETAILS_ID} popovertargetaction="hide">
            <Icon name="x" />
            <span class="tk-visually-hidden">{t('action.close')}</span>
          </button>
        </div>
        <p class="tk-privacy__body">{t('privacy.details')}</p>
      </div>
    </>
  );
}
