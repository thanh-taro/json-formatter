// Implements: F-006.R1, F-006.R7, F-006.R10, INV-05 — the main area's tree view (CMP-TreeView,
// rendered by MOD-Tree, loaded lazily the first time it is shown). It follows the app state:
// valid and current → the tree of that version; checking → out of date with progress; invalid →
// COPY-tree.invalid with a jump to the error.
import { signal, useSignalEffect } from '@preact/signals';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { language } from '../../copy';
import type { TreeHandle } from '../../tree';
import { locationOf, type AppController } from '../controller';

export function TreeArea({ app }: { app: AppController }) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useMemo(() => signal<TreeHandle | null>(null), []);
  const view = app.state.view.value;

  // Lazy chunk (MOD-Tree): fetched the first time the tree view is shown.
  useEffect(() => {
    if (view !== 'tree' || handle.peek()) return;
    let alive = true;
    void import('../../tree').then((m) => {
      if (!alive || !host.current || handle.peek()) return;
      handle.value = m.mountTree(host.current, app.treeDeps());
    });
    return () => {
      alive = false;
    };
  }, [view, app, handle]);

  useEffect(() => () => handle.peek()?.destroy(), [handle]);

  useSignalEffect(() => {
    const h = handle.value;
    const state = app.state;
    if (!h) return;
    if (state.view.value !== 'tree') {
      h.hide();
      return;
    }
    const version = state.version.value;
    const v = state.validation.value;
    const current = v.version === version;
    if (current && v.state === 'valid') h.show(version);
    else if (current && v.state === 'invalid') {
      const error = v.result?.issues[0];
      h.showInvalid(error ? locationOf(error) : '');
    } else if (v.state !== 'empty') h.markStale(version);
  });

  useSignalEffect(() => {
    const h = handle.value;
    const f = app.state.checkProgress.value;
    h?.progress(f);
  });

  // Implements: F-012.R2 (ADR-0014 §4) — a language switch relabels the tree in place (expansion,
  // selection and scroll kept); nothing is announced.
  const relabelled = useMemo(() => ({ lang: language.peek() }), []);
  useSignalEffect(() => {
    const lang = language.value;
    const h = handle.value;
    if (!h || lang === relabelled.lang) return;
    relabelled.lang = lang;
    h.relabel();
  });

  return <div ref={host} class="tk-tree-host" hidden={view !== 'tree'} />;
}
