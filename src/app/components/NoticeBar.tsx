// Implements: CMP-Notice bar placement (progress / info / error). At most one bar, newest wins,
// progress has priority; bars are live regions (errors assertive); dismiss with
// COPY-action.dismiss or Escape when focused. Toasts arrive with F-007.
import { t } from '../../copy';
import type { AppController } from '../controller';
import { Icon } from './Icon';

export function NoticeBar({ app }: { app: AppController }) {
  const busy = app.state.busy.value;
  const bar = app.state.bar.value;

  if (busy?.visible) {
    const percent = Math.floor(busy.fraction * 100);
    return (
      <div class="tk-notice-slot">
        <div class="tk-notice tk-notice--progress" role="status" data-notice-id={busy.label}>
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
        data-notice-id={bar.id}
        onKeyDown={onKeyDown}
      >
        <Icon name="alert" class="tk-notice__icon" />
        <span class="tk-notice__message">{bar.text}</span>
        {bar.offerOpen && (
          <button type="button" class="tk-button tk-button--outline" onClick={() => void app.open()} disabled={!!busy}>
            {t('action.open')}
          </button>
        )}
        <button type="button" class="tk-icon-button" aria-label={t('action.dismiss')} onClick={() => app.dismissBar()}>
          <Icon name="close" />
        </button>
      </div>
    </div>
  );
}
