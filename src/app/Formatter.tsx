// Implements: SCR-Formatter (layout regions; shell only — states arrive with their features).
import { EditorArea } from './components/EditorArea';
import { StatusBar } from './components/StatusBar';
import { Toolbar } from './components/Toolbar';

export function Formatter() {
  return (
    <div class="tk-formatter" data-screen="SCR-Formatter">
      <Toolbar empty />
      <main class="tk-main">
        <EditorArea />
      </main>
      <StatusBar />
    </div>
  );
}
