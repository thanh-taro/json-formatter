// Implements: CMP-StatusBar — validity indicator (F-005.R2: valid / valid with warnings /
// invalid with jump to the error / checking / empty), size and line count (F-005.R6), cursor
// position, privacy statement and details (F-009.R1, F-009.R2); narrow variant: cursor hidden,
// COPY-status.size_lines_short, privacy statement as its icon (COPY-privacy.badge_label).
// Validity changes are announced through one polite status region (SCR-Formatter). The privacy
// details link to the open-source notices (F-009 UX notes, COPY-privacy.notices). The source
// link follows the privacy statement (F-009.R3, D-033).
import { useLayoutEffect, useRef } from 'preact/hooks';
import { formatCount, formatSize, t, tCount } from '../../copy';
import type { AppController } from '../controller';
import { validityText } from '../controller';
import { Icon } from './Icon';
import { useQuietAfterSwitch } from './quiet';

/** The source repository (F-009.R3). */
export const SOURCE_URL = 'https://github.com/thanh-taro/json-formatter';

const DETAILS_ID = 'tk-privacy-details';
const LABEL_ID = 'tk-privacy-label';
const TITLE_ID = 'tk-privacy-title';

export function StatusBar({ app }: { app: AppController }) {
  const { doc, cursor } = app.state;
  const size = formatSize(doc.value.bytes);
  const footer = useRef<HTMLElement>(null);
  const said = app.state.announcement.value;
  // F-012 UX notes (review F-012 MINOR-3): rendered in the active language, silent after a switch.
  const quiet = useQuietAfterSwitch(said.seq);
  // CMP-StatusBar narrow (F-012.AC11): the bar may wrap onto two rows; its measured height is
  // published as --tk-statusbar-block so toasts and the privacy details stay clear of it.
  useLayoutEffect(() => {
    const el = footer.current;
    const host = el?.closest<HTMLElement>('.tk-formatter');
    if (!el || !host) return;
    const publish = () => host.style.setProperty('--tk-statusbar-block', `${el.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      host.style.removeProperty('--tk-statusbar-block');
    };
  }, []);
  return (
    <footer ref={footer} class="tk-statusbar">
      <Validity app={app} />
      <span class="tk-statusbar__size">{tCount('status.size_lines', doc.value.lines, size)}</span>
      <span class="tk-statusbar__size-short">{tCount('status.size_lines_short', doc.value.lines, size)}</span>
      {/* QA-005: the cursor position belongs to the text view (tree boards show none). */}
      {app.state.view.value === 'text' && (
        <span class="tk-statusbar__cursor">
          {t('status.cursor', { line: formatCount(cursor.value.line), column: formatCount(cursor.value.column) })}
        </span>
      )}
      <span class="tk-visually-hidden" role="status" aria-live={quiet ? 'off' : undefined}>
        {said.text()}
      </span>
      <PrivacyStatement />
      <SourceLink />
    </footer>
  );
}

/** Implements: F-005.R2, CMP-StatusBar "valid / invalid / checking / empty"; invalid jumps (F-005.R5). */
function Validity({ app }: { app: AppController }) {
  const v = app.state.validation.value;
  const text = validityText(v);
  const error = v.state === 'invalid' ? v.result?.issues[0] : undefined;
  return (
    <span class="tk-statusbar__validity" data-validity={v.state}>
      {error ? (
        <button type="button" class="tk-statusbar__jump" onClick={() => app.jumpTo(0)}>
          <span class="tk-statusbar__dot" aria-hidden="true" />
          {text}
        </button>
      ) : (
        <>
          <span class="tk-statusbar__dot" aria-hidden="true" />
          {text}
        </>
      )}
    </span>
  );
}

/**
 * Implements: F-009.R3 — link to the source repository: the GitHub mark (D-034), then
 * COPY-privacy.source (D-035), which hides at narrow widths. Named and titled
 * COPY-privacy.source_label, which contains the visible text. New tab without opener or
 * referrer (platform-mapping); the document is untouched.
 */
function SourceLink() {
  const label = t('privacy.source_label');
  return (
    <a
      class="tk-statusbar__source"
      href={SOURCE_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      data-testid="source-link"
    >
      <Icon name="github" />
      <span class="tk-statusbar__source-text">{t('privacy.source')}</span>
    </a>
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
        {/* QA-021: the licence notices shipped with the tool (COPY-privacy.notices). */}
        <a class="tk-privacy__link" href="/third-party-notices.txt" target="_blank" rel="noopener noreferrer">
          {t('privacy.notices')}
        </a>
      </div>
    </>
  );
}
