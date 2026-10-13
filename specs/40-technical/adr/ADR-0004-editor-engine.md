---
id: ADR-0004
title: Editor engine — CodeMirror 6 at every size tier, shadow-root mounted
status: proposed
date: 2026-10-13
supersedes: []
---

## Context
D-002 fixes a single editor that is formatted in place with undo. CMP-Editor must, at every
size tier of RULE-02 up to 100 MB (NFR-04): open the document, scroll with no frame > 50 ms,
stay editable with input feedback ≤ 100 ms (NFR-02), mark the error position (F-005.R3), jump
to positions and select spans (F-005.R5, F-006.R6), become read-only while a tool operation
runs (F-002.R6), find text responsively (F-010.R6) and support the undo policy of RULE-15. It
must also be accessible (NFR-06), work down to 360 px (NFR-07), fit the startup budget (NFR-05)
and run under a CSP without `'unsafe-inline'` styles (ADR-0009). Two shapes of 100 MB document
matter: formatted (millions of short lines) and minified (one 100 MB line).

SP-editor (2026-10-13) measured CodeMirror 6 and Monaco at 1–100 MB in a cross-origin frame
under the ADR-0009 CSP. CodeMirror 6 passed open, typing, error marker, replace/undo and memory
in Chromium at 50 and 100 MB, but only after the adaptations below. D-022 keeps syntax
colouring up to 10 MB and accepts lag between about 2 and 10 MB (NFR-02 exception).

## Decision
Use **CodeMirror 6** (`@codemirror/state`, `view`, `commands`, `language`, `lang-json`; all
MIT) for the text view at every tier.
- Why it fits: the document is a persistent B-tree of lines (`Text`), so whole-document
  replacement and undo snapshots share structure (measured: whole replace ≤ 23 ms, undo ≤ 17 ms
  at 100 MB); the view renders only the viewport, uses height-map gaps for off-screen lines,
  scales very tall documents (`BigScaler`) and hides the off-screen parts of overlong lines with
  line gaps (the minified-100 MB line becomes a 2.5 M px scroll width, end reachable).
  `@codemirror/state` has no DOM dependency, so the same `Text`/`ChangeSet` types run in the
  worker mirror (ADR-0005).
- **Shadow-root mount (mandatory)**: the view is created with `parent` and `root` set to a
  `ShadowRoot` on the editor host element. `style-mod` uses constructable (adopted)
  stylesheets only when its root is a shadow root; on a `Document` it inserts a `<style>`
  element, which `style-src 'self'` blocks, leaving the editor unstyled and broken (renders
  every line on replace, then throws). With the shadow mount: 0 CSP violations in Chromium and
  WebKit. Consequences: the editor's theme is defined through `EditorView.theme` /
  `baseTheme` and reads the portal tokens as inherited CSS custom properties (page CSS does
  not pierce the shadow root); there is no nonce fallback (a static host cannot mint
  per-response nonces).
- **Never `display:none` while the document can change**: a hidden view treats the whole
  changed range as its viewport and renders every line (10 MB: 1.5 s, 568k DOM lines, no
  recovery). When the tree view is shown (F-006), the text view is kept laid out and hidden
  with `visibility:hidden` (plus `inert`), so beautify/minify/load can still commit to it
  (measured 10–13 ms, 72 lines).
- **Tier configuration** (switched through a compartment when the tier changes):
  - normal (≤ 10 MB, D-022): JSON syntax highlighting (`lang-json`), bracket matching,
    active-line highlight. Clean at 1 MB; between about 2 and 10 MB far jumps trigger Lezer's
    ~100 ms viewport parse and typing inside multi-MB lines exceeds 50 ms p95 — accepted
    (NFR-02 exception, D-022); no 2 MB tier is introduced;
  - large / very large (> 10 MB): no syntax tree parsing or highlighting, no bracket matching,
    no `highlightSpecialChars`, no active-line highlight, line wrapping off (permitted by
    RULE-02; COPY-notice.large shown once).
  - narrow (< 600 px, D-019): soft wrap on in the normal tier. Assumption, not measured: in
    the large tiers wrapping stays off even when narrow (a wrapped 100 MB line defeats line
    gaps; RULE-02 permits the reduction) — SP-pipeline confirms.
- **Direct-input handler for long lines**: CodeMirror reads typed text back from the DOM and
  diffs the whole line (`findDiff`, ~2.5 ms per MB: 270 ms per key on a 100 MB line). A
  `beforeinput` handler, active on lines ≥ 100,000 characters and not during IME
  composition, handles `insertText` (deletion input types to be added if SP-pipeline shows the same cost) by dispatching the change itself
  and preventing the DOM edit. Measured on F2-100 MB: p95 72 ms / max 128 ms (from 1.2–5.6 s);
  F2-50 MB p95 19 ms. IME composition inside such lines keeps the slow path (accepted).
