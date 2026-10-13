// MOD-Core validation result (MOD-Core `validate(...)` → `ValidationResult`): the outcome of the
// tokenizer with its positions resolved into ENT-Issue values. Imports nothing outside MOD-Core.
import { severityOf, type Issue, type RawIssue } from './issues';
import { PositionResolver, type Position } from './positions';
import type { LineEnding } from './text';
import { Validator, type ValidationOutcome, type ValidatorOptions } from './validate';

/** What the UI needs to show about a validated document (ENT-Document `validity`, `issues`). */
export interface ValidationResult {
  validity: 'valid' | 'invalid' | 'empty';
  /** The first error (invalid) or the warnings in document order (valid). */
  issues: Issue[];
  /** RULE-05: warnings beyond the first 1,000. */
  warningOverflow: number;
}

/** The editor positions that must be resolved for an outcome (issue, then any opening bracket). */
export function positionsOf(outcome: ValidationOutcome): number[] {
  if (outcome.error) {
    const e = outcome.error;
    return e.openPos === undefined ? [e.pos] : [e.pos, e.openPos];
  }
  return outcome.warnings.map((w) => w.pos);
}

function toIssue(raw: RawIssue, at: Position, opened?: Position): Issue {
  const issue: Issue = {
    severity: severityOf(raw.code),
    code: raw.code,
    line: at.line,
    column: at.column,
    offset: at.offset,
    pos: raw.pos,
    length: raw.length,
  };
  if (raw.bracket) issue.params = opened ? { bracket: raw.bracket, line: opened.line } : { bracket: raw.bracket };
  return issue;
}

/** Combines an outcome with the positions resolved for `positionsOf(outcome)`. */
export function resultOf(outcome: ValidationOutcome, resolved: readonly Position[]): ValidationResult {
  if (outcome.error)
    return {
      validity: 'invalid',
      issues: [toIssue(outcome.error, resolved[0]!, resolved[1])],
      warningOverflow: 0,
    };
  return {
    validity: outcome.validity,
    issues: outcome.warnings.map((w, i) => toIssue(w, resolved[i]!)),
    warningOverflow: outcome.warningOverflow,
  };
}

/** Validates a whole text given as chunks (tests, small documents): F-005.R3, F-005.R4. */
export function validateText(
  chunks: Iterable<string> | string,
  opts: ValidatorOptions & { lineEnding?: LineEnding } = {},
): ValidationResult & { outcome: ValidationOutcome } {
  const list = typeof chunks === 'string' ? [chunks] : [...chunks];
  const v = new Validator(opts);
  for (const c of list) if (!v.feed(c)) break;
  const outcome = v.end();
  const resolver = new PositionResolver(positionsOf(outcome), opts.lineEnding);
  for (const c of list) if (resolver.feed(c)) break;
  return { ...resultOf(outcome, resolver.end()), outcome };
}
