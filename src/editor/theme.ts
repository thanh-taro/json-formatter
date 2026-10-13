// CMP-Editor theme (ADR-0004 shadow-root mount, ADR-0011 tokens): defined with the engine's theme
// API so its rules land in a constructable stylesheet inside the shadow root (CSP-clean), and
// bound to the portal tokens as inherited CSS custom properties — a theme change needs no
// reconfiguration.
import { HighlightStyle } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { tokenVar as v } from '../app/styles/tokens.gen';

export const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    color: v('color.fg'),
    backgroundColor: v('color.bg'),
    fontSize: v('font.size.code'),
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: v('font.family.mono'),
    lineHeight: v('size.codeLine'),
  },
  '.cm-content': {
    padding: `${v('space.1')} 0`,
    caretColor: v('color.accent'),
  },
  '.cm-line': { padding: `0 ${v('space.3')}` },
  '&.cm-focused .cm-cursor': { borderLeftColor: v('color.accent'), borderLeftWidth: v('border.width.focus') },
  '.cm-cursor': { borderLeftColor: v('color.accent') },
  '.cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
    backgroundColor: v('color.selection'),
  },
  '.cm-content ::selection': { backgroundColor: v('color.selection') },
  '.cm-gutters': {
    minWidth: v('space.12'),
    backgroundColor: v('color.surface'),
    color: v('color.muted'),
    borderRight: `${v('border.width.hairline')} solid ${v('color.line')}`,
  },
  '.cm-lineNumbers .cm-gutterElement': { padding: `0 ${v('space.2')} 0 ${v('space.3')}` },
  '.cm-activeLine': { backgroundColor: v('color.currentLine') },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: v('color.fg') },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
    backgroundColor: v('color.selection'),
    outline: `${v('border.width.hairline')} solid ${v('color.selectionLine')}`,
  },
  // CMP-Editor "loading" / busy: read-only, text muted (design: `.ro`).
  '&.tk-busy .cm-content': { color: v('color.muted') },
});

/** Normal-tier syntax colours (RULE-02: dropped in the large tiers). */
export const jsonHighlight = HighlightStyle.define([
  { tag: tags.propertyName, color: v('color.syntaxKey') },
  { tag: tags.string, color: v('color.syntaxString') },
  { tag: tags.number, color: v('color.syntaxNumber') },
  { tag: [tags.bool, tags.null], color: v('color.syntaxLiteral') },
  { tag: [tags.separator, tags.brace, tags.squareBracket, tags.punctuation], color: v('color.syntaxPunct') },
]);
