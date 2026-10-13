---
id: MOD-Worker
title: Worker — document mirror, jobs, file reading, export
status: draft
depends_on: [MOD-Core]
---

## Responsibility
The single dedicated module worker (ADR-0005). Holds the **document mirror** (an editor `Text`
kept in sync from versioned change sets; tool results adopted as the next version without a
round trip), runs one job at a time (validate, format, re-indent, build skip table, tree
queries, load file, export), supersedes stale validation on new edits, debounces validation
by tier, executes long jobs in time slices that yield to the event loop so `cancel` and `edit`
messages are handled within one slice, and reports progress (throttled) and results tagged
with document version and job id. Reads dropped/chosen files by streaming them through a
fatal UTF-8 decoder that keeps a leading byte-order mark (RULE-13, RULE-03), validating while
reading and forwarding decoded chunks. Builds export `Blob`s (whole document or a node span,
joined with the document line ending) for copy and download. Turns allocation failures into a
"too large" outcome instead of crashing (RULE-02, F-001.R9).

## Not responsible for
- JSON semantics (MOD-Core); deciding what the UI shows (MOD-App).
- Undo history and the visible document (MOD-Editor).
- Any network access (forbidden by ADR-0003 lint and ADR-0009 CSP).

## Public surface
Typed message protocol (discriminated unions), shared by main and worker:
- main → worker: `init`, `edit(version, changes)`, `adopt(version, jobId)`,
  `validate(version)`, `format(version, mode)`, `reindent(version, target)`,
  `loadFile(file, jobId)`, `loadText(chunks…)` (large paste), `treeOpen(version)`,
  `treeChildren(version, container, from, count)`, `export(version, span?)`, `cancel(jobId)`.
- worker → main: `progress(jobId, fraction)`, `chunk(jobId, text)`, `validation(version,
  result)`, `formatted(jobId, facts)`, `notIndented(jobId)`, `treeRows(version, …)`,
  `blob(jobId, Blob)`, `failed(jobId, reason: invalid | encoding | too-large | cancelled |
  internal)`.
- Main-side `WorkerClient` wraps the protocol in promise-returning calls with `AbortSignal`
  cancellation and restarts the worker (re-seeding the mirror) on a hard failure.

## Implements
F-001.R5, F-001.R8, F-001.R9, F-002.R6, F-003.R5, F-004.R6, F-005.R1, F-005.R7, F-006.R8,
F-007.R6 (export off the main thread); INV-03, INV-05 (version tagging); RULE-02, RULE-13;
NFR-02, NFR-03, NFR-04 (memory policy).
