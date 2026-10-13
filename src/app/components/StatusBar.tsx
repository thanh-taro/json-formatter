// Implements: CMP-StatusBar (shell: empty state), F-009.R1 (privacy statement visible).
// The details popover (F-009.R2) arrives with F-009; validity, size and lines with F-005.
import { t } from '../../copy';

interface Props {
  empty: boolean;
  cursor: { line: number; column: number };
}

export function StatusBar({ empty, cursor }: Props) {
  return (
    <footer class="tk-statusbar">
      <span class="tk-statusbar__validity" role="status">
        {empty ? t('status.empty') : ''}
      </span>
      <span class="tk-statusbar__facts">{t('status.cursor', cursor)}</span>
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
