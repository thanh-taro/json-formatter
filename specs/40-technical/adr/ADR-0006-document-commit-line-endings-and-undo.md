---
id: ADR-0006
title: Chunked document commit, line endings, and bounded undo history
status: proposed
date: 2026-10-13
supersedes: []
---

## Context
Loading a 100 MB file, pasting 100 MB, or applying a 100 MB beautify result must not freeze
the main thread (NFR-02, NFR-04), must leave the previous document untouched on cancel or
failure (INV-03), and must be undoable in one step within RULE-15 limits (INV-04). Peak memory
must stay < 1.5 GB (NFR-04). Building a 100 MB editor document from one string (split into
millions of lines) is a multi-hundred-millisecond long task. Editors normalise line breaks
internally; RULE-07 and F-004.R2 talk about "the document's line ending".

## Decision
1. **Chunked commit.** Incoming text (file chunks from the worker, formatter output chunks, a
   large paste) is appended to a *pending* editor `Text` in bounded slices (each ≤ ~8 ms of
   main-thread work, yielding between slices; partial last lines carried over between
   chunks). Nothing is shown until the pending text is complete; then a single transaction
   replaces the document (one undo step) and the worker adopts the same version. Cancel or
   failure discards the pending text — the visible document was never touched (INV-03).
2. **Large paste** (> 1 MB of clipboard text) is intercepted and routed through the same path,
   including the RULE-02 very-large confirmation (F-001.AC11) based on the UTF-8 byte length.
3. **Line endings.** The editor splits on LF, CRLF and lone CR (same rule as ENT-Issue).
   the `lineEnding` of ENT-Document (dominant of LF/CRLF, LF if none) is detected on load/paste and
   kept in app state; text leaving the editor (copy, download, worker export) is joined with
   it; beautify inserts it (RULE-07). **Consequence: a document with mixed line endings is
   written out with uniform line endings.** Uniform LF or CRLF documents round-trip exactly
   (F-001 edge case). A spec clarification is requested (see `architecture.md`, open issues).
4. **Undo history** is a custom editor state field (MOD-Editor) storing inverted change sets
   (structure-shared, so a whole-document replacement costs a reference to the old `Text`, not
   a copy):
   - normal tier: at least the last 100 changes (typing grouped by pause, like a standard
     editor);
   - large / very-large tiers: every tool operation (load, clear, beautify, minify,
     re-indent) is marked; when a 4th marked operation is recorded, all history older than the
     3rd-most-recent marked operation is dropped, and COPY-notice.undo_trimmed is shown once
     (RULE-15, F-001.AC12). Typing events between them stay undoable.
   Redo follows the same structure.
5. **Memory policy** (budget table in `architecture.md`): at most one pending document at a
   time; the worker releases a superseded mirror version as soon as the main thread confirms
   the commit; tool results are streamed and released chunk by chunk; nothing is cached across
   versions except the latest validation result and tree index.

## Alternatives considered
- **Single synchronous replace** — simplest; measured 100 MB builds are long tasks of several
  hundred ms (violates NFR-02/NFR-04 "no frame > 50 ms").
- **Preserve mixed line endings exactly** by configuring a single line separator — other
  break characters would then render as in-line control characters and line numbers would
  disagree with ENT-Issue counting; or a custom line model — out of proportion for a rare case.
- **Stock editor history with a small depth in large tiers** — cannot keep "the last 3 tool
  operations" when typing happens in between; and cannot report trimming to the user.
- **Snapshot stack outside the editor** for tool operations — two undo stacks interleaved by
  time; more complex than one history field with markers.

## Consequences
- MOD-Editor owns a document builder and a history field — both pure state logic, unit
  testable without a browser.
- Spec clarification needed for mixed line endings (user decision).
- Worst-case memory at 100 MB = current + up to 3 historical documents + mirror + transient
  pending/result (estimate ≈ 1.2 GB for a formatted 100 MB ASCII document, `architecture.md`).
  SP-pipeline verifies peak < 1.5 GB. **Fallback if it does not fit**: in the large tiers a
  tool operation's undo entry stores the previous document as a worker-built UTF-8 `Blob`
  (outside the JS heap; browsers may page large blobs to disk) instead of an in-memory `Text`;
  undoing it re-enters the chunked load path with progress. RULE-15 is still met; undo of a
  100 MB operation then takes about as long as loading it.

<!-- Accepted ADRs are immutable. Write a new ADR to change a decision. -->
