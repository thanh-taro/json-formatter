// MOD-Core indent styles and format modes (ENT-IndentStyle, RULE-01), shared by the formatter
// (format.ts, validate.ts), the worker protocol and the toolbar's indent selector. Imports nothing.
// Implements: RULE-01, F-002.R2.

/** ENT-IndentStyle (RULE-01): 1–8 spaces, or one tab (same shape as F-004's re-indent target). */
export type IndentStyle = { kind: 'spaces'; width: number } | { kind: 'tab' };

/** RULE-01: the default indent style is 2 spaces. */
export const DEFAULT_INDENT: IndentStyle = { kind: 'spaces', width: 2 };
/** RULE-01: custom indents are 1 to 8 spaces. */
export const MIN_CUSTOM_WIDTH = 1;
export const MAX_CUSTOM_WIDTH = 8;

/** The text of one indentation level. */
export function indentText(style: IndentStyle): string {
  return style.kind === 'tab' ? '\t' : ' '.repeat(Math.min(MAX_CUSTOM_WIDTH, Math.max(MIN_CUSTOM_WIDTH, style.width)));
}

/** What a format job produces: beautify with an indent style (RULE-07) or minify (RULE-08). */
export type FormatMode = { kind: 'beautify'; indent: IndentStyle } | { kind: 'minify' };

/** Where formatted output goes: flat chunks of about `chunkUnits` UTF-16 units. */
export interface FormatSink {
  emit: (chunk: string) => void;
  /** Output is emitted once the buffer reaches this many units (default ~1 M, ADR-0005 §1). */
  chunkUnits?: number;
}
