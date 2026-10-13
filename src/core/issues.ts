// MOD-Core issue model (ENT-Issue): codes of RULE-04 / RULE-05, raw issues at editor positions
// as the tokenizer reports them, and resolved issues with line/column/offset per ENT-Issue.
// Imports nothing; no DOM. Wording is MOD-Copy's (issues carry codes and params only).

/** RULE-04 error codes. */
export type ErrorCode =
  | 'trailing-comma'
  | 'comment'
  | 'single-quotes'
  | 'unquoted-key'
  | 'missing-comma'
  | 'missing-colon'
  | 'unclosed-string'
  | 'unclosed-container'
  | 'unexpected-closing'
  | 'invalid-literal'
  | 'invalid-number'
  | 'invalid-escape'
  | 'control-character'
  | 'extra-content'
  | 'empty-document'
  | 'too-deep'
  | 'unexpected-character';

/** RULE-05 warning codes. */
export type WarningCode = 'duplicate-key' | 'unsafe-number' | 'byte-order-mark';

export type IssueCode = ErrorCode | WarningCode;

export type Bracket = '{' | '[' | '}' | ']';

/** An issue as the tokenizer reports it: editor positions (UTF-16 units, one per line break). */
export interface RawIssue {
  code: IssueCode;
  /** Editor position of the reported character (RULE-04 / RULE-05 positions). */
  pos: number;
  /** Length of the item in editor positions (the marked span; 0 at the end of the document). */
  length: number;
  /** `unclosed-container`: the bracket and the editor position it opened at;
   * `unexpected-closing`: the bracket. */
  bracket?: Bracket;
  openPos?: number;
}

/** Hint parameters (ENT-Issue `params`). */
export interface IssueParams {
  bracket?: Bracket;
  /** `unclosed-container`: the line the bracket opened on. */
  line?: number;
}

/** ENT-Issue — an error or warning with its position resolved. */
export interface Issue {
  severity: 'error' | 'warning';
  code: IssueCode;
  /** 1-based line and column per ENT-Issue (columns in code points, BOM not counted). */
  line: number;
  column: number;
  /** 0-based code-point offset from the start of the document, after any byte-order mark. */
  offset: number;
  /** Editor position (for marking and jumping) and the marked span's length. */
  pos: number;
  length: number;
  params?: IssueParams;
}

/** Warnings are capped at 1,000 with a count of the rest (RULE-05). */
export const WARNING_CAP = 1000;

export function severityOf(code: IssueCode): Issue['severity'] {
  return code === 'duplicate-key' || code === 'unsafe-number' || code === 'byte-order-mark' ? 'warning' : 'error';
}
