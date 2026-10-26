// Implements: CMP-Notice toast placement (F-007.R1, COPY-toast.copied) — small confirmations at
// the bottom right, above the status bar; at most 2 stacked, each gone after 2 s (controller).
// The polite live region is always mounted (empty when there is no toast), so a toast's text
// is inserted into an existing region and announced (review m5). Never the only signal for
// errors (errors use the bar). Implements: F-012.R2 — the text is rendered from the COPY ID.
import { t } from '../../copy';
import type { AppController } from '../controller';
import { Icon } from './Icon';
import { useQuietAfterSwitch } from './quiet';

export function Toasts({ app }: { app: AppController }) {
  const toasts = app.state.toasts.value;
  // F-012: toasts re-rendered after a language switch are not announced again.
  const quiet = useQuietAfterSwitch(toasts.at(-1)?.seq);
  return (
    <div class="tk-toasts" aria-live={quiet ? 'off' : 'polite'} aria-relevant="additions text">
      {toasts.map((toast) => (
        <div key={toast.seq} class="tk-toast" data-toast-id={toast.id}>
          <Icon name="check" class="tk-toast__icon" />
          <span>{t(toast.id)}</span>
        </div>
      ))}
    </div>
  );
}
