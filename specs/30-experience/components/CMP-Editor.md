---
id: CMP-Editor
title: Text editor
status: ready
tokens: [font.size.code, font.lineHeight.code, size.codeLine, space.3]
---

## Purpose
Shows and edits the document text.

## Anatomy
Line numbers · text area · error marker · selection.

## Variants & states
| Variant / state | Description |
|---|---|
| empty | COPY-empty.title, COPY-empty.body and COPY-action.open centred in the editor area |
| normal tier | syntax colouring, bracket matching |
| large tier | reduced colouring (RULE-02) |
| error | error position marked with an inline indicator; the gutter marks the error line |
| warning | dotted underline at each warning; the gutter marks warning lines |
| all-selected | whole document selected (copy fallback, F-007.R3) |

## Behavior
Undo/redo cover typing and every tool operation. Jump-to-issue moves the cursor and scrolls.

## Accessibility
Labelled COPY-label.editor; standard text-editing keys; Tab key insertion has an escape
(e.g. a documented key to move focus out).
