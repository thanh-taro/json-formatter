---
id: CMP-Toolbar
title: Toolbar
status: ready
tokens: []
---

## Purpose
Holds every document-level action.

## Anatomy
Load group (open, clear) · Format group (beautify, minify, re-indent, indent selector) · View
switch (text/tree) · Export group (copy, download).

## Variants & states
| Variant / state | Description |
|---|---|
| default | all actions available |
| empty document | format, export and view switch disabled |
| busy | actions disabled except cancel; the editor is read-only |
| narrow | groups collapse into an overflow menu (COPY-action.more) |

## Behavior
Actions apply to the whole document. The indent selector applies to both beautify and re-indent.

## Accessibility
Toolbar role with arrow-key navigation; each button labelled by its COPY- string.
