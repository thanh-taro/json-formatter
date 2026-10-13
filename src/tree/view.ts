// MOD-Tree view: CMP-TreeView as a custom virtual list (ADR-0007 §4; promoted from the SP-tree
// prototype, branch `spike/tree`, `spikes/tree/src/page.ts`). Fixed-height rows (size.treeRow,
// size.touchTarget on coarse pointers) from a pool of elements, only visible rows plus overscan,
// neighbouring blocks prefetched (±1 viewport); the spacer is capped at 8 M px with proportional
// mapping, and in that scaled mode wheel scrolling is intercepted so it moves by virtual pixels.
// `role="tree"` with aria-level / -setsize / -posinset / -expanded / -selected per rendered row,
// the APG keyboard model with roving tabindex, and the tree container as the tab stop when the
// selected row is not rendered. Header actions for the selected row (D-018), collapse all, and
// the invalid, checking, building and unavailable states. Plain DOM (no framework): the list is
// rewritten every frame while scrolling.
//
// Implements: F-006.R1–F-006.R10 (with MOD-App), RULE-06, RULE-11, RULE-12, INV-05, NFR-02,
// NFR-04, NFR-06; CMP-TreeView.
import chevronRight from 'lucide-static/icons/chevron-right.svg?raw';
import circleAlert from 'lucide-static/icons/circle-alert.svg?raw';
import copyIcon from 'lucide-static/icons/copy.svg?raw';
import link from 'lucide-static/icons/link.svg?raw';
import textAlign from 'lucide-static/icons/text-align-start.svg?raw';
import { t, tCount, type MessageId } from '../copy';
import {
  GROUP,
  isContainer,
  kindName,
  KIND_ARRAY,
  KIND_OBJECT,
  KIND_STRING,
  KIND_NUMBER,
  type ContainerRef,
  type TreeItem,
} from '../core';
import { geometry, RowModel, type RNode, type Row } from './rowmodel';

/** What MOD-Tree needs from the rest of the app (worker, clipboard, editor, app state). */
export interface TreeDeps {
  /** The root node at `version`; rejects with `{ reason }` (`too-large`, `cancelled`, …). */
  open(version: number, onProgress: (fraction: number) => void): { root: Promise<TreeItem>; cancel: () => void };
  children(version: number, c: ContainerRef, from: number, count: number): Promise<TreeItem[]>;
  /** Copies a path (MOD-IO); the app shows the toast or COPY-error.clipboard. */
  copyPath(path: string): Promise<'copied' | 'blocked' | null>;
  /** Copies a node's value from a worker-built Blob of its span, created synchronously in the
   * click handler (ADR-0007 §5); `text` reads the value for the manual-copy field. */
  copyValue(
    version: number,
    from: number,
    to: number,
  ): Promise<{ outcome: 'copied' | 'blocked'; text: () => Promise<string> } | null>;
  /** Shows the text view with [from, to) selected and scrolled into view (F-006.R6). */
  reveal(from: number, to: number): void;
  goToError(): void;
  showText(): void;
  /** Undo/redo keys pressed in the tree (the document's history, F-001.R7). */
  history(direction: 'undo' | 'redo'): void;
  /** The tree could not be built for a reason other than size or cancel. */
  failed(reason: string): void;
}

export interface TreeHandle {
  /** The document at `version` is valid: show its tree (built if needed). */
  show(version: number): void;
  /** The document changed to `version` and is being checked: the tree is out of date (INV-05). */
  markStale(version: number): void;
  /** Progress of the check (0–1). */
  progress(fraction: number): void;
  /** The document is invalid: COPY-tree.invalid with the error's location (F-006.R7). */
  showInvalid(location: string): void;
  hide(): void;
  collapseAll(): void;
  destroy(): void;
}

/** NFR-02: progress (and cancel) appear once work has taken this long. */
const PROGRESS_DELAY_MS = 500;
const OVERSCAN = 4;

