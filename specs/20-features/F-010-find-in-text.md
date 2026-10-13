---
id: F-010
title: Find text in the document
status: draft
milestone: M-1
priority: P1
personas: [PER-01]
entities: [ENT-Document]
rules: [RULE-02, RULE-18]
screens: [SCR-Formatter]
components: [CMP-SearchPanel, CMP-Toolbar, CMP-Editor]
nfr: [NFR-02, NFR-06]
events: []
depends_on: [F-001]
---

## Intent
Large documents only show what is on screen, so the browser's own find cannot see them. Users
still need to jump to a key or value in a 50 MB payload in seconds.

## Scope
- In: find literal text in the text view, next/previous, match count, match case.
- Out: replace and pattern search (M-2); searching the tree (M-2 "tree search").

## Requirements
- **R1** The user can open find from the toolbar or with the platform's find shortcut while the
  editor has focus, and close it again.
- **R2** Matches follow RULE-18; the current match is selected and scrolled into view.
- **R3** The user can move to the next and previous match; the position and total are shown.
- **R4** When there is no match, the user is told.
- **R5** The user can turn match case on and off.
- **R6** Finding stays responsive at every size tier (PRN-04); counting in large documents may
  complete after the first match is shown.

## Acceptance criteria
- **AC1** Given the text view has focus, when the user presses the find shortcut, then CMP-SearchPanel opens with its field focused; when the user closes it, focus returns to the editor. (R1)
- **AC2** Given the document contains "status" three times, when the user types `status`, then the first match after the cursor is selected and COPY-search.count shows `1 of 3`. (R2, R3)
- **AC3** Given match 3 of 3 is selected, when the user moves to the next match, then match 1 is selected. (R3)
- **AC4** Given the document does not contain `xyz`, when the user types it, then COPY-search.none is shown. (R4)
- **AC5** Given the document contains `Status` and `status`, when match case is on and the user types `status`, then only `status` matches. (R5)
- **AC6** Given a 50 MB document, when the user types a search term, then typing stays within NFR-02 and the first match appears before the total count is final. (R6)

## UX notes
CMP-Toolbar has COPY-action.find. CMP-SearchPanel: field (COPY-search.placeholder), previous
(COPY-action.find_prev), next (COPY-action.find_next), match case (COPY-search.match_case),
count (COPY-search.count / COPY-search.counting / COPY-search.none), close (COPY-action.close).

## Edge cases
- Search while the tree view is shown → find opens in the text view.
- Document changes while find is open → matches are recounted.

## Open questions
