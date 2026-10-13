// MOD-Editor issue marks (CMP-Editor "error" and "warning" variants): the error position gets an
// inline wavy indicator, its line a tinted background and a gutter mark; warnings get a dotted
// underline over the item and a gutter mark. Marks map through later edits, so while a new
// result is computed the previous one stays in place (INV-05: the status bar says "checking").
// The content element carries aria-invalid while the document is invalid.
import { RangeSet, StateEffect, StateField, type EditorState, type Range } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  GutterMarker,
  WidgetType,
  gutterLineClass,
  type DecorationSet,
} from '@codemirror/view';

/** An issue as the editor needs it: severity and the marked span in editor positions. */
export interface IssueMark {
  severity: 'error' | 'warning';
  pos: number;
  length: number;
}

interface MarkState {
  deco: DecorationSet;
  gutter: RangeSet<GutterMarker>;
  invalid: boolean;
}

const setIssues = StateEffect.define<{ marks: readonly IssueMark[]; invalid: boolean }>();

class LineMarker extends GutterMarker {
  constructor(override readonly elementClass: string) {
    super();
  }
}
const errorGutter = new LineMarker('tk-gutter-error');
const warningGutter = new LineMarker('tk-gutter-warning');

/** The error indicator where there is no character to underline (a line end, the document end). */
class EndOfLineMark extends WidgetType {
  override eq(): boolean {
    return true;
  }
  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'tk-error-mark tk-error-mark--eol';
    span.setAttribute('aria-hidden', 'true');
    return span;
  }
}

const errorMark = Decoration.mark({ class: 'tk-error-mark' });
const warningMark = Decoration.mark({ class: 'tk-warning-mark' });
const errorLine = Decoration.line({ class: 'tk-error-line' });
const eolMark = Decoration.widget({ widget: new EndOfLineMark(), side: 1 });

/** Length of the code point at `pos` (1 or 2 units), 0 at a line break or the end. */
function charLength(state: EditorState, pos: number): number {
  if (pos >= state.doc.length) return 0;
  const text = state.doc.sliceString(pos, Math.min(pos + 2, state.doc.length));
  const c = text.charCodeAt(0);
  if (c === 10) return 0;
  return c >= 0xd800 && c <= 0xdbff && text.length === 2 ? 2 : 1;
}

function build(state: EditorState, marks: readonly IssueMark[], invalid: boolean): MarkState {
  const deco: Range<Decoration>[] = [];
  const gutter: Range<GutterMarker>[] = [];
  const len = state.doc.length;
  let lastWarnLine = -1;
  for (const m of marks) {
    const pos = Math.min(Math.max(0, m.pos), len);
    const line = state.doc.lineAt(pos);
    if (m.severity === 'error') {
      // Implements: F-005.R3 — the error position is marked (one character, or the line end).
      const n = m.length > 0 ? charLength(state, pos) : 0;
      deco.push(n > 0 ? errorMark.range(pos, pos + n) : eolMark.range(pos));
      deco.push(errorLine.range(line.from));
      gutter.push(errorGutter.range(line.from));
    } else {
      // Implements: F-005.R4 — dotted underline over the item; the gutter marks its line.
      const end = Math.min(len, pos + Math.max(1, m.length), line.to);
      if (end > pos) deco.push(warningMark.range(pos, end));
      if (line.number !== lastWarnLine) gutter.push(warningGutter.range(line.from));
      lastWarnLine = line.number;
    }
  }
  return {
    deco: Decoration.set(deco, true),
    gutter: RangeSet.of(gutter, true),
    invalid,
  };
}

const marksField = StateField.define<MarkState>({
  create: () => ({ deco: Decoration.none, gutter: RangeSet.empty, invalid: false }),
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setIssues)) return build(tr.state, e.value.marks, e.value.invalid);
    if (!tr.docChanged) return value;
    return { deco: value.deco.map(tr.changes), gutter: value.gutter.map(tr.changes), invalid: value.invalid };
  },
  provide: (f) => [
    EditorView.decorations.from(f, (v) => v.deco),
    gutterLineClass.from(f, (v) => v.gutter),
    // Implements: NFR-06 — the text box is announced as invalid while the document is.
    EditorView.contentAttributes.from(f, (v): Record<string, string> => (v.invalid ? { 'aria-invalid': 'true' } : {})),
  ],
});

/** The issue-marks extension of CMP-Editor. */
export const issueMarks = marksField;

/** The transaction effect that replaces every mark (the latest validation result). */
export function issuesEffect(marks: readonly IssueMark[], invalid: boolean): StateEffect<unknown> {
  return setIssues.of({ marks, invalid });
}
