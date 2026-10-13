---
id: MOD-Worker
title: Worker — compact document mirror, jobs, file reading, export
status: draft
depends_on: [MOD-Core]
---

## Responsibility
The single dedicated module worker (ADR-0005). Holds the **compact document mirror**: a list
of flat strings of ~1 M UTF-16 units with line breaks normalised to one unit (offsets are
editor positions), ~1× the document bytes, kept in sync from versioned change sets (decoded
with `@codemirror/state`'s `ChangeSet`); **never a CodeMirror `Text`** (2.45× the bytes).
Tool results are built as a pending mirror while they stream out and adopted as the next
version on commit, without a round trip. Runs one job at a time (validate with the skip
table built in the same pass, format, re-indent, standalone skip-table pass when none exists,
tree queries, background checkpoint fill, load file or undo Blob, export), supersedes stale validation on new edits, debounces validation
by tier, executes long jobs in time slices (~16 ms or ~1 MB of input) that yield to the event
loop through a `MessageChannel` tick so `cancel` and `edit` messages are handled within one
slice (≤ 50 ms), posts each slice's output chunks (flat strings from MOD-Core) at the end of
the slice, feeds MOD-Core directly from the mirror's chunks (no windowed copy), and reports
progress (throttled) and results tagged
with document version and job id. Reads dropped/chosen files and large-tier undo Blobs in
**1 MB `slice().arrayBuffer()` windows** (never `Blob.stream()` or a whole-Blob read: WebKit
fails on in-memory Blobs above ~100–120 MB), decoding through a
fatal UTF-8 decoder that keeps a leading byte-order mark (RULE-13, RULE-03), validating while
reading, rebuilding the mirror and forwarding decoded chunks. Builds export `Blob`s (whole
document or a node span, joined with the document line ending) for copy, download and
large-tier undo/redo snapshots (ADR-0006). Answers tree child queries from the mirror using
the skip table and per-container checkpoints, filling checkpoints in the background in ≤ 8 ms
slices, most recently expanded container first; long cold scans yield (ADR-0007). Turns allocation failures into a
"too large" outcome instead of crashing (RULE-02, F-001.R9).

## Not responsible for
- JSON semantics (MOD-Core); deciding what the UI shows (MOD-App).
- Undo history and the visible document (MOD-Editor).
- Any network access (forbidden by ADR-0003 lint and ADR-0009 CSP).

## Public surface
Typed message protocol (discriminated unions), shared by main and worker:
- main → worker: `init`, `edit(version, changes)`, `adopt(version, jobId)`,
  `validate(version)`, `format(version, mode)`, `reindent(version, target)`,
  `loadFile(file, jobId)`, `loadBlob(blob, jobId)` (large-tier undo/redo reload),
  `loadText(chunks…)` (large paste), `treeOpen(version)`,
  `treeChildren(version, container, from, count)`, `export(version, span?)`, `cancel(jobId)`.
- worker → main: `progress(jobId, fraction)`, `chunk(jobId, text)`, `validation(version,
  result)`, `formatted(jobId, facts)`, `notIndented(jobId)`, `treeRows(version, …)`,
  `blob(jobId, Blob)`, `failed(jobId, reason: invalid | encoding | too-large | cancelled |
  internal)`.
- Main-side `WorkerClient` wraps the protocol in promise-returning calls with `AbortSignal`
  cancellation. Its **watchdog** expects a message for every running job at least every 1 s
  (the worker can die silently in WebKit); on a miss, a cancel ignored for > 1 s or an
  `error` event it terminates and restarts the worker (same-origin module file, no `blob:`
  URL), re-seeds the mirror and fails the job with `internal` so the caller discards any
  pending document.

## Implements
F-001.R5, F-001.R8, F-001.R9, F-002.R6, F-003.R5, F-004.R6, F-005.R1, F-005.R7, F-006.R8,
F-007.R6 (export off the main thread); INV-03, INV-05 (version tagging); RULE-02, RULE-13;
NFR-02, NFR-03, NFR-04 (memory policy).
