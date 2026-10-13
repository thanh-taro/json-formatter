// Implements: SCR-Formatter — layout regions (toolbar · notice bar · main area · status bar) and
// the states of F-001: default, empty, loading, large, confirm and file errors.
import { useEffect, useMemo } from 'preact/hooks';
import { ConfirmDialog } from './components/ConfirmDialog';
import { EditorArea } from './components/EditorArea';
import { NoticeBar } from './components/NoticeBar';
import { StatusBar } from './components/StatusBar';
import { Toolbar } from './components/Toolbar';
import { AppController } from './controller';
import { createAppState } from './state';

export function Formatter() {
  const app = useMemo(() => new AppController(createAppState()), []);
  useEffect(() => () => app.detach(), [app]);
  const doc = app.state.doc.value;
  const busy = !!app.state.busy.value;
  return (
    <div
      class="tk-formatter"
      data-screen="SCR-Formatter"
      data-busy={String(busy)}
      data-tier={doc.tier}
      data-bytes={String(doc.bytes)}
      data-lines={String(doc.lines)}
      data-line-ending={doc.lineEnding}
      data-source-name={doc.sourceName ?? ''}
    >
      <Toolbar app={app} />
      <NoticeBar app={app} />
      <main class="tk-main">
        <EditorArea app={app} />
      </main>
      <StatusBar empty={doc.empty} cursor={app.state.cursor.value} />
      <ConfirmDialog app={app} />
    </div>
  );
}
