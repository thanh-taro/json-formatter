// MOD-App find orchestration for CMP-SearchPanel (F-010, architecture.md "Find (F-010)"): the
// panel's state in signals, on top of MOD-Editor's find engine.
import { signal } from '@preact/signals';
import type { EditorHandle, FindSession, FindStatus } from '../editor';

export class FindController {
  /** CMP-SearchPanel open (variant "closed" otherwise). */
  readonly open = signal(false);
  readonly term = signal('');
  readonly matchCase = signal(false);
  /** Count for the current term; null while the field is empty. */
  readonly status = signal<FindStatus | null>(null);
  /** Increases on every request to focus the field (open, or the shortcut while open). */
  readonly focusRequest = signal(0);
  private session: FindSession | null = null;

  constructor(private readonly editor: () => EditorHandle | null) {}

  /**
   * Implements: F-010.R1 — opens CMP-SearchPanel with its field focused (toolbar Find or the
   * platform find shortcut). F-010 edge case "tree shown → find opens in the text view": the text
   * view is the only view until F-006 adds the view switch, which must show the text view here.
   */
  show(): void {
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
      return;
    }
    const session = ed.find(term, { matchCase: this.matchCase.value });
    this.session = session;
    this.status.value = { current: null, total: 0, done: false };
    session.onCount((s) => {
      if (this.session === session) this.status.value = s;
    });
  }

  dispose(): void {
    this.session?.close();
    this.session = null;
  }
}
