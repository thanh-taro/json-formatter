---
id: ADR-0007
title: Lazy tree from token offsets with a skip table, rendered by a custom virtual list
status: accepted
date: 2026-10-13
supersedes: []
---

## Context
F-006 needs a read-only tree of a valid document: every node with key/index, kind, scalar
value exactly as written, child counts (F-006.R2), RULE-12 expansion and grouping (groups of
100, nested by factors of 100 above 10,000 children), copy path (RULE-06), copy value
(RULE-11, exact source text), reveal in text (exact span), up to the large tier (100 MB) with
no frame > 50 ms and the first group of a 100,000-child container within 100 ms (F-006.AC9).
A JavaScript object tree costs roughly 10–20× the text size; a full typed-array index of every
node costs ~25–30 bytes per node, and adversarial 100 MB documents (`[1,1,1,…]`) have ~50
million nodes (≈ 1.4 GB) — both exceed NFR-04's memory budget together with the documents.

## Decision
1. **Skip table, built during validation** (MOD-Core hooks in the validation pass, in the
   worker, always in the large and very-large tiers): for every container whose source span is
   ≥ a threshold T (4 KB) record `start, end, childCount` in typed arrays sorted by start. The
   table is bounded at `max(65,536, 4 × length / T)` entries; on overflow T doubles and smaller
   entries are dropped (monotonic: an indexed container's ancestors stay indexed) — ≤ 1.2 MB
   at 100 MB even for adversarial shapes. Small containers are not indexed — scanning them is
   cheaper than storing them. If no validation-built table exists for the current version
   (e.g. validation was cancelled), the first tree view runs the standalone structural pass
   (150–380 MB/s) as a sliced, cancellable job under COPY-progress.tree (NFR-02).
2. **Tree queries answered by the worker on demand** from the compact mirror (ADR-0005):
   `children(containerSpan, fromIndex, count ≤ 100)` scans from the container start or the
   nearest checkpoint, skipping large nested containers via the skip table and small ones by
   scanning. Each row carries kind, key and value previews (truncated at 200 characters for
   display; F-006 edge case), child count, span (editor positions), and a handle for nested
   containers. **Checkpoints are the main mechanism**: every container with more than 100
   children gets a checkpoint array (offset of every 100th child, 8 B per 100 children),
   filled while scanning and by a **background fill job** that runs in ≤ 8 ms slices as a
   LIFO queue (most recently expanded container first). Query scans that can exceed one slice
   (cold random access in containers with more than 500,000 children) also yield, so
   validation and edit messages interleave.
3. **Main-thread row model** (MOD-Tree) is a **range tree, not a flat visible-row list**:
   each expanded container or group is a node with its RULE-12 group size, a map of expanded
   entries and lazily rebuilt prefix sums; row *i* is found by binary search per level;
   expansion and collapse are O(depth), collapse-all O(1). Group rows are computed
   arithmetically from child counts — no scan. Row data lives in a bounded LRU block cache
   (100 rows per block, a few thousand blocks).
4. **Custom virtual list**: fixed 24 px rows, pooled row elements, renders only visible rows
   plus overscan, prefetches neighbouring blocks (±1 viewport); the spacer is capped at
   8 M px with proportional mapping (safe below Gecko's ~17 M px element limit), and in that
   scaled mode wheel and keyboard paging are intercepted so they move by virtual pixels.
   `role="tree"` with `aria-level`, `aria-setsize`, `aria-posinset`, `aria-expanded` per
   rendered row and the APG keyboard model with roving tabindex; **when the selected row is
   not rendered, the tree container is the tab stop** (`tabindex="0"`) and, on focus, scrolls
   the selected row in and moves focus to it.
5. **Copy value** of a node uses a worker-built `Blob` of its exact span, joined with the
   document line ending (no main-thread string building). The clipboard item is **created
   synchronously in the click handler with a promise of the Blob**, so WebKit keeps the user
   activation across the worker round trip. **Copy path** is formatted on the main thread
   from the path parts held in the row model with the pure RULE-06 formatter from MOD-Core
   (no worker call). **Reveal** passes the span straight to the editor (worker offsets are
   editor positions) as selection plus scroll into view.
6. **Versioning**: all tree data is tagged with the document version. When the document
   changes, the tree shows COPY-tree.checking with the previous tree dimmed (F-006.R10,
   INV-05) and re-fetches visible blocks once validation for the new version succeeds (which
   also delivers the new skip table).
7. **Very large tier**: same mechanism; if the worker fails to allocate, the tree shows
   COPY-tree.too_large (F-006.AC11).

## Alternatives considered
- **JS object tree** (`JSON.parse` or our own) — lossy (`JSON.parse`) or ~10–20× memory;
  fails NFR-04 at 100 MB.
- **Full node index** (struct-of-arrays for every node) — simple random access, but
  ~1.4 GB for adversarial 100 MB documents.
- **Container-only full index** — still unbounded for documents made of many tiny
  containers (`[[],[],…]`).
- **Main-thread scanning** for tree queries — avoids a message round trip, but scanning a
  large container on the main thread can exceed 50 ms; keeps tokenization in one place too.
- **Flattened visible-row list** (the original proposal) — O(visible rows) per expand or
  collapse; with 1,010,110 visible rows (all groups of a 1,000,000-child container expanded) it
  would hold a million entries, where the range tree holds 10,106 nodes (+8 MB heap).
- **Skip table only after the tree is first opened** (the original §6 optimisation) — saves
  nothing measurable during validation, but costs a separate 0.15–0.6 s pass at 100 MB on
  first tree view.
- **@tanstack/virtual-core** (MIT) — solid, but we need height scaling beyond the browser
  limit and tree-specific focus handling; the remaining logic is ~150 lines.

## Consequences
- Tree memory is near-constant (worker: skip table ≤ 1.2 MB, checkpoints ≤ 2.7 MB at 33 M
  children; main: ≤ ~10 MB); cost moves to scan time on first expansion of large
  containers, which the checkpoints amortise.
- With the table from validation, the first tree view at 100 MB costs only root plus first
  block (0.4–6.7 ms); without it, 0.2–0.6 s with progress.
- Cold random access deep in a 1,000,000-child container is the slowest case (197–283 ms in
  Chromium under heavy machine load) until the background fill completes (38–111 ms after
  the first expansion).
- During very fast flings rows show placeholders for a frame or more (one worker round trip
  per block); prefetching reduces it.
- Height scaling makes native wheel scrolling coarse (3× rows per pixel at 1 M rows), hence
  the wheel interception in scaled mode.
- Rows not rendered are invisible to screen-reader virtual cursors; keyboard navigation
  scrolls rows into existence (accepted for virtualized trees, NFR-06 manual pass).
- MOD-Core gains a resumable "scan children" entry point sharing the tokenizer; the compact
  mirror's chunks are not line-aligned, so the scanner keeps cross-chunk token state like
  the validator.

## Evidence
- SP-tree report: `.build-my-app/reports/spike-tree.md` (prototype, oracle tests and raw
  results in `spikes/tree/`, branch `spike/tree`). Expand root of 50 MB: 131–169 ms
  (target < 500 ms); F-006.AC9 first group of a 100,000-child container 10–31 ms, of a
  1,000,000-child container 19–32 ms (target ≤ 100 ms); scroll with 1,010,110 visible rows:
  max frame 16.7 ms (Chromium) / 17.9 ms (WebKit); paths and values exact on ~13,500 nodes
  (Node) and 2,396 rows per engine, reveal 97/97 exact. Gecko not run (Playwright Firefox
  does not launch on macOS 27).
- SP-pipeline report: `.build-my-app/reports/spike-pipeline.md` (compact mirror chosen over
  a CodeMirror `Text` mirror; WebKit `ClipboardItem` limits).

<!-- Accepted ADRs are immutable. Write a new ADR to change a decision. -->
