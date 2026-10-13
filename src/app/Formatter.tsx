// Implements: SCR-Formatter — layout regions (toolbar · notice bar · main area · issue panel ·
// status bar) and the states of F-001 (default, empty, loading, large, confirm, file errors) and
// F-005 (error: marked in the editor, issue panel open, COPY-status.invalid). Signals are read
// in the leaf components; the root only mirrors the document facts into data attributes (no
// re-render of the tree on every keystroke, review m7).
import { effect } from '@preact/signals';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { ConfirmDialog } from './components/ConfirmDialog';
import { EditorArea } from './components/EditorArea';
import { IssuePanel } from './components/IssuePanel';
import { NoticeBar } from './components/NoticeBar';
import { StatusBar } from './components/StatusBar';
import { Toasts } from './components/Toasts';
import { Toolbar } from './components/Toolbar';
import { TreeArea } from './components/TreeArea';
import { AppController } from './controller';
import { createAppState } from './state';

export function Formatter() {
  const app = useMemo(() => new AppController(createAppState()), []);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => () => app.detach(), [app]);
  // A plain (synchronous) effect, not useSignalEffect: that one defers to the next animation
  // frame, so `data-busy` would still read "false" right after an action started and anything
  // waiting for the tool to be idle (the e2e `waitIdle`) could pass before the operation ran.
  useEffect(
    () =>
      effect(() => {
        const el = root.current;
        const doc = app.state.doc.value;
        const busy = app.blocked();
        if (!el) return;
        el.dataset['busy'] = String(busy);
        el.dataset['tier'] = doc.tier;
        el.dataset['bytes'] = String(doc.bytes);
        el.dataset['lines'] = String(doc.lines);
        el.dataset['lineEnding'] = doc.lineEnding;
        el.dataset['sourceName'] = doc.sourceName ?? '';
      }),
    [app],
  );
  return (
    <div ref={root} class="tk-formatter" data-screen="SCR-Formatter" data-busy="false">
      <Toolbar app={app} />
      <NoticeBar app={app} />
      <main class="tk-main">
        <EditorArea app={app} />
        <TreeArea app={app} />
      </main>
      <IssuePanel app={app} />
      <StatusBar app={app} />
      <Toasts app={app} />
      <ConfirmDialog app={app} />
    </div>
  );
}
