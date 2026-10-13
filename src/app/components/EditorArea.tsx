// Implements: CMP-Editor empty variant placeholder (the editor engine arrives with F-001, MOD-Editor).
import { t } from '../../copy';

export function EditorArea() {
  return (
    <section class="tk-editor" aria-label={t('label.editor')}>
      <div class="tk-editor__empty">
        <p class="tk-editor__empty-title">{t('empty.title')}</p>
        <p class="tk-editor__empty-body">{t('empty.body')}</p>
      </div>
    </section>
  );
}
