---
id: F-002
title: Beautify a document
status: ready
milestone: M-1
priority: P0
personas: [PER-01]
entities: [ENT-Document, ENT-IndentStyle]
rules: [RULE-01, RULE-02, RULE-03, RULE-07, RULE-15]
screens: [SCR-Formatter]
components: [CMP-Toolbar, CMP-Editor]
nfr: [NFR-02, NFR-03, NFR-08]
events: []
depends_on: [F-001, F-005]
---

## Intent
Make any valid JSON readable with the user's preferred indentation, without altering a single
value (PRN-02).

## Scope
- In: beautify the whole document with an indent style from RULE-01.
- Out: re-indenting without reflow (F-004); sorting keys (M-2); fixing invalid JSON (M-2).

## Requirements
- **R1** The user can beautify a valid document; the result follows RULE-07.
- **R2** The user can choose the indent style from RULE-01; the default is 2 spaces.
- **R3** Beautifying is lossless (INV-01).
- **R4** Beautifying an invalid document does not change it; the first error is shown and
  focused (INV-03, F-005).
- **R5** Beautifying can be undone in one step (INV-04, RULE-15).
- **R6** Beautifying a large document shows progress and can be cancelled; the interface stays
  responsive throughout (PRN-04). While it runs, the document cannot be edited and other
  actions are unavailable; scrolling and cancel remain available.
- **R7** If the result would exceed 100 MB, the user confirms first (RULE-02); declining leaves
  the document unchanged.

## Acceptance criteria
- **AC1** Given the document `{"a":[1,2],"b":{}}` and indent 2 spaces, when the user beautifies, then the document is exactly `{\n  "a": [\n    1,\n    2\n  ],\n  "b": {}\n}`. (R1, R2)
- **AC2** Given a valid document and indent style tab, when the user beautifies, then every nesting level is indented with exactly one tab. (R2)
- **AC3** Given a custom indent of 3 spaces, when the user beautifies, then each nesting level adds exactly 3 spaces. (R2)
- **AC4** Given the document `{"id":12345678901234567890,"x":1.0,"y":1e3,"2":0,"1":0}`, when the user beautifies, then the numbers appear as `12345678901234567890`, `1.0`, `1e3` and the keys keep the order `id, x, y, 2, 1`. (R3)
- **AC5** Given an object with duplicate key `"a"`, when the user beautifies, then both members remain in their original order. (R3)
- **AC6** Given an invalid document `{"a":1,}`, when the user beautifies, then the document is unchanged and the `trailing-comma` error is shown and focused. (R4)
- **AC7** Given a document that was beautified, when the user undoes once, then the document is exactly as before beautifying. (R5)
- **AC8** Given a 50 MB valid document, when the user beautifies, then progress is shown; the user can scroll and cancel; editing and all other actions are unavailable; cancelling leaves the document unchanged. (R6)
- **AC9** Given a valid document with CRLF line endings that ends with a line break, when the user beautifies, then every line break in the result is CRLF and the result ends with one line break. (R1)
- **AC10** Given a 20 KB document nested 10,000 levels deep, when the user beautifies with 2 spaces, then COPY-confirm.very_large is shown and the document is unchanged unless the user chooses COPY-action.continue. (R7)

## UX notes
CMP-Toolbar: COPY-action.beautify and the indent selector (COPY-label.indent, options
COPY-indent.spaces2, COPY-indent.spaces4, COPY-indent.tab, COPY-indent.custom). Progress uses
COPY-progress.formatting with COPY-action.cancel.

## Edge cases
- Strings containing newlines/tabs as escapes stay escaped; raw characters inside strings are never touched.
- Top-level scalar (e.g. `42`) → leading/trailing whitespace removed; final line break kept per RULE-07.
- Empty document → beautify is unavailable. Whitespace-only document → unchanged; `empty-document` error shown.

## Open questions
