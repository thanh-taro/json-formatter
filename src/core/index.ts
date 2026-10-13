// MOD-Core — iterative tokenizer, validator, formatter, re-indent, paths, tree scans (ADR-0005).
// Pure: imports nothing, no DOM, no network. Runs in the worker; pure helpers also on main.
export {
  MB,
  tierOf,
  isLargeTier,
  eolText,
  utf8Length,
  LineBreakScanner,
  dominantLineEnding,
  documentBytes,
  type Tier,
  type LineEnding,
  type BreakCounts,
} from './text';
export {
  WARNING_CAP,
  severityOf,
  type ErrorCode,
  type WarningCode,
  type IssueCode,
  type Bracket,
  type RawIssue,
  type Issue,
  type IssueParams,
} from './issues';
export { classifyNumber } from './numbers';
export {
  Validator,
  MAX_DEPTH,
  SKIP_THRESHOLD,
  decodeKey,
  type SkipTable,
  type ValidatorOptions,
  type ValidationOutcome,
} from './validate';
export { PositionResolver, resolvePositions, type Position } from './positions';
export { positionsOf, resultOf, validateText, type ValidationResult } from './result';
export {
  IndentScanner,
  Reindenter,
  detectUnit,
  reindentDelta,
  reindentText,
  type IndentStyle,
  type IndentStats,
  type SourceUnit,
} from './reindent';
