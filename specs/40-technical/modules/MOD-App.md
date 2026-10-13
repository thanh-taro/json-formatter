---
id: MOD-App
title: App shell — SCR-Formatter, state, operation orchestration
status: draft
depends_on: [MOD-Editor, MOD-Tree, MOD-Worker, MOD-Host, MOD-IO, MOD-Copy]
---

## Responsibility
The Preact shell of SCR-Formatter (ADR-0002): layout regions and states (default, empty,
loading, error, large), CMP-Toolbar (groups, indent selector incl. custom 1–8, view switch,
overflow menu at narrow widths, disabled/busy states), CMP-StatusBar (validity live region,
size and lines, cursor, privacy badge and details popover), CMP-IssuePanel (error or up to
1,000 warnings plus overflow line, jump to position), CMP-DropOverlay, the very-large
confirmation dialog, notices and toasts. Holds app state in signals: document facts
(ENT-Document: source name, line ending, final break, tier, validity, issues), current
version, busy operation with progress and cancel, last tool operation (for RULE-10), view.
Orchestrates every operation end to end: tier evaluation and confirmation (RULE-02), starting
worker jobs, showing progress after 0.5 s and cancel, committing or discarding pending
documents, refusing beautify/minify on invalid documents and focusing the first error,
notices shown once (large tier, undo trimmed), announcements (errors once per new error).

## Not responsible for
- JSON logic (MOD-Core), threads (MOD-Worker), editor internals (MOD-Editor), tree rendering
  (MOD-Tree), browser I/O (MOD-IO), host messages (MOD-Host), strings (MOD-Copy).

## Public surface
- `main.tsx` entry: mounts the shell, starts MOD-Host and the worker client.
- Internal operation controller: `run(operation)` with a uniform busy/progress/cancel/undo
  contract used by load, clear, beautify, minify, re-indent, copy, download, tree build.

## Implements
F-001.R4, F-002.R2, F-002.R4, F-002.R6, F-003.R3, F-004.R5 (notice), F-005.R2, F-005.R5,
F-005.R6, F-006.R1, F-006.R7, F-007.R1 (confirmation), F-007.R6, F-008.R3, F-009.R1,
F-009.R2; INV-03, INV-05; RULE-01, RULE-02; NFR-02, NFR-05, NFR-06, NFR-07; SCR-Formatter.
