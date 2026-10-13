---
id: F-003
title: Minify a document
status: ready
milestone: M-1
priority: P0
personas: [PER-01]
entities: [ENT-Document]
rules: [RULE-03, RULE-08, RULE-15]
screens: [SCR-Formatter]
components: [CMP-Toolbar, CMP-Editor]
nfr: [NFR-02, NFR-03, NFR-08]
events: []
depends_on: [F-001, F-005]
---

## Intent
Produce the most compact equivalent JSON — for pasting into a header, a test fixture, or a
single log line — without altering any value (PRN-02).

## Scope
- In: minify the whole document.
- Out: escaping JSON into a string literal (M-2).

## Requirements
- **R1** The user can minify a valid document; the result follows RULE-08.
- **R2** Minifying is lossless (INV-01).
- **R3** Minifying an invalid document does not change it; the first error is shown and
  focused (INV-03).
- **R4** Minifying can be undone in one step (INV-04, RULE-15).
- **R5** Minifying a large document shows progress and can be cancelled; the interface stays
  responsive (PRN-04). While it runs, the document cannot be edited and other actions are
  unavailable; scrolling and cancel remain available.

## Acceptance criteria
- **AC1** Given the document `{\n  "a": [ 1, 2 ],\n  "b": "x y"\n}`, when the user minifies, then the document is exactly `{"a":[1,2],"b":"x y"}`. (R1)
- **AC2** Given a document with `9007199254740993` and `1.50`, when the user minifies, then both numbers appear exactly as written. (R2)
- **AC3** Given an invalid document `{'a':1}`, when the user minifies, then the document is unchanged and the `single-quotes` error is shown and focused. (R3)
- **AC4** Given a document that was minified, when the user undoes once, then the previous text is restored exactly. (R4)
- **AC5** Given a 50 MB valid document, when the user minifies, then progress is shown; the user can scroll and cancel; editing and all other actions are unavailable; cancelling leaves the document unchanged. (R5)

## UX notes
CMP-Toolbar: COPY-action.minify. Progress uses COPY-progress.formatting.

## Edge cases
- Whitespace inside strings is preserved.

## Open questions
