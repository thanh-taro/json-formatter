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
  type LayoutFacts,
  type OutputFacts,
} from './validate';
export {
  DEFAULT_INDENT,
  MIN_CUSTOM_WIDTH,
  MAX_CUSTOM_WIDTH,
  indentStyle,
  indentText,
  type IndentStyle,
  type FormatMode,
  type FormatSink,
} from './indent';
export { beautifiedBytes, formatText } from './format';
export { PositionResolver, resolvePositions, type Position } from './positions';
export { positionsOf, resultOf, validateText, type ValidationResult } from './result';
export {
  KIND_OBJECT,
  KIND_ARRAY,
  KIND_STRING,
  KIND_NUMBER,
  KIND_TRUE,
  KIND_FALSE,
  KIND_NULL,
  GROUP,
  PREVIEW_MAX,
  TreeIndex,
  formatPath,
  groupSize,
  isContainer,
  kindName,
  type NodeKind,
  type TreeItem,
  type ContainerRef,
} from './tree';
export {
  IndentScanner,
  Reindenter,
  detectUnit,
  reindentDelta,
  reindentIsNoop,
  reindentText,
  type IndentStats,
  type SourceUnit,
} from './reindent';
