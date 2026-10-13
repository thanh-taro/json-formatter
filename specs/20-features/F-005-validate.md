---
id: F-005
title: Validate and pinpoint problems
status: ready
milestone: M-1
priority: P0
personas: [PER-01]
entities: [ENT-Document, ENT-Issue]
rules: [RULE-03, RULE-04, RULE-05, RULE-14]
screens: [SCR-Formatter]
components: [CMP-Editor, CMP-StatusBar, CMP-IssuePanel]
nfr: [NFR-02, NFR-03, NFR-06, NFR-08]
events: []
depends_on: [F-001]
---

## Intent
Tell users immediately whether their JSON is valid and, if not, exactly where and why — in
words that suggest the fix (PRN-03).

## Scope
- In: continuous validation, first error with location and hint, warnings, jump to issue,
  document facts (size, lines).
- Out: automatic fixing (M-2); schema validation (non-goal); reporting more than one syntax
  error (a strict parser stops at the first).

## Requirements
- **R1** The document is validated automatically whenever it changes, without the user asking.
- **R2** The validity state (valid, invalid, checking) is always visible.
- **R3** For an invalid document the first error is reported with its code, line, column (at the
  position defined in RULE-04) and hint, and its position is marked in the document.
- **R4** For a valid document, warnings from RULE-05 are reported with location and hint.
- **R5** The user can jump from any issue to its position in the document.
- **R6** The document's size and line count are always visible.
- **R7** Validation never blocks typing or scrolling, at any size (PRN-04); while re-checking,
  the previous result is marked as out of date (INV-05).

## Acceptance criteria
- **AC1** Given a valid document, when the user adds a character that makes it invalid, then the validity state changes to invalid without any user action. (R1, R2)
- **AC2** Given the document `{"a": 1,\n "b": 2,\n}`, when it is validated, then the error is `trailing-comma` at line 2, column 8 with the hint COPY-hint.trailing_comma, and that position is marked. (R3)
- **AC3** Given the document `{"a": True}`, when it is validated, then the error is `invalid-literal` at line 1, column 7 with the hint COPY-hint.invalid_literal. (R3)
- **AC4** Given the document `{"a": 1} {"b": 2}`, when it is validated, then the error is `extra-content` at line 1, column 10. (R3)
- **AC5** Given the valid document `{"a":1,"a":2,"id":9007199254740993}`, when it is validated, then it is valid with a `duplicate-key` warning at the second `"a"` and an `unsafe-number` warning at the number. (R4)
- **AC6** Given an issue is listed, when the user activates it, then the cursor moves to the issue's line and column and that position is scrolled into view. (R5)
- **AC7** Given any document, when it changes, then the shown size and line count match the document. (R6)
- **AC8** Given a 50 MB document, when the user types a character, then the character appears within the latency of NFR-02 and the validity state shows checking until the new result arrives. (R7)
- **AC9** Given a document of zero characters, when it is validated, then the state is COPY-status.empty and no issue is listed. (R2)
- **AC10** Given a document containing only spaces and line breaks, when it is validated, then the error is `empty-document` at line 1, column 1. (R3)
- **AC11** Given a document of 10,001 nested arrays, when it is validated, then the error is `too-deep` at the opening bracket of level 10,001. (R3)

## UX notes
CMP-StatusBar shows COPY-status.valid / COPY-status.invalid / COPY-status.checking /
COPY-status.empty, plus size and lines (COPY-status.size_lines). CMP-IssuePanel lists issues
with the hint for their code (Hints in copy.md) and location (COPY-issue.location). The error position is
marked in CMP-Editor.
Hints per code: COPY-hint.trailing_comma, COPY-hint.comment, COPY-hint.single_quotes, COPY-hint.unquoted_key, COPY-hint.missing_comma, COPY-hint.missing_colon, COPY-hint.unclosed_string, COPY-hint.unclosed_container, COPY-hint.unexpected_closing, COPY-hint.invalid_literal, COPY-hint.invalid_number, COPY-hint.invalid_escape, COPY-hint.control_character, COPY-hint.extra_content, COPY-hint.empty_document, COPY-hint.too_deep, COPY-hint.unexpected_character, COPY-hint.duplicate_key, COPY-hint.unsafe_number, COPY-hint.byte_order_mark.

## Edge cases
- Error at the very end (e.g. unclosed object) → location is end of document; hint names the unclosed bracket's opening line.
- Very long lines (minified 50 MB on one line) → column is still exact.
- More than 1,000 warnings → first 1,000 listed plus COPY-issue.more.
- Line, column and offset counting follow ENT-Issue (code points; LF, CRLF and lone CR are one break each).

## Open questions
