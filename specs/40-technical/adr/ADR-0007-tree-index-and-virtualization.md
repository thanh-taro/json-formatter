---
id: ADR-0007
title: Lazy tree from token offsets with a skip table, rendered by a custom virtual list
status: proposed
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
million nodes (≈ 1.4 GB) — both exceed NFR-04's 1.5 GB peak together with the documents.

## Decision
1. **Skip table, built during validation** (MOD-Core, in the worker): for every container
   whose source span is ≥ a threshold (initially 4 KB; tuned by SP-tree) record
   `start, end, childCount` in typed arrays sorted by start. Its size is bounded by
   (document size ÷ threshold) × nesting, i.e. a few MB at 100 MB. Small containers are not
   indexed — scanning them is cheaper than storing them.
2. **Tree queries answered by the worker on demand** from the mirror:
   `children(containerSpan, fromIndex, count ≤ 100)` scans from the container start (or the
   nearest cached checkpoint), skipping large nested containers in O(log n) via the skip table
   and small ones by scanning. Each row carries kind, key and value previews (truncated for
   display; F-006 edge case), child count, span, and a handle for nested containers.
   Checkpoints (offset of every 100th child) are cached per expanded container and extended
   in the background, so later groups of huge containers open in O(1) scans.
3. **Main-thread tree model** (MOD-Tree) keeps only the expansion state and the fetched rows
   of expanded groups, as a flattened visible-row list updated incrementally on expand and
   collapse. Group rows (RULE-12) are computed arithmetically from child counts — no scan.
4. **Custom virtual list**: fixed row height, renders only visible rows plus overscan,
   scroll position scaled when the total height would exceed the browser's maximum element
   height (~17 million px in Gecko), `role="tree"` with `aria-level`, `aria-setsize`,
   `aria-posinset`, `aria-expanded` per rendered row and the APG keyboard model.
5. **Copy value** of a node uses a worker-built `Blob` of its exact span (no main-thread
   string building); **copy path** is formatted on the main thread from row ancestry with the
   pure RULE-06 formatter from MOD-Core; **reveal** selects the span in the editor.
6. **Versioning**: all tree data is tagged with the document version. When the document
   changes, the tree shows COPY-tree.checking with the previous tree dimmed (F-006.R10,
   INV-05) and re-fetches visible groups once validation for the new version succeeds.
   The skip table is built only while the tree view has been opened at least once for the
   document (saves work for text-only use).
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
- **@tanstack/virtual-core** (MIT) — solid, but we need height scaling beyond the browser
  limit and tree-specific focus handling; the remaining logic is ~150 lines.

## Consequences
- Tree memory is near-constant; cost moves to scan time on first expansion of large
  containers — SP-tree verifies expand-root of 50 MB < 500 ms and F-006.AC9.
- Rows not rendered are invisible to screen-reader virtual cursors; keyboard navigation
  scrolls rows into existence (accepted for virtualized trees, NFR-06 manual pass).
- MOD-Core gains a resumable "scan children" entry point sharing the tokenizer.

<!-- Accepted ADRs are immutable. Write a new ADR to change a decision. -->
