---
id: MOD-Editor
title: Editor — text view, chunked commit, undo history, tiers
status: draft
depends_on: [MOD-Core, MOD-Copy]
---

## Responsibility
Owns the visible document and CMP-Editor on top of the editor engine (ADR-0004): creates the
view **inside a shadow root** on its host element (so the engine's styles use constructable
stylesheets under the CSP) and defines the editor theme with the engine's theme API reading
inherited token variables; switches tier configuration (highlighting and bracket matching only
in the normal tier ≤ 10 MB, D-022; RULE-02); keeps the view laid out when hidden
(`visibility:hidden`, never `display:none`) so commits stay viewport-bounded; handles typed
input on lines ≥ 100,000 characters itself (`beforeinput`, not composing) to avoid the engine's
O(line) DOM diff; marks the error position and focuses issues, moves the cursor and
scrolls to a position, selects a span (reveal, select-all fallback), switches to read-only
while a tool operation runs (scroll stays available, D-005), and exposes document changes as
versioned change sets for the worker mirror. Provides the **document builder** that appends
incoming chunks to a pending text in ≤ ~8 ms slices and commits it as one transaction, or
discards it on cancel (ADR-0006, INV-03). Owns the **history field** implementing RULE-15
(≥ 100 changes in the normal tier, in memory; in large tiers keep the last 3 tool operations,
trim older history, report trimming once) and labels each tool transaction (load, clear,
beautify, minify, re-indent). In the large tiers a tool operation's undo and redo entries hold
the previous document **only as a worker-built UTF-8 `Blob`** (mandatory, ADR-0006), never an
in-memory `Text` (~245 MB per copy at 100 MB, 2.45× the bytes); undoing one is a reload
through the document builder, run by MOD-App with progress and cancel (0.4–1.1 s at 100 MB).
Typing entries stay in-memory change sets. Intercepts large pastes (> 1 MB) and routes them through the builder and
the very-large confirmation. Tracks cursor position for the status bar. Provides the **find
engine** (F-010, RULE-18): windowed (~1 MB), time-sliced (≤ 8 ms) literal search over the
current `Text` with a length-preserving case fold, first match selected and scrolled into
view as soon as found, total counted in later slices and restarted on document change, match
decorations; the stock search package is not used.

## Not responsible for
- Validation or formatting (MOD-Worker/MOD-Core); deciding when operations run (MOD-App).
- Clipboard, files, downloads (MOD-IO).
- The find panel UI (CMP-SearchPanel in MOD-App).

## Public surface
- `createEditor(container, options)` → `EditorHandle` with: `version`, `onChange(cb)`,
  `onCursor(cb)`, `setTier(tier)`, `setBusy(bool)`, `markIssue(issue | null)`,
  `goTo(offset)`, `select(span)`, `selectAll()`, `relabel()` (accessible name and the editor's built-in
  phrases — COPY-editor.selection_deleted, COPY-editor.control_character — in the active language via a compartment; document, selection and history untouched; ADR-0014), `beginReplace(kind)` → `PendingDocument`
  { `append(chunk)`, `commit(facts)` (checks the length the worker built), `discard()` },
  `beginPaste(from, to, lineEnding)` (large paste or external text drop, ADR-0006 §2),
  `clear()`, `undo()`, `redo()` (both return either "applied" or a reload request carrying the
  entry's Blob, for MOD-App to run, with `abort` on cancel and `drop` when the Blob cannot be
  restored), an injected `snapshot()` option instead of `attachUndoBlob(blob)` (the editor asks
  for the Blob of the current document before the change it protects), `chunks()` (worker
  re-seed), change events tagged with how the mirror follows (`edit`, `adopt`, `reseed`),
  `onHistoryTrimmed(cb)`, `lineCount`, `lineEnding` (detected on load/paste),
  `setHidden(bool)` (visibility-based),
  `find(term, { matchCase })` → `FindSession` { `onFirst(cb)`, `onCount(cb)`, `next()`,
  `previous()`, `close()` }.
- Editor theme bound to CSS variables inherited into the shadow root (no reconfiguration on
  theme change).

## Implements
F-001.R1, F-001.R6, F-001.R7, F-001.R4 (large paste path), F-002.R4 (focus error),
F-002.R5, F-003.R4, F-004.R4, F-005.R3 (marker), F-005.R5, F-006.R6 (select span),
F-007.R3 (select all), F-010.R2, F-010.R3, F-010.R4, F-010.R5, F-010.R6; F-012.R2 (relabel); INV-03, INV-04;
RULE-02 (visual reduction), RULE-15, RULE-18;
NFR-02, NFR-04, NFR-06 (editor accessibility: label COPY-label.editor, Tab escape).
