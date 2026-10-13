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
