---
id: MOD-Tree
title: Tree view — row model, grouping, virtual list
status: draft
depends_on: [MOD-Worker, MOD-Core, MOD-Copy]
---

## Responsibility
Renders CMP-TreeView for a valid document (ADR-0007). Keeps the expansion state in a
**range-tree row model** (not a flat visible-row list): each expanded container or group is a
node with its RULE-12 group size, a map of expanded entries and lazily rebuilt prefix sums;
row *i* is found by binary search per level; expand/collapse O(depth), collapse-all O(1)
(1,010,110 visible rows = 10,106 nodes, +8 MB). Computes RULE-12 groups arithmetically from
child counts (groups of 100, nested by factors of 100 above 10,000); applies the initial
expansion (root and its direct children) and collapse-all; fetches blocks of ≤ 100 rows from
the worker on demand, prefetches neighbouring blocks (±1 viewport) and keeps them in a
bounded LRU block cache per document version; renders only visible rows in a virtual list
with fixed 24 px rows and pooled elements, with the spacer capped at 8 M px and wheel and
keyboard paging intercepted in that scaled mode; implements the tree keyboard model
(roving tabindex; **the tree container is the tab stop when the selected row is not
rendered**, and on focus scrolls it in and focuses it) and ARIA attributes; shows the invalid, checking (previous tree dimmed), building-progress and
unavailable states; formats paths on the main thread from the path parts in the row model
with the RULE-06 formatter and asks MOD-IO to copy paths and values (values as a promise of a
worker-built Blob of the exact span, handed over synchronously in the click handler); asks
the editor to reveal a span (worker offsets are editor positions).
Lazy-loaded chunk: not part of the startup critical path.

## Not responsible for
- Scanning the document (worker via MOD-Core); clipboard mechanics and fallbacks (MOD-IO).
- Editing in the tree (non-goal).

## Public surface
- `mountTree(container, deps)` → `TreeHandle` with `show(version)`, `hide()`,
  `markStale(version)`, `collapseAll()`, `onReveal(cb)`, `relabel()` (re-renders its
  labels in the active language, keeping expansion and scroll; ADR-0014).
- Pure `RowModel` (range tree: expansion state → row *i*, row count, group arithmetic) —
  unit-tested without DOM.

## Implements
F-006.R1–F-006.R10 (view switch together with MOD-App); RULE-06, RULE-11, RULE-12;
INV-05; NFR-02, NFR-04, NFR-06 (tree role, keyboard); F-012.R2 (relabel in place).
