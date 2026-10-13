---
id: CMP-Editor
title: Text editor
status: ready
tokens: []
---

## Purpose
Shows and edits the document text.

## Anatomy
Line numbers · text area · error marker · selection.

## Variants & states
| Variant / state | Description |
|---|---|
| normal tier | syntax colouring, bracket matching |
| large tier | reduced colouring (RULE-02) |
| error | error position marked with an inline indicator |

## Behavior
Undo/redo cover typing and every tool operation. Jump-to-issue moves the cursor and scrolls.

## Accessibility
Labelled COPY-label.editor; standard text-editing keys; Tab key insertion has an escape
(e.g. a documented key to move focus out).
