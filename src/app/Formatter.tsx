// Implements: SCR-Formatter — layout regions (toolbar · notice bar · main area · status bar) and
// the states of F-001: default, empty, loading, large, confirm and file errors. Signals are read
// in the leaf components; the root only mirrors the document facts into data attributes (no
// re-render of the tree on every keystroke, review m7).
import { useSignalEffect } from '@preact/signals';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { ConfirmDialog } from './components/ConfirmDialog';
import { EditorArea } from './components/EditorArea';
import { NoticeBar } from './components/NoticeBar';
import { StatusBar } from './components/StatusBar';
import { Toolbar } from './components/Toolbar';
import { AppController } from './controller';
import { createAppState } from './state';

export function Formatter() {
  const app = useMemo(() => new AppController(createAppState()), []);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => () => app.detach(), [app]);
  useSignalEffect(() => {
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
  });
  return (
    <div ref={root} class="tk-formatter" data-screen="SCR-Formatter" data-busy="false">
      <Toolbar app={app} />
      <NoticeBar app={app} />
      <main class="tk-main">
        <EditorArea app={app} />
      </main>
      <StatusBar doc={app.state.doc} cursor={app.state.cursor} />
      <ConfirmDialog app={app} />
    </div>
  );
}
