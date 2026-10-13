// MOD-IO — file pick/drop, clipboard with fallback, download (platform-mapping.md).
// Files are handed on as `File` handles: nothing is read on the main thread (the worker reads).

let input: HTMLInputElement | null = null;

/**
 * Implements: F-001.R3 — the device's file chooser through a hidden `<input type="file">` (no
 * `accept` filter, so .txt and .log work). Resolves with the chosen file, or null when cancelled.
 */
export function pickFile(): Promise<File | null> {
  if (!input) {
    input = document.createElement('input');
    input.type = 'file';
    input.className = 'tk-visually-hidden';
    input.tabIndex = -1;
    input.setAttribute('aria-hidden', 'true');
    document.body.append(input);
  }
  const el = input;
  el.value = '';
  return new Promise((resolve) => {
    const done = (file: File | null) => {
      el.removeEventListener('change', onChange);
      el.removeEventListener('cancel', onCancel);
      resolve(file);
    };
    const onChange = () => done(el.files?.[0] ?? null);
    const onCancel = () => done(null);
    el.addEventListener('change', onChange);
    el.addEventListener('cancel', onCancel);
    el.click();
  });
}

/** What a drop carries, decided from its DataTransfer. */
export type DropKind =
  | { kind: 'files'; file: File; multiple: boolean }
  /** A folder, or non-file content (COPY-error.not_a_file). */
  | { kind: 'not-a-file' };

/** Implements: F-001.R2 edge cases — first file only, folders and non-file content refused. */
export function classifyDrop(dt: Pick<DataTransfer, 'files' | 'items'>): DropKind {
  const files = dt.files;
  const first = files[0];
  if (!first) return { kind: 'not-a-file' };
  // Folders show up as a File too; the entry API tells them apart (all three engines).
  const item = [...dt.items].find((i) => i.kind === 'file');
  const entry = item && typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null;
  if (entry?.isDirectory) return { kind: 'not-a-file' };
  return { kind: 'files', file: first, multiple: files.length > 1 };
}

const hasFiles = (dt: DataTransfer | null) => !!dt && [...dt.types].includes('Files');

export interface DropTargetHandlers {
  /** True when the event happened inside the editor text (text drags there are left alone). */
  isInEditor: (event: DragEvent) => boolean;
  onDrop: (drop: DropKind) => void;
  /** CMP-DropOverlay visibility. */
  onOverlay: (active: boolean) => void;
}

/**
 * Implements: F-001.R2, CMP-DropOverlay — drop anywhere on the tool. Capture-phase listeners on
 * the window, so file drops never reach the editor engine (which would insert the file text).
 * Returns a function that removes the listeners.
 */
export function installDropTarget(target: Window, h: DropTargetHandlers): () => void {
  let depth = 0;
  const overlay = (on: boolean) => {
    if (!on) depth = 0;
    h.onOverlay(on);
  };
  const enter = (e: DragEvent) => {
    if (!hasFiles(e.dataTransfer)) return;
    depth++;
    overlay(true);
  };
  const over = (e: DragEvent) => {
    if (hasFiles(e.dataTransfer)) {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      if (depth === 0) {
        depth = 1;
        overlay(true);
      }
    } else if (!h.isInEditor(e)) {
      e.preventDefault(); // so that the drop is delivered and can be refused
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
    }
  };
  const leave = (e: DragEvent) => {
    if (!hasFiles(e.dataTransfer)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0 || e.relatedTarget === null) overlay(false);
  };
  const dropped = (e: DragEvent) => {
    const dt = e.dataTransfer;
    if (hasFiles(dt)) {
      e.preventDefault();
      e.stopPropagation();
      overlay(false);
      h.onDrop(classifyDrop(dt!));
      return;
    }
    overlay(false);
    if (h.isInEditor(e)) return; // text drag within the editor: normal editing
    e.preventDefault();
    h.onDrop({ kind: 'not-a-file' });
  };
  const end = () => overlay(false);
  const opts = { capture: true };
  target.addEventListener('dragenter', enter, opts);
  target.addEventListener('dragover', over, opts);
  target.addEventListener('dragleave', leave, opts);
  target.addEventListener('drop', dropped, opts);
  target.addEventListener('dragend', end, opts);
  return () => {
    target.removeEventListener('dragenter', enter, opts);
    target.removeEventListener('dragover', over, opts);
    target.removeEventListener('dragleave', leave, opts);
    target.removeEventListener('drop', dropped, opts);
    target.removeEventListener('dragend', end, opts);
  };
}
