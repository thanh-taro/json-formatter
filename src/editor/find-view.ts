// MOD-Editor find decorations (ADR-0004 "matches are decorations"): the current match and the
// other matches, built only for the visible ranges, so a term with millions of matches costs
// nothing outside the screen.
import { RangeSetBuilder, StateEffect, type Extension } from '@codemirror/state';
import { Decoration, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view';
import type { FindSession } from './find';

/** Redraw the match decorations (the session scanned further, moved, or closed). */
export const findRefresh = StateEffect.define<null>();

const matchMark = Decoration.mark({ class: 'tk-find-match' });
const currentMark = Decoration.mark({ class: 'tk-find-current' });

function build(view: EditorView, session: FindSession | null, previous: DecorationSet): DecorationSet {
  if (!session) return Decoration.none;
  const builder = new RangeSetBuilder<Decoration>();
  const docLength = view.state.doc.length;
  let last = -1;
  for (const { from, to } of view.visibleRanges) {
    const shown = session.visible(from, to);
    // the session is recounting and its first match is not known yet: keep what is drawn
    if (!shown) return previous;
    const { matches, current, length } = shown;
    for (const p of matches) {
      if (p <= last || p + length > docLength) continue;
      builder.add(p, p + length, p === current ? currentMark : matchMark);
      last = p;
    }
  }
  return builder.finish();
}

/** Implements: F-010.R2 — highlights for the current and other matches in the visible range only. */
export function findHighlight(session: () => FindSession | null): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = build(view, session(), Decoration.none);
      }
      update(u: ViewUpdate) {
        const refresh = u.transactions.some((tr) => tr.effects.some((e) => e.is(findRefresh)));
        // After an edit the old matches follow the text until the recount redraws them.
        if (u.docChanged && !refresh) this.decorations = this.decorations.map(u.changes);
        else if (refresh || u.viewportChanged) this.decorations = build(u.view, session(), this.decorations);
      }
    },
    { decorations: (v) => v.decorations },
  );
}
