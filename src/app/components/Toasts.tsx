// Implements: CMP-Notice toast placement (F-007.R1, COPY-toast.copied) — small confirmations at
// the bottom right, above the status bar; at most 2 stacked, each gone after 2 s (controller).
// Polite live regions; never the only signal for errors (errors use the bar).
import type { AppController } from '../controller';
import { Icon } from './Icon';

export function Toasts({ app }: { app: AppController }) {
  const toasts = app.state.toasts.value;
  if (!toasts.length) return null;
  return (
    <div class="tk-toasts">
      {toasts.map((toast) => (
        <div key={toast.seq} class="tk-toast" role="status" data-toast-id={toast.id}>
          <Icon name="check" class="tk-toast__icon" />
          <span>{toast.text}</span>
        </div>
      ))}
    </div>
  );
}
