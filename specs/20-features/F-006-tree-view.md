---
id: F-006
title: Explore the document as a tree
status: ready
milestone: M-1
priority: P1
personas: [PER-01]
entities: [ENT-Document, ENT-Node]
rules: [RULE-02, RULE-06, RULE-11, RULE-12]
screens: [SCR-Formatter]
components: [CMP-TreeView, CMP-Toolbar]
nfr: [NFR-02, NFR-04, NFR-06]
events: []
depends_on: [F-005]
---

## Intent
Navigate big, deeply nested payloads by structure instead of scrolling text, and grab the
exact path or value needed for code, tests, or queries.

## Scope
- In: read-only tree of the current valid document; expand/collapse; copy path; copy value;
  reveal a node in the text.
- Out: editing in the tree (non-goal); search and expand-to-level (M-2).

## Requirements
- **R1** The user can switch between the text view and the tree view of the document.
- **R2** The tree shows every node of a valid document with its key or index, kind, and for
  scalars its value exactly as written; containers show their child count.
- **R3** The user can expand and collapse any container, and collapse all; initial expansion
  and grouping of large containers follow RULE-12.
- **R4** The user can copy a node's path (RULE-06).
- **R5** The user can copy a node's value (RULE-11).
- **R6** The user can reveal a node in the text view, which selects that node's text.
- **R7** When the document is invalid, the tree is not shown; instead the user is told why and
  can jump to the error.
- **R8** The tree stays responsive for documents up to the large tier of RULE-02 (PRN-04);
  building it follows the progress and cancel behaviour of NFR-02. In the very large tier the
  tree is best effort and may be unavailable, in which case the user is told.
- **R9** If writing to the clipboard is blocked, the path or value is shown in a read-only field
  with its text selected so the user can copy it manually.
- **R10** While the document is being checked, the tree shows that it is out of date and is
  refreshed when the result arrives (INV-05).

## Acceptance criteria
- **AC1** Given a valid document, when the user switches to the tree view, then the tree is shown, and switching back shows the text unchanged. (R1)
- **AC2** Given `{"user":{"id":12345678901234567890,"tags":["a"]}}`, when the tree is shown, then it contains `user` (object, 2 children), `id` with value `12345678901234567890`, and `tags` (array, 1 child). (R2)
- **AC3** Given the tree is first shown, when nothing else happened, then the root and its direct children are expanded and deeper containers are collapsed. (R3)
- **AC4** Given an array of 250 elements, when the user expands it, then it shows groups `[0 … 99]`, `[100 … 199]`, `[200 … 249]`. (R3)
- **AC5** Given a node at `items[0]` with key `content-type`, when the user copies its path, then the clipboard contains `$.items[0]["content-type"]`. (R4)
- **AC6** Given a node whose source text is `1.50`, when the user copies its value, then the clipboard contains `1.50`. (R5)
- **AC7** Given a nested node in the tree, when the user reveals it in text, then the text view opens with exactly that node's text selected and scrolled into view. (R6)
- **AC8** Given an invalid document, when the user switches to the tree view, then COPY-tree.invalid is shown with an action that jumps to the error. (R7)
- **AC9** Given a valid 50 MB document, when the user expands a container with 100,000 children, then the first group appears within 100 ms and scrolling meets NFR-04. (R8)
- **AC10** Given the tree is expanded, when the user chooses collapse all, then only the root remains expanded. (R3)
- **AC11** Given a document in the very large tier whose tree cannot be built, when the user switches to the tree view, then COPY-tree.too_large is shown. (R8)
- **AC12** Given clipboard writing is blocked, when the user copies a node's path, then COPY-error.clipboard is shown and the path is shown selected in a read-only field. (R9)
- **AC13** Given the tree is shown, when the document is undone to a different text, then COPY-tree.checking is shown until the new tree is ready. (R10)

## UX notes
CMP-Toolbar has the view switch (COPY-view.text, COPY-view.tree). CMP-TreeView header actions for the selected row:
COPY-action.copy_path, COPY-action.copy_value, COPY-action.reveal; header offers
COPY-action.collapse_all. Rows show kinds (COPY-tree.kind_object, COPY-tree.kind_array, COPY-tree.kind_string,
COPY-tree.kind_number, COPY-tree.kind_boolean, COPY-tree.kind_null), child counts
(COPY-tree.count_keys, COPY-tree.count_items) and group rows (COPY-tree.group). The invalid
state offers COPY-action.go_to_error. Copy confirmation: COPY-toast.copied. Building progress: COPY-progress.tree with COPY-action.cancel.

## Edge cases
- Cancelling the checking bar → the text view is shown (the stale tree is not left on screen).
- Undo and redo work while the tree has focus.
- After the document changes, nodes that still exist at the same path stay expanded; everything else follows RULE-12.
- Top-level scalar → tree shows a single root row.
- Duplicate keys → each occurrence is its own row; paths are identical (warning already shown by F-005).
- Very long string values → truncated in the row with full value available via copy value.

## Open questions
