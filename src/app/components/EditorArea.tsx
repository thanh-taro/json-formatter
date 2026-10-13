// Implements: CMP-Editor (host for MOD-Editor's shadow-root view) with its empty variant
// (COPY-empty.title, COPY-empty.body, COPY-action.open), CMP-DropOverlay and CMP-SearchPanel.
import { useEffect, useRef } from 'preact/hooks';
import { t } from '../../copy';
import type { AppController } from '../controller';
import { Icon } from './Icon';
import { SearchPanel } from './SearchPanel';

export function EditorArea({ app }: { app: AppController }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (host.current) app.attach(host.current);
  }, [app]);

  const doc = app.state.doc.value;
  const busy = !!app.state.busy.value;
  const dragging = app.state.dragging.value;

  return (
    <section class="tk-editor" aria-label={t('label.editor')}>
      {/* CMP-SearchPanel docked at the top of the editor when open (SCR-Formatter main area). */}
      <SearchPanel find={app.find} />
      <div ref={host} class="tk-editor-host" />
      {doc.empty && !busy && (
        <div class="tk-editor__empty">
          <Icon name="braces" class="tk-editor__empty-icon" />
          <p class="tk-editor__empty-title">{t('empty.title')}</p>
          <p class="tk-editor__empty-body">{t('empty.body')}</p>
          <button
            type="button"
            class="tk-button tk-button--outline tk-editor__empty-open"
            onClick={() => void app.open()}
          >
            <Icon name="open" />
            {t('action.open')}
          </button>
        </div>
      )}
      {/* Implements: CMP-DropOverlay — not focusable; the open action is the non-drag alternative. */}
      {dragging && (
        <div class="tk-drop-overlay" aria-hidden="true">
          <div class="tk-drop-overlay__panel">
            <Icon name="download" class="tk-drop-overlay__icon" />
            <span>{t('drop.hint')}</span>
          </div>
        </div>
      )}
    </section>
  );
}
