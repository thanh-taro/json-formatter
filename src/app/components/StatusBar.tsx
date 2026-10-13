// Implements: CMP-StatusBar (shell: empty state), F-009.R1 (privacy statement visible).
// The details popover (F-009.R2) arrives with F-009.
import { t } from '../../copy';

export function StatusBar() {
  return (
    <footer class="tk-statusbar">
      <span class="tk-statusbar__validity" role="status">
        {t('status.empty')}
      </span>
      <span class="tk-statusbar__facts">{t('status.cursor', { line: 1, column: 1 })}</span>
      <button
        type="button"
        class="tk-statusbar__privacy"
        aria-describedby="tk-privacy-label"
        data-testid="privacy-badge"
      >
        {t('privacy.badge')}
      </button>
      <span id="tk-privacy-label" class="tk-visually-hidden">
        {t('privacy.badge_label')}
      </span>
    </footer>
  );
}