const strip = (svg: string) => svg.replace(/<!--[\s\S]*?-->/g, '').trim();
const ICONS = {
  twisty: strip(chevronRight),
  alert: strip(circleAlert),
  copy: strip(copyIcon),
  link: strip(link),
  text: strip(textAlign),
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function icon(name: keyof typeof ICONS, cls = 'tk-tree__icon'): HTMLSpanElement {
  const s = el('span', cls);
  s.setAttribute('aria-hidden', 'true');
  // Build-time constants from the icon package, never user content.
  s.innerHTML = ICONS[name];
  return s;
}

let ids = 0;

/** Member names are shown decoded; control characters are shown as escapes. */
const displayKey = (k: string) => k.replace(/[\u0000-\u001f]/g, (c) => JSON.stringify(c).slice(1, -1));

const KIND_IDS: Record<string, MessageId> = {
  object: 'tree.kind_object',
  array: 'tree.kind_array',
  string: 'tree.kind_string',
  number: 'tree.kind_number',
  boolean: 'tree.kind_boolean',
  null: 'tree.kind_null',
};

interface PoolRow {
  el: HTMLDivElement;
  twisty: HTMLSpanElement;
  key: HTMLSpanElement;
  kind: HTMLSpanElement;
  value: HTMLSpanElement;
  /** Visible row index shown, -1 when unused. */
  i: number;
  /** What was last written (skip unchanged rows). */
  sig: string;
}

interface Cursor {
  node: RNode;
  entry: number;
}

type Mode = 'none' | 'tree' | 'invalid' | 'too-large' | 'building';

export function mountTree(container: HTMLElement, deps: TreeDeps): TreeHandle {
  const uid = ++ids;
  const root = el('div', 'tk-tree');
  root.dataset['mode'] = 'none';

  // ---- header (D-018): selected row's path, its actions, collapse all ----
  const header = el('div', 'tk-tree__header');
  const pathOut = el('span', 'tk-tree__path');
  const actions = el('span', 'tk-tree__actions');
  const action = (
    id: 'action.copy_path' | 'action.copy_value' | 'action.reveal',
    iconName: keyof typeof ICONS,
    run: () => void,
  ) => {
    const b = el('button', 'tk-tree__action');
    b.type = 'button';
    b.disabled = true;
    b.append(icon(iconName), el('span', 'tk-tree__action-label', t(id)));
    b.addEventListener('click', run);
    actions.append(b);
    return b;
  };
  const bPath = action('action.copy_path', 'link', () => copyPath());
  const bValue = action('action.copy_value', 'copy', () => copyValue());
  const bReveal = action('action.reveal', 'text', () => reveal());
  const sep = el('span', 'tk-tree__sep');
  const bCollapse = el('button', 'tk-tree__collapse', t('action.collapse_all'));
  bCollapse.type = 'button';
  bCollapse.addEventListener('click', () => collapseAll());
  header.append(pathOut, actions, sep, bCollapse);

  // ---- checking bar (F-006.R10): COPY-tree.checking, progress and cancel after 0.5 s ----
  const checking = el('div', 'tk-tree__checking');
  checking.hidden = true;
  const checkLabel = el('span', 'tk-tree__checking-label', t('tree.checking'));
  checkLabel.id = `tk-tree-checking-${uid}`;
  checkLabel.setAttribute('role', 'status');
  const checkTrack = progressTrack(checkLabel.id);
  const checkCancel = el('button', 'tk-button tk-button--outline tk-tree__cancel', t('action.cancel'));
  checkCancel.type = 'button';
  checkCancel.addEventListener('click', () => deps.showText());
  checking.append(checkLabel, checkTrack.track, el('span', 'tk-tree__spacer-flex'), checkCancel);

  // ---- manual copy field (F-006.R9) ----
  const fallback = el('div', 'tk-tree__fallback');
  fallback.hidden = true;
  const fbLabel = el('label', 'tk-tree__fallback-label');
  const fbInput = el('input', 'tk-tree__fallback-input');
  fbInput.type = 'text';
  fbInput.readOnly = true;
  fbInput.id = `tk-tree-fallback-${uid}`;
  fbLabel.htmlFor = fbInput.id;
  fallback.append(fbLabel, fbInput);
  fbInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    hideFallback();
    focusCursor();
  });

  // ---- the list ----
  const viewport = el('div', 'tk-tree__viewport');
  viewport.setAttribute('role', 'tree');
  viewport.setAttribute('aria-label', t('label.tree'));
  viewport.tabIndex = -1;
  const spacer = el('div', 'tk-tree__spacer');
  spacer.setAttribute('role', 'none');
  const layer = el('div', 'tk-tree__layer');
  layer.setAttribute('role', 'none');
  spacer.append(layer);
  viewport.append(spacer);

  // ---- messages: invalid, unavailable, building ----
  const message = el('div', 'tk-tree__message');
  message.hidden = true;

  root.append(header, checking, fallback, viewport, message);
  container.append(root);

  // ---- state ----
  let mode: Mode = 'none';
  let model: RowModel | null = null;
  let version = -1;
  let stale = false;
  let staleTimer: ReturnType<typeof setTimeout> | undefined;
  let cursor: Cursor | null = null;
  let selected = false;
  let opening: { version: number; cancel: () => void } | null = null;
  let buildTimer: ReturnType<typeof setTimeout> | undefined;
  let buildFraction = 0;
  let buildMessage: { label: HTMLSpanElement; set: (f: number) => void } | null = null;
  const inflight = new Set<string>();
  const pool: PoolRow[] = [];
  const nodeIds = new WeakMap<RNode, number>();
  let nextNodeId = 1;
  let frame = 0;
  let rowH = 24;
  let ownFocus = false;

  const nodeId = (n: RNode) => {
    let id = nodeIds.get(n);
    if (!id) nodeIds.set(n, (id = nextNodeId++));
    return id;
  };

  function progressTrack(labelledBy: string) {
    const track = el('span', 'tk-tree__track');
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    track.setAttribute('aria-labelledby', labelledBy);
    const fill = el('span', 'tk-tree__fill');
    track.append(fill);
    const set = (f: number) => {
      const percent = Math.floor(Math.max(0, Math.min(0.99, f)) * 100);
      track.setAttribute('aria-valuenow', String(percent));
      fill.style.inlineSize = `${percent}%`;
      return percent;
    };
    set(0);
    return { track, set };
  }

  function setMode(next: Mode): void {
    mode = next;
    root.dataset['mode'] = next;
    const tree = next === 'tree';
    header.hidden = !tree;
    viewport.hidden = !tree;
    message.hidden = tree || next === 'none';
    if (!tree) {
      checking.hidden = true;
      hideFallback();
    }
  }

  function readRowHeight(): void {
    const v = parseFloat(getComputedStyle(viewport).getPropertyValue('--tk-tree-row'));
    if (v > 0) rowH = v;
  }

  // ---- rendering ----

  function scheduleRender(): void {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      render();
    });
  }

  function poolRow(k: number): PoolRow {
    while (pool.length <= k) {
      const row = el('div', 'tk-tree__row');
      row.setAttribute('role', 'treeitem');
      row.tabIndex = -1;
      const twisty = icon('twisty', 'tk-tree__twisty');
      const key = el('span', 'tk-tree__key');
      const kind = el('span', 'tk-tree__kind');
      const value = el('span', 'tk-tree__value');
      row.append(twisty, key, kind, value);
      const pr: PoolRow = { el: row, twisty, key, kind, value, i: -1, sig: '' };
      layer.append(row);
      pool.push(pr);
    }
    return pool[k]!;
  }

  function cursorIndex(): number {
    if (!model || !cursor) return -1;
    return model.indexOf(cursor.node, cursor.entry);
  }

  function render(): void {
    if (!model || mode !== 'tree') return;
    const m = model;
    const vh = viewport.clientHeight;
    const st = viewport.scrollTop;
    const g = geometry(m.total, rowH, vh, st);
    spacer.style.blockSize = `${g.spacer}px`;
    const first = Math.max(0, Math.floor(g.virtualTop / rowH) - OVERSCAN);
    const offset = first * rowH - g.virtualTop;
    layer.style.transform = `translateY(${st + offset}px)`;
    const n = Math.ceil(vh / rowH) + 2 * OVERSCAN + 1;
    const sel = cursorIndex();
    const active = document.activeElement;
    const focusInTree = viewport.contains(active);
    let selRendered = false;
    for (let k = 0; k < n; k++) {
      const pr = poolRow(k);
      const i = first + k;
      if (i >= m.total) {
        pr.el.hidden = true;
        pr.i = -1;
        pr.sig = '';
        continue;
      }
      pr.el.hidden = false;
      const r = m.rowAt(i);
      const isSel = i === sel;
      if (isSel) selRendered = true;
      pr.i = i;
      write(pr, r, isSel);
      if (r.type === 'item' && !r.item) fetchBlock(r.node, r.idx);
    }
    for (let k = n; k < pool.length; k++) {
      pool[k]!.el.hidden = true;
      pool[k]!.i = -1;
    }
    // ADR-0007 §4: the tree container is the tab stop when the selected row is not rendered.
    viewport.tabIndex = selRendered ? -1 : 0;
    if (focusInTree) {
      const selEl = pool.find((p) => p.i === sel)?.el;
      if (selEl && active !== selEl) selEl.focus({ preventScroll: true });
      else if (!selEl && active !== viewport) {
        ownFocus = true;
        viewport.focus({ preventScroll: true });
        ownFocus = false;
      }
    }
    // prefetch the neighbouring blocks (±1 viewport)
    const lo = Math.max(0, first - n);
    const hi = Math.min(m.total, first + 2 * n);
    for (let i = lo; i < hi; i += 10) {
      const r = m.rowAt(i);
      if (r.type === 'item' && !r.item) fetchBlock(r.node, r.idx);
    }
    updateHeader();
  }

  function write(pr: PoolRow, r: Row, isSel: boolean): void {
    const m = model!;
    const expandable = m.expandable(r);
    const loaded = r.type === 'group' || !!r.item;
    const sig = `${version}|${nodeId(r.node)}|${r.entry}|${loaded ? 1 : 0}|${r.expanded ? 1 : 0}|${isSel ? 1 : 0}${selected ? 1 : 0}|${r.setsize}`;
    if (sig === pr.sig) return;
    pr.sig = sig;
    const e = pr.el;
    e.style.setProperty('--tk-tree-level', String(r.level - 1));
    e.setAttribute('aria-level', String(r.level));
    e.setAttribute('aria-setsize', String(r.setsize));
    e.setAttribute('aria-posinset', String(r.entry + 1));
    e.setAttribute('aria-selected', String(isSel && selected));
    e.tabIndex = isSel ? 0 : -1;
    e.classList.toggle('tk-tree__row--selected', isSel && selected);
    if (expandable) e.setAttribute('aria-expanded', String(r.expanded));
    else e.removeAttribute('aria-expanded');
    pr.twisty.classList.toggle('tk-tree__twisty--leaf', !expandable);
    if (r.type === 'group') {
      e.className = classes(e, 'tk-tree__row tk-tree__row--group');
      pr.key.textContent = t('tree.group', { from: r.a, to: r.b });
      pr.key.className = 'tk-tree__key tk-tree__key--group';
      pr.kind.textContent = '';
      pr.kind.hidden = true;
      pr.value.textContent = '';
      return;
    }
    const it = r.item;
    const cont = r.node.cont;
    const isRoot = r.node === m.top;
    pr.key.className = isRoot ? 'tk-tree__key tk-tree__key--root' : 'tk-tree__key';
    if (!it) {
      e.className = classes(e, 'tk-tree__row tk-tree__row--loading');
      pr.key.textContent = cont.kind === KIND_ARRAY ? String(r.idx) : '';
      pr.kind.textContent = '';
      pr.kind.hidden = true;
      pr.value.textContent = '';
      return;
    }
    e.className = classes(e, 'tk-tree__row');
    pr.key.textContent = isRoot ? '$' : cont.kind === KIND_OBJECT ? displayKey(it.k ?? '') : String(it.i);
    const kind = kindName(it.kind);
    pr.kind.hidden = false;
    pr.kind.textContent = t(KIND_IDS[kind] as 'tree.kind_object');
    if (isContainer(it.kind)) {
      pr.value.className = 'tk-tree__value tk-tree__value--count';
      pr.value.textContent = tCount(it.kind === KIND_OBJECT ? 'tree.count_keys' : 'tree.count_items', it.n);
    } else {
      pr.value.className = `tk-tree__value tk-tree__value--${it.kind === KIND_STRING ? 'string' : it.kind === KIND_NUMBER ? 'number' : 'literal'}`;
      // F-006 edge case: long values are cut in the row; copy value has the whole text
      pr.value.textContent = it.vt ? `${it.v ?? ''}…` : (it.v ?? '');
    }
  }

  /** Keeps the selected state class while switching the base classes. */
  function classes(e: HTMLElement, base: string): string {
    return e.classList.contains('tk-tree__row--selected') ? `${base} tk-tree__row--selected` : base;
  }

  function fetchBlock(node: RNode, idx: number): void {
    const m = model;
    if (!m || stale) return;
    const c = node.cont;
    const block = Math.floor(idx / GROUP);
    const key = `${version}:${c.s}:${block}`;
    if (inflight.has(key) || m.has(c.s, block)) return;
    inflight.add(key);
    const v = version;
    deps.children(v, { s: c.s, e: c.e, n: c.n, kind: c.kind }, block * GROUP, GROUP).then(
      (rows) => {
        inflight.delete(key);
        if (model !== m) return;
        m.put(c.s, block, rows);
        scheduleRender();
      },
      () => inflight.delete(key),
    );
  }

  // ---- header (D-018) ----

  function selectedRow(): Row | null {
    if (!model || !cursor || !selected) return null;
    return model.describe(cursor.node, cursor.entry);
  }

  function updateHeader(): void {
    const r = selectedRow();
    const path = r && model ? model.pathOf(r) : null;
    pathOut.textContent = path ?? '';
    pathOut.title = path ?? '';
    // RULE-12: group rows have no copy actions; nothing while out of date (INV-05)
    const ok = !!path && !stale;
    bPath.disabled = bValue.disabled = bReveal.disabled = !ok;
    bCollapse.disabled = stale || !model;
  }

  function copyPath(): void {
    const r = selectedRow();
    const path = r && model?.pathOf(r);
    if (!path) return;
    void deps.copyPath(path).then((outcome) => {
      if (outcome === 'blocked') showFallback('action.copy_path', path);
      else if (outcome === 'copied') hideFallback();
    });
  }

  function copyValue(): void {
    const r = selectedRow();
    if (!r || r.type !== 'item' || !r.item) return;
    // Synchronously in the click handler: the clipboard item takes a promise (ADR-0007 §5).
    void deps.copyValue(version, r.item.s, r.item.e).then(async (res) => {
      if (!res) return;
      if (res.outcome === 'copied') hideFallback();
      else showFallback('action.copy_value', await res.text());
    });
  }

  function reveal(): void {
    const r = selectedRow();
    if (!r || r.type !== 'item' || !r.item) return;
    deps.reveal(r.item.s, r.item.e);
  }

  /** Implements: F-006.R9 — the text in a read-only field, selected for a manual copy. */
  function showFallback(id: 'action.copy_path' | 'action.copy_value', text: string): void {
    fbLabel.textContent = t(id);
    fbInput.value = text;
    fallback.hidden = false;
    fbInput.focus();
    fbInput.select();
  }

  function hideFallback(): void {
    if (fallback.hidden) return;
    fallback.hidden = true;
    fbInput.value = '';
  }

  // ---- selection and keyboard (APG tree view) ----

  function scrollToIndex(i: number): void {
    if (!model) return;
    const vh = viewport.clientHeight;
    const g = geometry(model.total, rowH, vh, viewport.scrollTop);
    const top = i * rowH;
    let v = g.virtualTop;
    if (top < v) v = top;
    else if (top + rowH > v + vh) v = top + rowH - vh;
    else return;
    viewport.scrollTop = g.toScroll(v);
  }

  function moveTo(i: number): void {
    if (!model) return;
    const idx = Math.max(0, Math.min(model.total - 1, i));
    const r = model.rowAt(idx);
    cursor = { node: r.node, entry: r.entry };
    selected = true;
    hideFallback();
    scrollToIndex(idx);
    render();
    focusCursor();
  }

  function focusCursor(): void {
    const sel = cursorIndex();
    const pr = pool.find((p) => p.i === sel);
    if (pr) pr.el.focus({ preventScroll: true });
    else {
      ownFocus = true;
      viewport.focus({ preventScroll: true });
      ownFocus = false;
    }
  }

  function toggle(r: Row): void {
    if (!model || stale) return;
    if (r.expanded) model.collapse(r);
    else model.expand(r);
    render();
  }

  /** After a collapse, a cursor inside the collapsed part moves to the collapsed row. */
  function fixCursor(): void {
    if (!model || !cursor) return;
    let node = cursor.node;
    let entry = cursor.entry;
    while (!model.attached(node) && node.parent) {
      entry = node.entryInParent;
      node = node.parent;
    }
    cursor = { node, entry };
  }

  layer.addEventListener('click', (e) => {
    const rowEl = (e.target as Element).closest('.tk-tree__row');
    const pr = pool.find((p) => p.el === rowEl);
    if (!pr || pr.i < 0 || !model) return;
    const r = model.rowAt(pr.i);
    cursor = { node: r.node, entry: r.entry };
    selected = true;
    hideFallback();
    if ((e.target as Element).closest('.tk-tree__twisty') && model.expandable(r)) toggle(r);
    render();
    focusCursor();
  });
  layer.addEventListener('dblclick', (e) => {
    const rowEl = (e.target as Element).closest('.tk-tree__row');
    const pr = pool.find((p) => p.el === rowEl);
    if (!pr || pr.i < 0 || !model) return;
    if ((e.target as Element).closest('.tk-tree__twisty')) return;
    const r = model.rowAt(pr.i);
    if (model.expandable(r)) toggle(r);
    fixCursor();
  });

  viewport.addEventListener('keydown', (e) => {
    if (!model) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const m = model;
    let i = cursorIndex();
    if (i < 0) i = 0;
    const r = m.rowAt(i);
    const page = Math.max(1, Math.floor(viewport.clientHeight / rowH) - 1);
    switch (e.key) {
      case 'ArrowDown':
        i++;
        break;
      case 'ArrowUp':
        i--;
        break;
      case 'Home':
        i = 0;
        break;
      case 'End':
        i = m.total - 1;
        break;
      case 'PageDown':
        i += page;
        break;
      case 'PageUp':
        i -= page;
        break;
      case 'ArrowRight':
        if (stale) break;
        if (m.expandable(r) && !r.expanded) m.expand(r);
        else if (r.expanded) i++;
        break;
      case 'ArrowLeft':
        if (stale) break;
        if (r.expanded) {
          m.collapse(r);
          fixCursor();
        } else i = m.parentIndex(r) >= 0 ? m.parentIndex(r) : i;
        break;
      case 'Enter':
        if (m.expandable(r)) toggle(r);
        break;
      default:
        return;
    }
    e.preventDefault();
    moveTo(i);
  });

  // ADR-0007 §4: tabbing into the tree when the selected row is not rendered scrolls it in.
  viewport.addEventListener('focus', () => {
    if (ownFocus || !model) return;
    const i = Math.max(0, cursorIndex());
    scrollToIndex(i);
    render();
    focusCursor();
  });

  viewport.addEventListener('scroll', scheduleRender, { passive: true });
  // Scaled mode: the wheel moves by virtual pixels, not by the coarse spacer pixels.
  viewport.addEventListener(
    'wheel',
    (e) => {
      if (!model) return;
      const vh = viewport.clientHeight;
      const g = geometry(model.total, rowH, vh, viewport.scrollTop);
      if (!g.scaled || e.ctrlKey) return;
      e.preventDefault();
      const unit = e.deltaMode === 1 ? rowH : e.deltaMode === 2 ? vh : 1;
      viewport.scrollTop = g.toScroll(g.virtualTop + e.deltaY * unit);
    },
    { passive: false },
  );

  // Undo/redo keys while the tree has focus act on the document (F-006.AC13, F-001.R7).
  root.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'z') deps.history(e.shiftKey ? 'redo' : 'undo');
    else if (k === 'y') deps.history('redo');
    else return;
    e.preventDefault();
  });

  const resize = new ResizeObserver(() => {
    readRowHeight();
    scheduleRender();
  });
  resize.observe(viewport);

  // ---- states ----

  function showMessage(build: (box: HTMLElement) => void): void {
    message.replaceChildren();
    build(message);
  }

  function stopBuilding(): void {
    clearTimeout(buildTimer);
    opening?.cancel();
    opening = null;
    buildMessage = null;
  }

  function setStale(on: boolean): void {
    stale = on;
    root.setAttribute('aria-busy', String(on));
    viewport.classList.toggle('tk-tree__viewport--stale', on);
    clearTimeout(staleTimer);
    checking.hidden = !on;
    checkTrack.track.hidden = true;
    checkCancel.hidden = true;
    if (on) {
      hideFallback();
      checkTrack.set(0);
      // NFR-02: progress after 0.5 s, cancellable
      staleTimer = setTimeout(() => {
        checkTrack.track.hidden = false;
        checkCancel.hidden = false;
      }, PROGRESS_DELAY_MS);
    }
    updateHeader();
  }

  function build(v: number): void {
    stopBuilding();
    buildFraction = 0;
    const job = deps.open(v, (f) => {
      buildFraction = f;
      buildMessage?.set(f);
      // a previous tree is shown dimmed under the checking bar: its progress shows the build
      if (model && stale) checkTrack.set(f);
    });
    const op = { version: v, cancel: job.cancel };
    opening = op;
    // NFR-02: COPY-progress.tree with cancel after 0.5 s
    buildTimer = setTimeout(() => {
      // with a previous tree, the checking bar (progress, cancel) stays instead
      if (opening !== op || model) return;
      setMode('building');
      showMessage((box) => {
        const label = el('span', 'tk-tree__progress-label');
        label.id = `tk-tree-building-${uid}`;
        label.setAttribute('role', 'status');
        const track = progressTrack(label.id);
        const set = (f: number) => {
          label.textContent = t('progress.tree', { percent: track.set(f) });
        };
        set(buildFraction);
        buildMessage = { label, set };
        const cancel = el('button', 'tk-button tk-button--outline', t('action.cancel'));
        cancel.type = 'button';
        cancel.addEventListener('click', () => {
          stopBuilding();
          deps.showText();
        });
        box.append(label, track.track, cancel);
      });
    }, PROGRESS_DELAY_MS);
    job.root.then(
      async (rootItem) => {
        const m = new RowModel(rootItem);
        const rootNode = m.expandInitial();
        if (rootNode && rootNode.g === 1) {
          const c = rootNode.cont;
          m.put(c.s, 0, await deps.children(v, { s: c.s, e: c.e, n: c.n, kind: c.kind }, 0, GROUP));
          m.expandChildren(rootNode);
        }
        if (opening !== op) return;
        clearTimeout(buildTimer);
        opening = null;
        buildMessage = null;
        model = m;
        version = v;
        cursor = { node: m.top, entry: 0 };
        selected = false;
        inflight.clear();
        for (const p of pool) p.sig = '';
        hideFallback();
        setMode('tree');
        setStale(false);
        viewport.scrollTop = 0;
        readRowHeight();
        render();
      },
      (e: unknown) => {
        if (opening !== op) return;
        clearTimeout(buildTimer);
        opening = null;
        const reason = (e as { reason?: string }).reason ?? 'internal';
        if (reason === 'cancelled') return;
        model = null;
        // Implements: F-006.R8 / F-006.AC11 — the device cannot hold the tree: COPY-tree.too_large.
        if (reason === 'too-large') {
          setMode('too-large');
          showMessage((box) => {
            box.append(icon('text', 'tk-tree__message-icon'), el('p', 'tk-tree__message-text', t('tree.too_large')));
            const text = el('button', 'tk-button tk-button--outline', t('view.text'));
            text.type = 'button';
            text.addEventListener('click', () => deps.showText());
            box.append(text);
          });
          return;
        }
        setMode('none');
        deps.failed(reason);
      },
    );
  }

  function collapseAll(): void {
    if (!model || stale) return;
    model.collapseAll();
    cursor = { node: model.top, entry: 0 };
    hideFallback();
    viewport.scrollTop = 0;
    render();
  }

  setMode('none');

  return {
    show(v) {
      if (model && version === v) {
        if (opening) stopBuilding();
        setMode('tree');
        setStale(false);
        readRowHeight();
        render();
        return;
      }
      if (opening?.version === v) return;
      if (model) {
        // the previous tree stays, dimmed, until the new one is ready (INV-05)
        setMode('tree');
        setStale(true);
      }
      build(v);
    },
    markStale(v) {
      if (opening && opening.version !== v) stopBuilding();
      if (model && version === v) return;
      setMode('tree');
      if (!model) {
        // nothing to dim yet: an empty list under the checking bar
        viewport.hidden = false;
      }
      if (!stale) setStale(true);
    },
    progress(f) {
      if (stale) checkTrack.set(f);
    },
    showInvalid(location) {
      stopBuilding();
      model = null;
      version = -1;
      setStale(false);
      setMode('invalid');
      showMessage((box) => {
        box.append(icon('alert', 'tk-tree__message-icon tk-tree__message-icon--danger'));
        box.append(el('p', 'tk-tree__message-text', t('tree.invalid')));
        const go = el('button', 'tk-button tk-button--outline tk-tree__go');
        go.type = 'button';
        go.append(el('span', '', t('action.go_to_error')), el('span', 'tk-tree__go-location', location));
        go.addEventListener('click', () => deps.goToError());
        box.append(go);
      });
    },
    hide() {
      stopBuilding();
      clearTimeout(staleTimer);
      hideFallback();
    },
    collapseAll,
    destroy() {
      stopBuilding();
      clearTimeout(staleTimer);
      cancelAnimationFrame(frame);
      resize.disconnect();
      root.remove();
      model = null;
    },
  };
}
