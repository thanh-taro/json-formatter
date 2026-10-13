// MOD-App find orchestration for CMP-SearchPanel (F-010, architecture.md "Find (F-010)"): the
// panel's state in signals, on top of MOD-Editor's find engine.
import { signal } from '@preact/signals';
import { formatCount, t } from '../copy';
import type { EditorHandle, FindSession, FindStatus } from '../editor';

/** The count text for a status (COPY-search.count / .counting / .none); empty while unknown. */
export function countText(status: FindStatus | null): string {
  if (!status) return '';
  if (status.done && status.total === 0) return t('search.none');
  if (status.current === null) return '';
  const params = { current: formatCount(status.current), total: formatCount(status.total) };
  return status.done ? t('search.count', params) : t('search.counting', params);
}

export class FindController {
  /** CMP-SearchPanel open (variant "closed" otherwise). */
  readonly open = signal(false);
  readonly term = signal('');
  readonly matchCase = signal(false);
  /** Count for the current term; null while the field is empty. */
  readonly status = signal<FindStatus | null>(null);
  /** Increases on every request to focus the field (open, or the shortcut while open). */
  readonly focusRequest = signal(0);
  /**
   * Text of the polite live region (NFR-06): changes only when a count becomes final and on
   * navigation afterwards, not on every counting slice (review F-010 m3).
   */
  readonly announcement = signal('');
  private session: FindSession | null = null;

  /**
   * @param showTextView switches the main area to the text view (F-010 edge case: find while the
   * tree is shown opens in the text view; F-006 wires the switch).
   */
  constructor(
    private readonly editor: () => EditorHandle | null,
    private readonly showTextView: () => void,
  ) {}

  /**
   * Implements: F-010.R1 — opens CMP-SearchPanel with its field focused (toolbar Find or the
   * platform find shortcut). F-010 edge case: when the tree is shown, find opens in the text view.
   */
  show(): void {
    this.showTextView();
    const reopened = !this.open.value;
    this.open.value = true;
    this.focusRequest.value++;
    if (reopened && this.term.value) this.search();
  }

  /** Implements: F-010.R1 — closes the panel; focus returns to the editor (CMP-SearchPanel). */
  close(): void {
    this.session?.close();
    this.session = null;
    this.status.value = null;
    this.announcement.value = '';
    this.open.value = false;
    this.editor()?.focus();
  }

  setTerm(term: string): void {
    this.term.value = term;
    this.search();
  }

  /** Implements: F-010.R5 — match case on/off. */
  toggleMatchCase(): void {
    this.matchCase.value = !this.matchCase.value;
    this.search();
  }

  /** Implements: F-010.R3 */
  next(): void {
    this.session?.next();
  }
  previous(): void {
    this.session?.previous();
  }

  /** Implements: F-010.R2, F-010.R6 — a new search from the cursor for the current term. */
  private search(): void {
    this.session?.close();
    this.session = null;
    const ed = this.editor();
    const term = this.term.value;
    if (!ed || !term) {
      this.status.value = null;
      this.announcement.value = '';
      return;
    }
    // The previous count stays shown until the new search knows its first match (review m2).
    const session = ed.find(term, { matchCase: this.matchCase.value });
    this.session = session;
    session.onCount((s) => {
      if (this.session !== session) return;
      this.status.value = s;
      if (s.done) this.announcement.value = countText(s);
    });
  }

  dispose(): void {
    this.session?.close();
    this.session = null;
  }
}
