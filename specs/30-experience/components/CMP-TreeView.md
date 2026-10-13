---
id: CMP-TreeView
title: Tree view
status: ready
tokens: [font.size.code, size.codeLine, size.treeIndent, radius.sm]
---

## Purpose
Read-only structural view of a valid document.

## Anatomy
Header (selected node's path, actions for the selected node: copy path, copy value, show in
text; collapse all) · rows (expander, key/index, kind, value or child count).

## Variants & states
| Variant / state | Description |
|---|---|
| default | rows per RULE-12 |
| group row | `[0 … 99]` range for large containers |
| invalid document | COPY-tree.invalid with jump to error |
| checking | COPY-tree.checking with progress and COPY-action.cancel; previous tree dimmed |
| unavailable | COPY-tree.too_large (very large tier) with a switch to COPY-view.text |
| selected row | row highlighted; header shows its path and enables the three actions |

## Behavior
Expand/collapse by click or keyboard. Selecting a row (click, tap, arrow keys) makes it the
target of the header actions (D-018); no per-row hover controls. Actions are at least
`size.targetMin`, `size.touchTarget` on coarse pointers.

## Accessibility
Tree role labelled COPY-label.tree; arrow keys move/expand/collapse; row actions reachable by keyboard.
