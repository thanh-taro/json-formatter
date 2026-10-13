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

/**
 * Implements: RULE-01 — a valid ENT-IndentStyle from any input (F-004 review MJ-1): a spaces
 * width that is not a finite number falls back to the default 2; otherwise it is truncated to an
 * integer and clamped to 1–8. Re-indent and the indent selector go through this (a width of NaN
 * would strip all indentation).
 */
export function indentStyle(style: IndentStyle): IndentStyle {
  if (style.kind === 'tab') return { kind: 'tab' };
  const w = Number(style.width);
  if (!Number.isFinite(w)) return { ...DEFAULT_INDENT };
  return { kind: 'spaces', width: Math.min(MAX_CUSTOM_WIDTH, Math.max(MIN_CUSTOM_WIDTH, Math.trunc(w))) };
}

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
