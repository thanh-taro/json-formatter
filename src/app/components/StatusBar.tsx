// Implements: CMP-StatusBar (shell: empty state; privacy statement and details),
// F-009.R1 (privacy statement always visible), F-009.R2 (details popover, dismissible),
// F-009 edge case "narrow" (icon labelled COPY-privacy.badge_label).
// Validity, size/lines and cursor facts arrive with F-001/F-005.
import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../../copy';
import { Icon } from './Icon';

const DETAILS_ID = 'tk-privacy-details';
const LABEL_ID = 'tk-privacy-label';
const TITLE_ID = 'tk-privacy-title';

export function StatusBar() {
  return (
    <footer class="tk-statusbar">
      <span class="tk-statusbar__validity" role="status">
        {t('status.empty')}
      </span>
      <span class="tk-statusbar__facts">{t('status.cursor', { line: 1, column: 1 })}</span>
      <PrivacyStatement />
    </footer>
  );
}

/** COPY-privacy.badge with its details in a native popover (platform-mapping: `popover`). */
function PrivacyStatement() {
  const details = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const el = details.current;
    if (!el) return;
    const onToggle = (e: Event) => setOpen((e as ToggleEvent).newState === 'open');
    el.addEventListener('toggle', onToggle);
    return () => el.removeEventListener('toggle', onToggle);
  }, []);

  return (
    <>
      <button
        type="button"
        class="tk-statusbar__privacy"
        popovertarget={DETAILS_ID}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={DETAILS_ID}
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
      <div ref={details} id={DETAILS_ID} class="tk-privacy" popover="auto" role="dialog" aria-labelledby={TITLE_ID}>
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
