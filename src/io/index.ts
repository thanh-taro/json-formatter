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

// ---- copy and download (F-007) ---------------------------------------------------------------

/** Outcome of a clipboard write: "blocked" means the environment refused it (F-007.R3). */
export type CopyOutcome = 'copied' | 'blocked';

/** The browser's async clipboard (injectable for tests). */
export interface ClipboardEnv {
  clipboard: Pick<Clipboard, 'write'> | undefined;
  ClipboardItem: typeof ClipboardItem | undefined;
}

const browserClipboard = (): ClipboardEnv => ({
  clipboard: typeof navigator !== 'undefined' ? navigator.clipboard : undefined,
  ClipboardItem: typeof ClipboardItem !== 'undefined' ? ClipboardItem : undefined,
});

/**
 * Implements: F-007.R1, F-007.R3 (blocked outcome), F-007.R6 — writes a whole document to the
 * clipboard. Must be called synchronously inside the click handler: the clipboard item is created
 * at once with a *promise* of the worker-built Blob, so WebKit keeps the user activation across
 * the worker round trip (ADR-0007 §5, platform-mapping). Resolves "blocked" when the environment
 * refuses (no API, permissions policy, WebKit above ~120 MB — D-025); a failure of the export
 * itself (including cancel) rejects with that failure instead.
 */
export function copyBlob(blob: Promise<Blob>, env: ClipboardEnv = browserClipboard()): Promise<CopyOutcome> {
  let exportFailed = false;
  let exportError: unknown;
  const text = blob.then(
    (b) => new Blob([b], { type: 'text/plain' }),
    (e: unknown) => {
      exportFailed = true;
      exportError = e;
      throw e;
    },
  );
  text.catch(() => undefined); // observed below; never an unhandled rejection
  const { clipboard, ClipboardItem: Item } = env;
  if (!clipboard?.write || !Item) return Promise.resolve('blocked');
  let written: Promise<void>;
  try {
    written = clipboard.write([new Item({ 'text/plain': text })]);
  } catch {
    return Promise.resolve('blocked');
  }
  return written.then(
    () => 'copied',
    () => (exportFailed ? Promise.reject(exportError) : 'blocked'),
  );
}

/** The browser pieces a download needs (injectable for tests). */
export interface DownloadEnv {
  createElement: () => HTMLAnchorElement;
  append: (a: HTMLAnchorElement) => void;
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
  /** The object URL is revoked this long after the click (the browser has started the save). */
  revokeAfterMs: number;
}

const browserDownload = (): DownloadEnv => ({
  createElement: () => document.createElement('a'),
  append: (a) => document.body.append(a),
  createObjectURL: (b) => URL.createObjectURL(b),
  revokeObjectURL: (u) => URL.revokeObjectURL(u),
  revokeAfterMs: 60_000,
});

/**
 * Implements: F-007.R2, F-007.R4, INV-02 — saves `blob` as `name` through a local object URL and
 * a temporary `download` link (no request leaves the device); the URL is revoked afterwards.
 * There is no "blocked" outcome: no engine reports a download refused by the frame sandbox
 * (SP-iframe; F-007.R5 deprecated, D-023).
 */
export function download(blob: Blob, name: string, env: DownloadEnv = browserDownload()): void {
  const url = env.createObjectURL(blob);
  const a = env.createElement();
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  env.append(a);
  a.click();
  a.remove();
  setTimeout(() => env.revokeObjectURL(url), env.revokeAfterMs);
}

/** The most recent tool operation, as far as RULE-10 cares. */
export type LastOperation = 'load' | 'clear' | 'beautify' | 'minify' | 'reindent' | null;

/**
 * Implements: RULE-10 — the original file name when the document came from a file; otherwise
 * `formatted.json` after beautify, `minified.json` after minify, else `document.json`.
 */
export function downloadName(sourceName: string | null, lastOperation: LastOperation): string {
  if (sourceName) return sourceName;
  if (lastOperation === 'beautify') return 'formatted.json';
  if (lastOperation === 'minify') return 'minified.json';
  return 'document.json';
}
