// MOD-Core beautify / minify (ADR-0005 §1): the formatter is the validator's state machine with
// an emitter plugged in (`ValidatorOptions.format`, validate.ts), so it emits only exact slices
// of input tokens plus generated whitespace — lossless by construction (INV-01) — and refuses an
// invalid document with the validator's first error (INV-03). This file holds the size prediction
// made from validation facts and a whole-text helper for tests (indent styles: indent.ts).
// Implements: RULE-01, RULE-02 (beautified size), RULE-07, RULE-08; F-002.R1, F-002.R2, F-002.R3,
// F-003.R1, F-003.R2.
import { indentText, type FormatMode, type FormatSink, type IndentStyle } from './indent';
import type { LineEnding } from './text';
import { Validator, type LayoutFacts, type ValidationOutcome } from './validate';

/**
 * Implements: RULE-02 / F-002.R7 — the UTF-8 size of the beautified document, from the layout
 * facts of the validation pass, without formatting: token bytes (the document's bytes outside
 * line breaks minus its blanks) + one space per colon + the indentation of every generated line
 * + the line breaks (the final one only if the input ended with one, RULE-07).
 */
export function beautifiedBytes(
  layout: LayoutFacts,
  nonBreakBytes: number,
  indent: IndentStyle,
  eol: LineEnding,
): number {
  const tokenBytes = nonBreakBytes - layout.blanks;
  const breaks = layout.breaks + (layout.endsWithLineBreak ? 1 : 0);
  return tokenBytes + layout.colons + layout.depthSum * indentText(indent).length + breaks * (eol === 'crlf' ? 2 : 1);
}

/**
 * Formats a whole text given as chunks (tests and small helpers); the worker drives the same
 * `Validator` slice by slice. `output` is empty when the input is refused.
 */
export function formatText(
  chunks: Iterable<string> | string,
  mode: FormatMode,
  eol = '\n',
  sink?: FormatSink,
): { outcome: ValidationOutcome; output: string } {
  const parts: string[] = [];
  const v = new Validator({
    warnings: false,
    format: { mode, eol, emit: sink?.emit ?? ((c) => parts.push(c)), chunkUnits: sink?.chunkUnits ?? 1 << 20 },
  });
  for (const c of typeof chunks === 'string' ? [chunks] : chunks) if (!v.feed(c)) break;
  const outcome = v.end();
  return { outcome, output: outcome.validity === 'valid' ? parts.join('') : '' };
}
