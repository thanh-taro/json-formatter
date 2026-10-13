// Implements: CMP-SearchPanel (F-010) — docked at the top of CMP-Editor: field
// (COPY-search.placeholder), match case toggle (COPY-search.match_case, a pressed button), count
// (COPY-search.count / COPY-search.counting / COPY-search.none, a polite live region), previous
// (COPY-action.find_prev), next (COPY-action.find_next), close (COPY-action.close). Enter moves to
// the next match, Shift+Enter to the previous, Escape closes and returns focus to the editor.
// Narrow: match case and count move under the field (container width < 600 px).
import { useEffect, useRef } from 'preact/hooks';
import { formatCount, t } from '../../copy';
import type { FindStatus } from '../../editor';
import type { FindController } from '../find';
import { Icon } from './Icon';

/** The count text for a status; empty while the first match is not known yet. */
export function countText(status: FindStatus | null): string {
  if (!status) return '';
  if (status.done && status.total === 0) return t('search.none');
  if (status.current === null) return '';
  const params = { current: formatCount(status.current), total: formatCount(status.total) };
  return status.done ? t('search.count', params) : t('search.counting', params);
}

export function SearchPanel({ find }: { find: FindController }) {
  const field = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const open = find.open.value;
  const focusRequest = find.focusRequest.value;
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, [focusRequest]);

  // Panel-wide keys (from the field and every button): Escape closes, the platform find shortcut
  // goes back to the field instead of the browser's find.
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        find.close();
      } else if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        find.show();
      }
    };
    el.addEventListener('keydown', onKeyDown);
    return () => el.removeEventListener('keydown', onKeyDown);
  }, [find, open]);

  if (!open) return null;
  const status = find.status.value;
  const none = !!status && status.done && status.total === 0;
  const canMove = !!status && status.total > 0;
  const onFieldKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    if (e.shiftKey) find.previous();
    else find.next();
  };

  return (
    <div ref={panel} class="tk-search">
      <div class="tk-search__bar" role="search">
        <input
          ref={field}
          type="search"
          class="tk-search__field"
          aria-label={t('search.placeholder')}
          placeholder={t('search.placeholder')}
          aria-invalid={none ? 'true' : undefined}
          autocomplete="off"
          spellcheck={false}
          value={find.term.value}
          onInput={(e) => find.setTerm(e.currentTarget.value)}
          onKeyDown={onFieldKeyDown}
        />
        <button
          type="button"
          class="tk-search__toggle"
          aria-pressed={find.matchCase.value ? 'true' : 'false'}
          aria-label={t('search.match_case')}
          title={t('search.match_case')}
          onClick={() => find.toggleMatchCase()}
        >
          <Icon name="case-sensitive" />
        </button>
        <span class={none ? 'tk-search__count tk-search__count--none' : 'tk-search__count'} role="status">
          {countText(status)}
        </span>
        <button
          type="button"
          class="tk-search__button tk-search__prev"
          aria-label={t('action.find_prev')}
          title={t('action.find_prev')}
          disabled={!canMove}
          onClick={() => find.previous()}
        >
          <Icon name="chevron-up" />
        </button>
        <button
          type="button"
          class="tk-search__button tk-search__next"
          aria-label={t('action.find_next')}
          title={t('action.find_next')}
          disabled={!canMove}
          onClick={() => find.next()}
        >
          <Icon name="chevron-down" />
        </button>
        <button
          type="button"
          class="tk-search__button tk-search__close"
          aria-label={t('action.close')}
          title={t('action.close')}
          onClick={() => find.close()}
        >
          <Icon name="x" />
        </button>
      </div>
    </div>
  );
}
