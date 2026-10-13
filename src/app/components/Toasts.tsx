// Implements: CMP-Notice toast placement (F-007.R1, COPY-toast.copied) — small confirmations at
// the bottom right, above the status bar; at most 2 stacked, each gone after 2 s (controller).
// The polite live region is always mounted (empty when there is no toast), so a toast's text
// is inserted into an existing region and announced (review m5). Never the only signal for
// errors (errors use the bar).
import type { AppController } from '../controller';
import { Icon } from './Icon';

export function Toasts({ app }: { app: AppController }) {
  const toasts = app.state.toasts.value;
  return (
    <div class="tk-toasts" aria-live="polite" aria-relevant="additions text">
      {toasts.map((toast) => (
        <div key={toast.seq} class="tk-toast" data-toast-id={toast.id}>
          <Icon name="check" class="tk-toast__icon" />
          <span>{toast.text}</span>
        </div>
      ))}
    </div>
  );
}
