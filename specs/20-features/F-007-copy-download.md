---
id: F-007
title: Copy and download the document
status: ready
milestone: M-1
priority: P0
personas: [PER-01]
entities: [ENT-Document]
rules: [RULE-10]
screens: [SCR-Formatter]
components: [CMP-Toolbar]
nfr: [NFR-01, NFR-02]
events: []
depends_on: [F-001]
---

## Intent
Get the result out in one action, to wherever it is needed next.

## Scope
- In: copy the whole document; download it as a file.
- Out: share links (non-goal, PRN-01).

## Requirements
- **R1** The user can copy the whole document to the clipboard; success is confirmed.
- **R2** The user can download the document as a file named per RULE-10.
- **R3** If copying is not permitted by the environment, the user is told and the whole
  document is selected so they can copy it manually.
- **R4** Downloading creates the file on the device only (INV-02).
- **R5** *Deprecated (D-023): no browser lets the tool detect a download blocked by its
  surroundings; copying (R1, R3) is the fallback.*
- **R6** Copying or downloading a large document follows the progress and cancel behaviour of NFR-02.

## Acceptance criteria
- **AC1** Given a document, when the user chooses copy, then the clipboard contains exactly the document text and COPY-toast.copied is shown. (R1)
- **AC2** Given a document loaded from `orders.json` and then beautified, when the user downloads, then a file `orders.json` with exactly the document text is saved. (R2)
- **AC3** Given a pasted document that was minified, when the user downloads, then the file is named `minified.json`. (R2)
- **AC4** Given clipboard writing is blocked, when the user chooses copy, then COPY-error.clipboard is shown and the whole document is selected. (R3)
- **AC5** Given a document, when the user downloads it, then no network request is made. (R4)
- **AC6** *Deprecated (D-023).* Given downloads are blocked, when the user chooses download, then nothing is required of the tool. (R5)
- **AC7** Given the tree view is shown and clipboard writing is blocked, when the user chooses copy, then the text view is shown with the whole document selected and COPY-error.clipboard is shown. (R3)
- **AC8** Given a 100 MB document, when the user copies it and it takes longer than 0.5 s, then progress is shown. (R6)

## UX notes
CMP-Toolbar: COPY-action.copy, COPY-action.download. Progress: COPY-progress.exporting with
COPY-action.cancel.

## Edge cases
- Empty document → copy and download are unavailable.

## Open questions
