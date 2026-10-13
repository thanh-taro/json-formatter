---
id: MOD-Tree
title: Tree view — row model, grouping, virtual list
status: draft
depends_on: [MOD-Worker, MOD-Core, MOD-Copy]
---

## Responsibility
Renders CMP-TreeView for a valid document (ADR-0007). Keeps the expansion state and a
flattened visible-row list that changes incrementally on expand/collapse; computes RULE-12
groups arithmetically from child counts (groups of 100, nested by factors of 100 above
10,000); applies the initial expansion (root and its direct children) and collapse-all;
fetches rows of expanded groups from the worker on demand and caches them per document
version; renders only visible rows in a fixed-row-height virtual list with height scaling
beyond the browser's maximum element height; implements the tree keyboard model and ARIA
attributes; shows the invalid, checking (previous tree dimmed), building-progress and
unavailable states; formats paths with the RULE-06 formatter and asks MOD-IO to copy paths
and values (values as worker-built Blobs of the exact span); asks the editor to reveal a span.
Lazy-loaded chunk: not part of the startup critical path.

## Not responsible for
- Scanning the document (worker via MOD-Core); clipboard mechanics and fallbacks (MOD-IO).
- Editing in the tree (non-goal).

## Public surface
- `mountTree(container, deps)` → `TreeHandle` with `show(version)`, `hide()`,
  `markStale(version)`, `collapseAll()`, `onReveal(cb)`.
- Pure `RowModel` (expansion state → visible rows, group arithmetic) — unit-tested without DOM.

## Implements
F-006.R1–F-006.R10 (view switch together with MOD-App); RULE-06, RULE-11, RULE-12;
INV-05; NFR-02, NFR-04, NFR-06 (tree role, keyboard).
