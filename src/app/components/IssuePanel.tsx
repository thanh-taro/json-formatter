// Implements: CMP-IssuePanel — shown when there are issues (SCR-Formatter region 4): tabs
// COPY-issue.tab_problems / COPY-issue.tab_warnings, the error (F-005.R3) or up to 1,000
// warnings (F-005.R4) with severity, hint, location and code, the overflow line COPY-issue.more,
// collapse/expand (collapsed by default when there are only warnings, FLOW-02 step 3), and jump
// to an issue's position on activation (F-005.R5). While re-checking, the listed result is the
// previous one, marked out of date (INV-05, aria-busy).
import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import type { Issue } from '../../core';
import { formatCount, hintFor, t, tCount } from '../../copy';
import { locationOf, type AppController } from '../controller';
import { Icon } from './Icon';

type Tab = 'problems' | 'warnings';
type Kind = 'error' | 'warnings';

interface PanelUi {
  /** The result kind the choices below were made for; a new kind resets them. */
  kind: Kind;
  expanded: boolean;
  tab: Tab;
}

const defaults = (kind: Kind): PanelUi => ({
  kind,
  expanded: kind === 'error',
  tab: kind === 'error' ? 'problems' : 'warnings',
});

const TAB_ID: Record<Tab, string> = { problems: 'tk-issues-tab-problems', warnings: 'tk-issues-tab-warnings' };
const PANEL_ID = 'tk-issues-panel';

export function IssuePanel({ app }: { app: AppController }) {
  const v = app.state.validation.value;
  const result = v.state === 'empty' ? null : v.result;
  const issues = result?.issues ?? [];
  const kind: Kind = result?.validity === 'invalid' ? 'error' : 'warnings';
  const [stored, setUi] = useState<PanelUi>(defaults(kind));
  if (!result || issues.length === 0) return <div class="tk-issues-slot" />;

  const ui = stored.kind === kind ? stored : defaults(kind);
  const update = (change: Partial<PanelUi>) => setUi({ ...ui, ...change });
  const errors = kind === 'error' ? issues : [];
  const warnings = kind === 'warnings' ? issues : [];
  const overflow = kind === 'warnings' ? result.warningOverflow : 0;
  const shown = ui.tab === 'problems' ? errors : warnings;
  const stale = v.state === 'checking';

  const select = (tab: Tab) => update({ tab, expanded: true });
  const onTabKey = (e: JSX.TargetedKeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const next: Tab =
      e.key === 'Home' ? 'problems' : e.key === 'End' ? 'warnings' : ui.tab === 'problems' ? 'warnings' : 'problems';
    select(next);
    (e.currentTarget.parentElement?.querySelector(`#${TAB_ID[next]}`) as HTMLElement | null)?.focus();
  };

  const tab = (id: Tab, label: string) => (
    <button
      type="button"
      role="tab"
      id={TAB_ID[id]}
      class="tk-issues__tab"
      aria-selected={ui.expanded && ui.tab === id}
      aria-controls={ui.expanded ? PANEL_ID : undefined}
      tabIndex={ui.tab === id ? 0 : -1}
      onClick={() => select(id)}
      onKeyDown={onTabKey}
    >
      {label}
    </button>
  );

  return (
    <div class="tk-issues-slot">
      <section
        class={stale ? 'tk-issues tk-issues--stale' : 'tk-issues'}
        aria-label={t('label.issues')}
        aria-busy={stale}
        data-expanded={ui.expanded}
      >
        <div class="tk-issues__header">
          <div class="tk-issues__tabs" role="tablist" aria-label={t('label.issues')}>
            {tab('problems', t('issue.tab_problems', { count: formatCount(errors.length) }))}
            {tab('warnings', t('issue.tab_warnings', { count: formatCount(warnings.length + overflow) }))}
          </div>
          <button
            type="button"
            class="tk-icon-button tk-issues__toggle"
            aria-expanded={ui.expanded}
            aria-controls={ui.expanded ? PANEL_ID : undefined}
            aria-label={ui.expanded ? t('action.collapse_issues') : t('action.expand_issues')}
            onClick={() => update({ expanded: !ui.expanded })}
          >
            <Icon name={ui.expanded ? 'chevron-down' : 'chevron-up'} />
          </button>
        </div>
        {ui.expanded && (
          <div class="tk-issues__body" role="tabpanel" id={PANEL_ID} aria-labelledby={TAB_ID[ui.tab]}>
            <ul class="tk-issues__list">
              {shown.map((issue, index) => (
                <IssueItem key={`${issue.code}:${issue.pos}`} issue={issue} onActivate={() => app.jumpTo(index)} />
              ))}
              {ui.tab === 'warnings' && overflow > 0 && (
                <li class="tk-issues__more">{tCount('issue.more', overflow)}</li>
              )}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

/** One issue: severity, hint, location and code; activating it jumps to its position. */
function IssueItem({ issue, onActivate }: { issue: Issue; onActivate: () => void }) {
  const error = issue.severity === 'error';
  return (
    <li class="tk-issues__item">
      <button type="button" class="tk-issue" onClick={onActivate}>
        <span
          class={
            error ? 'tk-issue__severity tk-issue__severity--error' : 'tk-issue__severity tk-issue__severity--warning'
          }
        >
          {error ? t('issue.error') : t('issue.warning')}
        </span>
        <span class="tk-issue__hint">{hintFor(issue)}</span>
        <span class="tk-issue__location">{locationOf(issue)}</span>
        <span class="tk-issue__code">{issue.code}</span>
      </button>
    </li>
  );
}
