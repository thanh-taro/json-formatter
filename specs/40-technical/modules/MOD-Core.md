---
id: MOD-Core
title: JSON core — tokenizer, validator, formatter, re-indenter, paths
status: draft
depends_on: []
---

## Responsibility
All JSON knowledge of the tool, as pure, synchronous, dependency-free TypeScript that runs in
the worker (and, for small pure helpers, on the main thread). One iterative, table-driven
tokenizer (explicit container stack, no recursion; ADR-0005) that consumes the document as a
sequence of string chunks and can suspend and resume at any boundary. On top of it: strict
validation (RULE-03, RULE-04 first error with exact positions, RULE-05 warnings capped at
1,000, RULE-14 depth), beautify (RULE-07) and minify (RULE-08) that emit only exact input
token slices plus generated whitespace (INV-01 by construction), re-indent (RULE-09) for
valid or invalid text, document facts (UTF-8 byte length, line count, dominant line ending,
trailing line break, beautified-size prediction per indent), the tree skip table and
"children of container" scans (ADR-0007), and the RULE-06 path formatter.

## Not responsible for
- Threads, messages, scheduling, cancellation policy (MOD-Worker) — Core only exposes
  resumable steps with a work budget.
- Any DOM, editor, file or clipboard API.
- User-facing text: issues carry codes and params; wording comes from MOD-Copy.

## Public surface
- `Tokenizer` — resumable state machine: `feed(chunk)`, `end()`, emits tokens with editor
  offsets (UTF-16 units, one per line break).
- `validate(source, budget)` → resumable job → `ValidationResult` { validity, first error or
  warnings (code, offset, params), warning overflow count, facts, optional skip table }.
- `resolvePositions(source, offsets, lineEnding)` → line/column in code points and spec
  offsets per ENT-Issue (one sorted pass).
- `format(source, mode: beautify(indentStyle, lineEnding, finalBreak) | minify, budget)` →
  resumable job emitting output chunks.
- `reindent(source, target)` → detection result (unit or "none") and resumable conversion.
- `scanChildren(source, containerSpan, fromIndex, count, skipTable)` → rows (kind, key and
  value previews, spans, child counts).
- `formatPath(segments)` (RULE-06), `classifyNumber(text)` (RULE-05 unsafe-number),
  `utf8Length(text)`, `detectLineEnding(text)`.
- `source` is an abstraction over "iterate string chunks from offset" so the same code reads a
  worker mirror, a test string, or a stream.

## Implements
F-002.R1, F-002.R3, F-003.R1, F-003.R2, F-004.R1, F-004.R2, F-004.R3, F-004.R5,
F-005.R3, F-005.R4, F-005.R6 (facts), F-006.R2, F-006.R4, F-006.R5 (source spans);
INV-01; RULE-03, RULE-04, RULE-05, RULE-06, RULE-07, RULE-08, RULE-09, RULE-11, RULE-14;
NFR-03 (throughput), NFR-08 (conformance, round trips).