- **Find (F-010)**: our own search panel (CMP-SearchPanel, MOD-App) and our own engine in
  MOD-Editor. The engine scans the editor `Text` in ~1 MB windows (`sliceString`, case fold,
  `indexOf`), time-sliced at ≤ 8 ms on the main thread, reports the first match as soon as it
  is found and keeps counting in later slices (F-010.R6, AC6); matches are decorations.
  Measured: first match at 100 MB in 96–242 ms, 314k matches counted in 219 ms. Case-insensitive
  matching uses a length-preserving per-character fold so positions stay exact.
  `@codemirror/search` (`SearchCursor`, ~23 MB/s, synchronous `findNext` 2–4 s at 50–100 MB, no
  match count) is **not used**.
- **Undo**: our own history state field (MOD-Editor) replaces `@codemirror/commands` history.
  SP-editor confirmed the stock history cannot express RULE-15: depth is counted in events and
  trimmed at `minDepth + 20`, so "the last 3 tool operations plus the typing between them"
  loses tool operations (1 of 4 kept at 60 typing events), and a high `minDepth` would keep
  ~120 whole-document snapshots. Typing still groups by time like the stock history. Because
  history lives in our field, `view.setState` remains available (history carried over).
- **Line endings**: the editor splits on LF, CRLF and lone CR (matching ENT-Issue line
  counting); the document's `lineEnding` is tracked separately and used whenever text leaves
  the editor (copy, download, worker export); RULE-17 normalises mixed endings (ADR-0006).
- Error marker, issue focus and busy read-only state are plain decorations/compartments; the
  stock lint UI is not used.

## Alternatives considered
- **Monaco 0.57** (MIT) — measured in SP-editor. Scrolls better (16.8 ms everywhere) and
  searches faster, but fails hard criteria: 56k CSP violations (`style-src-elem`/`-attr`,
  needs `'unsafe-inline'`), blob-URL workers blocked by `worker-src 'self'`, whole-document
  replace 0.2–3.3 s and undo up to 7.3 s, heap 1.4–1.6 GB with 3 snapshots at 100 MB,
  long-line typing p95 171–525 ms, a non-sliceable 105–347 ms model creation, and 700 KB gzip.
  Rejected; DEP-36 stays spike-only.
- **Mount in the document with a nonce or `'unsafe-inline'`** — static hosting cannot issue
  per-response nonces; `'unsafe-inline'` weakens ADR-0009. The shadow mount costs nothing.
- **Syntax colouring only up to 2 MB** (SP-editor proposal) — keeps NFR-02 everywhere, but
  the user chose to keep colouring to 10 MB and accept the lag (D-022).
- **Stock `@codemirror/search`** — functionally fine, but blocks the UI for seconds at
  50–100 MB and has no count; F-010 needs its own panel anyway.
- **Custom virtualized read-mostly view above a threshold** — NFR-04 requires 100 MB documents
  to be *editable*, so it would become a second text editor (selection, IME, accessibility,
  undo).
- **Plain `<textarea>`** — no virtualization (multi-second freezes far below 100 MB), no error
  decoration, no line numbers.
- **Ace** (BSD-3) — older architecture, weaker accessibility and CSP story, no worker-safe
  document model.

## Consequences
- Critical-path editor JS is 93.8 KB gzip (large-tier minimal) to 106.9 KB (with the
  normal-tier extras incl. Lezer), inside the 160 KB budget.
- MOD-Editor owns: the shadow-root host and editor theme, the visibility-based hiding rule,
  the direct-input handler, the find engine, the history field and the chunked commit path
  (ADR-0006) — each covered by tests (INV-04, RULE-15, F-010).
- The NFR-06 screen-reader pass must include the editor inside its shadow root; focus and
  labelling are set on the content element CodeMirror creates.
- Tests must assert zero `securitypolicyviolation` events and that the editor is never
  `display:none` while a commit runs.
- Normal-tier documents between about 2 and 10 MB may lag when jumping far or typing in very
  long lines (D-022); latency tests for NFR-02 exclude that range with colouring on.
- Open, carried to SP-pipeline: Gecko not measured (Playwright Firefox does not start on
  macOS 27); WebKit F1 scroll after many random jumps (max gaps 169–229 ms at 50–100 MB) and
  WebKit renderer RSS with 3 snapshots (1.6–1.9 GB, no forced GC; ADR-0006 Blob fallback if
  confirmed). If SP-pipeline shows CodeMirror 6 cannot meet NFR-04, this ADR is superseded.

## Evidence
- SP-editor report: `.build-my-app/reports/spike-editor.md` (code and raw results in
  `spikes/editor/`, branch `spike/editor`).

<!-- Accepted ADRs are immutable. Write a new ADR to change a decision. -->
