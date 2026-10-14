---
id: CMP-Toolbar
title: Toolbar
status: ready
tokens: [size.toolbar, size.control, size.targetMin, size.touchTarget, radius.sm, font.size.sm, border.width.focus]
---

## Purpose
Holds every document-level action.

## Anatomy
Load group (open, clear) · Find · Format group (beautify, minify, re-indent, indent selector) · View
switch (text/tree) · Export group (copy, download).

## Variants & states
| Variant / state | Description |
|---|---|
| default | all actions available |
| empty document | clear, find, format, export and view switch disabled; open stays enabled |
| busy | actions other than cancel do nothing, but keep their normal look (no disabled styling, D-031); the editor is read-only; the progress bar (CMP-Notice) is the only visible busy signal |
| narrow | groups collapse into an overflow menu (COPY-action.more) |

## Behavior
Actions apply to the whole document. The indent selector applies to both beautify and re-indent.

## Accessibility
Toolbar role (COPY-label.toolbar) with arrow-key navigation; each button labelled by its COPY- string; the view switch is labelled COPY-label.view.
