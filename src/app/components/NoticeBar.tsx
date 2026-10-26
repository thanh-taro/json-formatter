// Implements: CMP-Notice bar placement (progress / info / error). At most one bar, newest wins,
// progress has priority; bars are live regions (errors assertive); dismiss with
// COPY-action.dismiss or Escape when focused. Toasts: Toasts.tsx (F-007).
// Implements: F-012.R2 / F-012.AC15 — texts are rendered from COPY IDs and raw values when shown,
// so a language switch re-translates the progress text and the bar in place.
import { t } from '../../copy';
import type { AppController } from '../controller';
import { barText } from '../state';
import { Icon } from './Icon';
import { useQuietAfterSwitch } from './quiet';

export function NoticeBar({ app }: { app: AppController }) {
  const busy = app.state.busy.value;
  const bar = app.state.bar.value;
  // F-012: a language switch re-renders the shown message without announcing it again.
  const quiet = useQuietAfterSwitch(busy?.visible ? busy.cancel : bar?.seq);
  const live = quiet ? 'off' : undefined;

  if (busy?.visible) {
    const percent = Math.floor(busy.fraction * 100);
    return (
      <div class="tk-notice-slot">
        <div class="tk-notice tk-notice--progress" role="status" aria-live={live} data-notice-id={busy.label}>
          <span id="tk-progress-label" class="tk-notice__progress-label">
            {t(busy.label, { percent })}
          </span>
          <span
            class="tk-notice__track"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-labelledby="tk-progress-label"
          >
            <span class="tk-notice__fill" style={{ inlineSize: `${percent}%` }} />
          </span>
          <span class="tk-notice__spacer" />
          <button type="button" class="tk-button tk-button--outline" onClick={() => app.cancel()}>
            {t('action.cancel')}
          </button>
        </div>
      </div>
    );
  }

  if (!bar) return <div class="tk-notice-slot" />;
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') app.dismissBar();
  };
  return (
    <div class="tk-notice-slot">
      <div
        key={bar.seq}
        class={`tk-notice tk-notice--${bar.kind}`}
        role={bar.kind === 'error' ? 'alert' : 'status'}
        aria-live={live}
        data-notice-id={bar.id}
        data-notice-seq={bar.seq}
        onKeyDown={onKeyDown}
      >
        <Icon name="alert" class="tk-notice__icon" />
        <span class="tk-notice__message">{barText(bar)}</span>
        {bar.offerOpen && (
          <button type="button" class="tk-button tk-button--outline" onClick={() => void app.open()} disabled={!!busy}>
            {t('action.open')}
          </button>
        )}
        <button type="button" class="tk-icon-button" aria-label={t('action.dismiss')} onClick={() => app.dismissBar()}>
          <Icon name="x" />
        </button>
      </div>
    </div>
  );
}
