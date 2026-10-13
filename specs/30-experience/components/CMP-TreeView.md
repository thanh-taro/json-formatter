---
id: CMP-TreeView
title: Tree view
status: ready
tokens: [font.size.code, size.codeLine, size.treeIndent, radius.sm]
---

## Purpose
Read-only structural view of a valid document.

## Anatomy
Header (collapse all) · rows (expander, key/index, kind, value or child count, row actions).

## Variants & states
| Variant / state | Description |
|---|---|
| default | rows per RULE-12 |
| group row | `[0 … 99]` range for large containers |
| invalid document | COPY-tree.invalid with jump to error |
| checking | COPY-tree.checking; previous tree dimmed |
| unavailable | COPY-tree.too_large (very large tier) |
| focused row | row actions visible |

## Behavior
Expand/collapse by click or keyboard. Row actions: copy path, copy value, reveal in text.

## Accessibility
Tree role labelled COPY-label.tree; arrow keys move/expand/collapse; row actions reachable by keyboard.
