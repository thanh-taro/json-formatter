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
| narrow | under 600 px wide, long lines soft-wrap; the gutter shows real line numbers only on a line's first row (D-019) |
| loading | read-only while a file is read; the status bar shows checking |

## Behavior
Undo/redo cover typing and every tool operation. Jump-to-issue moves the cursor and scrolls
both vertically and horizontally so the issue's column is visible; the error-line marking stays
visible on the current line.

## Accessibility
Labelled COPY-label.editor; standard text-editing keys; Tab key insertion has an escape
(e.g. a documented key to move focus out).
