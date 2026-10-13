---
id: CMP-DropOverlay
title: Drop overlay
status: ready
tokens: [radius.md, border.width.focus, motion.duration.base]
---

## Purpose
Shows where to drop a file while dragging over the tool.

## Anatomy
Full-area overlay with COPY-drop.hint.

## Variants & states
| Variant / state | Description |
|---|---|
| hidden | default |
| active | a file is dragged over the tool |

## Behavior
Disappears on drop or when the drag leaves.

## Accessibility
Not focusable; the open action is the non-drag alternative.
