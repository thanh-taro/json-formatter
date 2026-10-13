---
id: MOD-Editor
title: Editor — text view, chunked commit, undo history, tiers
status: draft
depends_on: [MOD-Core, MOD-Copy]
---

## Responsibility
Owns the visible document and CMP-Editor on top of the editor engine (ADR-0004): creates and
configures the view, switches tier configuration (highlighting and bracket matching only in
the normal tier, RULE-02), marks the error position and focuses issues, moves the cursor and
scrolls to a position, selects a span (reveal, select-all fallback), switches to read-only
while a tool operation runs (scroll stays available, D-005), and exposes document changes as
versioned change sets for the worker mirror. Provides the **document builder** that appends
incoming chunks to a pending text in ≤ ~8 ms slices and commits it as one transaction, or
discards it on cancel (ADR-0006, INV-03). Owns the **history field** implementing RULE-15
(≥ 100 changes in the normal tier; in large tiers keep the last 3 tool operations, trim older
history, report trimming once) and labels each tool transaction (load, clear, beautify,
minify, re-indent). Intercepts large pastes (> 1 MB) and routes them through the builder and
the very-large confirmation. Tracks cursor position for the status bar.

## Not responsible for
- Validation or formatting (MOD-Worker/MOD-Core); deciding when operations run (MOD-App).
- Clipboard, files, downloads (MOD-IO).

## Public surface
- `createEditor(container, options)` → `EditorHandle` with: `version`, `onChange(cb)`,
  `onCursor(cb)`, `setTier(tier)`, `setBusy(bool)`, `markIssue(issue | null)`,
  `goTo(offset)`, `select(span)`, `selectAll()`, `beginReplace(kind)` → `PendingDocument`
  { `append(chunk)`, `commit()`, `discard()` }, `clear()`, `undo()`, `redo()`,
  `onHistoryTrimmed(cb)`, `lineCount`, `lineEnding` (detected on load/paste).
- Editor theme bound to CSS variables (no reconfiguration on theme change).

## Implements
F-001.R1, F-001.R6, F-001.R7, F-001.R4 (large paste path), F-002.R4 (focus error),
F-002.R5, F-003.R4, F-004.R4, F-005.R3 (marker), F-005.R5, F-006.R6 (select span),
F-007.R3 (select all); INV-03, INV-04; RULE-02 (visual reduction), RULE-15;
NFR-02, NFR-04, NFR-06 (editor accessibility: label COPY-label.editor, Tab escape).
