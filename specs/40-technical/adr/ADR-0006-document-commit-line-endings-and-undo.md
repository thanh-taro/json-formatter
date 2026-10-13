---
id: ADR-0006
title: Chunked document commit, line endings, and bounded undo history
status: accepted
date: 2026-10-13
supersedes: []
---

## Context
Loading a 100 MB file, pasting 100 MB, or applying a 100 MB beautify result must not freeze
the main thread (NFR-02, NFR-04), must leave the previous document untouched on cancel or
failure (INV-03), and must be undoable in one step within RULE-15 limits (INV-04). Peak memory
is bounded by NFR-04. Building a 100 MB editor document from one string (split into
millions of lines) is a multi-hundred-millisecond long task. Editors normalise line breaks
internally; RULE-07 and F-004.R2 talk about "the document's line ending".
SP-pipeline measured one editor `Text` of a formatted 100 MB document at ~245 MB (2.45× the
bytes), so keeping three previous documents in memory costs ~735 MB on top of the current
and pending ones.

## Decision
1. **Chunked commit.** Incoming text (file chunks from the worker, formatter output chunks, a
   large paste, an undo reload) is appended to a *pending* editor `Text` in bounded slices
   (each ≤ ~8 ms of main-thread work, yielding between slices; partial last lines carried
   over between chunks). Nothing is shown until the pending text is complete; then a single
   transaction replaces the document (one undo step) and the worker adopts the same version.
   Cancel or failure discards the pending text — the visible document was never touched
   (INV-03).
2. **Large paste** (> 1 MB of clipboard text) is intercepted and routed through the same path,
   including the RULE-02 very-large confirmation (F-001.AC11) based on the UTF-8 byte length.
3. **Line endings.** The editor splits on LF, CRLF and lone CR (same rule as ENT-Issue).
   the `lineEnding` of ENT-Document (dominant of LF/CRLF, LF if none) is detected on load/paste and
   kept in app state; text leaving the editor (copy, download, worker export) is joined with
   it; beautify inserts it (RULE-07). **Consequence: a document with mixed line endings is
   written out with uniform line endings** (RULE-17, D-015). Uniform LF or CRLF documents
   round-trip exactly (F-001 edge case).
4. **Undo history** is a custom editor state field (MOD-Editor):
   - normal tier: at least the last 100 changes (typing grouped by pause, like a standard
     editor), stored as inverted change sets (structure-shared, so a whole-document
     replacement costs a reference to the old `Text`, not a copy; 10 MB session peak 289 MB);
   - **large / very-large tiers: the undo entry of every tool operation (load, clear,
     beautify, minify, re-indent) stores the previous document as a worker-built UTF-8
     `Blob`** (exported from the mirror before the operation's result is adopted; outside the
     JS heap, and browsers may page large Blobs to disk). This is **mandatory**, not a
     fallback. Typing entries between tool operations keep in-memory change sets.
   - **Undo of a tool operation in the large tiers is a reload**: the Blob is posted to the
     worker, read in 1 MB slices (ADR-0005), validated, and streamed back through the chunked
     commit with progress after 0.5 s and cancel (NFR-02). The worker's mirror is rebuilt by
     the same reload, so it never desynchronises. Before the reload, the current document is
     exported as a Blob for the redo entry. Measured at 100 MB: 0.4–1.1 s (Chromium),
     0.3–1.2 s (WebKit), 0.4–1.0 s (Firefox).
   - RULE-15: when a 4th marked tool operation is recorded, all history older than the
     3rd-most-recent marked operation is dropped (its Blobs released), and
     COPY-notice.undo_trimmed is shown once (F-001.AC12). Typing events between them stay
     undoable.
   Redo follows the same structure.
5. **Memory policy** (budget table in `architecture.md`, using **~2.45× the bytes per editor
   `Text` copy**): at most one pending document at a time; the worker releases a superseded
   mirror version as soon as the main thread confirms the commit; tool results are streamed
   and released chunk by chunk; large-tier undo snapshots live only as Blobs; nothing is
   cached across versions except the latest validation result, skip table and tree
   checkpoints.

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
- **In-memory `Text` undo snapshots in the large tiers** (the original proposal) — instant
  undo (3–10 ms), but three previous documents cost ~735 MB, and undoing a whole-document
  replacement cannot be sent to the worker as a change set, so the mirror needs a separate
  36–573 ms re-seed. SP-pipeline variants A and C peaked at 1.8–2.3 GB in Chromium. Rejected.

## Consequences
- MOD-Editor owns a document builder and a history field — both pure state logic, unit
  testable without a browser. The history field holds Blob references for large-tier tool
  entries and asks MOD-App to run the reload; undo is therefore asynchronous in the large
  tiers and uses the busy policy (D-005).
- Undo of a 100 MB tool operation takes about as long as loading it (≤ ~1–2 s with
  progress); RULE-15 and NFR-02's "progress after 0.5 s" cover this, no spec change needed.
- Building the undo Blob adds an export (~0.1–0.6 s at 100 MB, in the worker) before each
  large-tier tool operation commits.
- Worst-case memory at 100 MB = current + pending editor `Text` (≈ 0.5–0.6 GB on the main
  thread, irreducible during a tool operation) + compact mirror and pending mirror in the
  worker + Blobs outside the JS heap; measured Chromium peak with this design (variant E)
  1.30–1.50 GB, settled 0.75 GB after GC. Engine limits beyond that are listed under "Known
  limits" in `architecture.md`.
- Chunked commit confirmed: builder slices typically ≤ 8–14 ms, dispatch of the 100 MB
  replace 2–6 ms, 0 long tasks during load, tool operations, undo and export (Chromium).

## Evidence
- SP-editor report: `.build-my-app/reports/spike-editor.md` (editor side at 100 MB with three
  in-memory snapshots: Chromium heap 607 MB).
- SP-pipeline report: `.build-my-app/reports/spike-pipeline.md` (variants A–E, branch
  `spike/pipeline`, `spikes/pipeline/src/builder.ts`; RULE-15 trimming path: 5 tool
  operations → 2 trims, notice once, undo ×3 restores exact lengths; download byte-identical
  to the fixture after undo ×3; memory-infra breakdown via `memdump.mjs`).

<!-- Accepted ADRs are immutable. Write a new ADR to change a decision. -->
