---
id: ADR-0004
title: Editor engine — CodeMirror 6 at every size tier
status: proposed
date: 2026-10-13
supersedes: []
---

## Context
D-002 fixes a single editor that is formatted in place with undo. CMP-Editor must, at every
size tier of RULE-02 up to 100 MB (NFR-04): open the document, scroll with no frame > 50 ms,
stay editable with input feedback ≤ 100 ms (NFR-02), mark the error position (F-005.R3), jump
to positions and select spans (F-005.R5, F-006.R6), become read-only while a tool operation
runs (F-002.R6), and support the undo policy of RULE-15. It must also be accessible (NFR-06),
work at 480 px (NFR-07), fit the startup budget (NFR-05) and run under a CSP without
`'unsafe-inline'` styles (ADR-0009). Two shapes of 100 MB document matter: formatted (millions
of short lines) and minified (one 100 MB line).

## Decision
Use **CodeMirror 6** (`@codemirror/state`, `view`, `commands`, `language`, `lang-json`; all
MIT) for the text view at every tier, **subject to SP-editor and SP-pipeline passing**.
- Why it fits: the document is a persistent B-tree of lines (`Text`), so whole-document
  replacement and undo snapshots share structure and cost no copy; the view renders only the
  viewport, uses height-map gaps for off-screen lines, scales very tall documents
  (`BigScaler` above ~7 million px), and hides the off-screen parts of overlong lines with
  "line gaps" (the minified-100 MB case). `@codemirror/state` has no DOM dependency, so the
  same `Text`/`ChangeSet` types run in the worker mirror (ADR-0005). Styles are injected via
  constructable stylesheets, with a CSP nonce facet as fallback.
- **Tier configuration** (switched through a compartment when the tier changes):
  - normal: JSON syntax highlighting (`lang-json`), bracket matching, active-line highlight;
  - large / very large: no syntax tree parsing or highlighting, no bracket matching, line
    wrapping off (permitted by RULE-02; COPY-notice.large shown once).
- **Undo**: our own small history state field (MOD-Editor) replaces `@codemirror/commands`
  history, because RULE-15 needs tier-dependent trimming ("keep at least the last 3 tool
  operations, drop older") that the stock history cannot express. Typing still groups by
  time like the stock history. SP-pipeline confirms this or shows the stock history suffices.
- **Line endings**: the editor splits on LF, CRLF and lone CR (matching ENT-Issue line
  counting); the document's `lineEnding` is tracked separately and used whenever text leaves
  the editor (copy, download, worker export). See ADR-0006 for the mixed-ending consequence.
- Error marker, issue focus and busy read-only state are plain decorations/compartments; the
  stock lint UI is not used.

## Alternatives considered
- **Monaco** (MIT) — excellent large-file model (piece tree) and long-line handling
  (`stopRenderingLineAfter`), but ~1 MB+ compressed for the editor core, which alone breaks the
  NFR-05 budget unless lazy-loaded after first paint; injects `<style>` elements at runtime
  (needs `'unsafe-inline'` or a nonce, which a static host cannot generate per request); weak
  narrow-width behaviour; ships its own JSON language service that would duplicate and
  contradict our strict validator. Kept as the SP-editor comparison and fallback.
- **Custom virtualized read-mostly view above a threshold** — smallest memory, but NFR-04
  requires 100 MB documents to be *editable*, so it would become a second text editor
  (selection, IME, accessibility, undo) — far more risk than either engine.
- **Plain `<textarea>`** — zero dependencies; but no virtualization (browsers lay out the
  whole text: multi-second freezes far below 100 MB), no error decoration, no line numbers.
- **Ace** (BSD-3) — handles large files reasonably, but older architecture, weaker
  accessibility and CSP story than CodeMirror 6, and no worker-safe document model.

## Consequences
- Initial JS stays within budget (CodeMirror core + JSON language ≈ 120–150 KB compressed).
- We own the undo history field and the chunked document commit path (MOD-Editor), both
  covered by tests for INV-04 and RULE-15.
- Mixed line endings are unified on output (ADR-0006) — a spec clarification is requested.
- If SP-editor shows CodeMirror 6 cannot meet NFR-04 on either 100 MB shape, this ADR is
  superseded (Monaco with lazy load and a revised startup budget, or a renegotiated NFR-04).

<!-- Accepted ADRs are immutable. Write a new ADR to change a decision. -->
