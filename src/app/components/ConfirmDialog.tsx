// Implements: CMP-ConfirmDialog (RULE-02 very-large confirmation, F-001.AC5, F-001.AC11).
// Native modal <dialog>: focus trapped, Escape cancels, Cancel has default focus, focus returns
// to the control that triggered it; nothing changes until Continue.
import { useEffect, useRef } from 'preact/hooks';
import { formatSize, t } from '../../copy';
import type { AppController } from '../controller';

export function ConfirmDialog({ app }: { app: AppController }) {
  const confirm = app.state.confirm.value;
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const answerRef = useRef<(proceed: boolean) => void>(() => undefined);

  useEffect(() => {
    const dialog = ref.current;
    if (!confirm || !dialog) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let answered = false;
    const answer = (proceed: boolean) => {
      if (answered) return;
      answered = true;
      if (dialog.open) dialog.close();
      confirm.answer(proceed);
      trigger?.focus();
    };
    const onCancel = (e: Event) => {
      e.preventDefault();
      answer(false);
    };
    dialog.addEventListener('cancel', onCancel);
    answerRef.current = answer;
    dialog.showModal();
    cancelRef.current?.focus();
    return () => {
      dialog.removeEventListener('cancel', onCancel);
      if (dialog.open) dialog.close();
    };
  }, [confirm]);

  if (!confirm) return null;
  const answer = (proceed: boolean) => answerRef.current(proceed);
  return (
    <dialog ref={ref} class="tk-dialog" aria-labelledby="tk-confirm-title" aria-describedby="tk-confirm-message">
      <h2 id="tk-confirm-title" class="tk-dialog__title">
        {t('confirm.title')}
      </h2>
      <p id="tk-confirm-message" class="tk-dialog__message">
        {t('confirm.very_large', { size: formatSize(confirm.bytes) })}
      </p>
      <div class="tk-dialog__actions">
        <button ref={cancelRef} type="button" class="tk-button tk-button--outline" onClick={() => answer(false)}>
          {t('action.cancel')}
        </button>
        <button type="button" class="tk-button tk-button--primary" onClick={() => answer(true)}>
          {t('action.continue')}
        </button>
      </div>
    </dialog>
  );
}
