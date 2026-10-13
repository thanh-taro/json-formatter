---
id: F-004
title: Change indentation without reflow
status: building
milestone: M-1
priority: P1
personas: [PER-01]
entities: [ENT-Document, ENT-IndentStyle]
rules: [RULE-01, RULE-02, RULE-09, RULE-15]
screens: [SCR-Formatter]
components: [CMP-Toolbar, CMP-Editor]
nfr: [NFR-02]
events: []
depends_on: [F-001]
---

## Intent
Switch tabs ↔ spaces or 2 ↔ 4 spaces while keeping hand-made layout (compact arrays,
grouped lines) — and even when the JSON is not valid yet.

## Scope
- In: converting leading indentation of every line to a target indent style.
- Out: reflowing structure (that is beautify, F-002).

## Requirements
- **R1** The user can re-indent the document to any indent style from RULE-01, following RULE-09.
- **R2** Re-indenting changes nothing but leading indentation; line breaks and all other
  characters stay the same.
- **R3** Re-indenting works on invalid documents.
- **R4** Re-indenting can be undone in one step (INV-04, RULE-15).
- **R5** If no indentation can be detected (e.g. a single line), the document is unchanged and
  the user is told.
- **R6** Re-indenting a large document shows progress and can be cancelled; while it runs, the
  document cannot be edited and other actions are unavailable (PRN-04).
- **R7** If the result would exceed 100 MB, the user confirms first (RULE-02); declining leaves
  the document unchanged.

## Acceptance criteria
- **AC1** Given a document indented with 4 spaces per level, when the user re-indents to tab, then each line's 4·n leading spaces become n tabs. (R1)
- **AC2** Given a document indented with tabs, when the user re-indents to 2 spaces, then each leading tab becomes 2 spaces. (R1)
- **AC3** Given a 2-space document containing the line `  "xs": [1, 2, 3],`, when the user re-indents to 4 spaces, then that line becomes `    "xs": [1, 2, 3],` and the number of lines is unchanged. (R2)
- **AC4** Given an invalid 2-space document with a trailing comma, when the user re-indents to 4 spaces, then indentation changes and the trailing comma is still present. (R3)
- **AC5** Given a re-indented document, when the user undoes once, then the previous text is restored exactly. (R4)
- **AC6** Given a minified single-line document, when the user re-indents, then the document is unchanged and COPY-notice.no_indent is shown. (R5)
- **AC7** Given a 50 MB indented document, when the user re-indents, then then progress is shown; the user can scroll and cancel; editing and all other actions are unavailable; cancelling leaves the document unchanged. (R6)
- **AC8** Given a 60 MB document indented with 1 space per level, when the user re-indents to 4 spaces, then COPY-confirm.very_large is shown and nothing changes until the user chooses COPY-action.continue. (R7)

## UX notes
CMP-Toolbar: COPY-action.reindent uses the same indent selector as F-002. Progress uses
COPY-progress.formatting with COPY-action.cancel.

## Edge cases
- Lines inside multi-line string content cannot exist in valid JSON; in invalid documents every line is treated alike.
- Mixed tabs and spaces, or indentation that is not a whole number of units → converted per RULE-09.
- Lines with no indentation are unchanged.

## Open questions
