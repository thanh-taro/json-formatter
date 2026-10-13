---
id: F-001
title: Load a document
status: building
milestone: M-1
priority: P0
personas: [PER-01]
entities: [ENT-Document]
rules: [RULE-02, RULE-13, RULE-15, RULE-17]
screens: [SCR-Formatter]
components: [CMP-Editor, CMP-Toolbar, CMP-DropOverlay]
nfr: [NFR-02, NFR-04]
events: []
depends_on: []
---

## Intent
Users get JSON into the tool from wherever it lives — clipboard, a file on disk — in one
gesture, at any size (PRN-04), without it leaving the device (PRN-01).

## Scope
- In: typing/pasting, dropping a file, choosing a file, clearing the document, size tiers.
- Out: fetching from a URL (non-goal, PRN-01); remembering content between sessions.

## Requirements
- **R1** The user can type or paste text into the document.
- **R2** The user can drop a single file onto the tool to replace the document with its content.
- **R3** The user can choose a file from the device to replace the document with its content.
- **R4** Loading follows the size tiers in RULE-02: large documents load with a notice that
  visual extras are reduced; very large documents require confirmation first.
- **R5** Files that are not valid UTF-8 are rejected per RULE-13, keeping the current document.
- **R6** The user can clear the document.
- **R7** Replacing or clearing the document can be undone in one step (INV-04), within the
  history limits of RULE-15.
- **R8** While a large file is loading, progress is shown and the user can cancel; cancelling
  keeps the previous document (INV-03).
- **R9** If the device cannot hold the content, loading stops, the user is told, and the
  previous document is kept (RULE-02).

## Acceptance criteria
- **AC1** Given an empty document, when the user pastes `{"a":1}`, then the document contains exactly `{"a":1}`. (R1)
- **AC2** Given any document, when the user drops a UTF-8 file `data.json`, then the document contains the file's content and the document's source name is `data.json`. (R2)
- **AC3** Given any document, when the user chooses a UTF-8 file via the open action, then the document contains the file's content. (R3)
- **AC4** Given a 30 MB file, when the user loads it, then it loads and COPY-notice.large is shown. (R4)
- **AC5** Given a 150 MB file, when the user loads it, then COPY-confirm.very_large is shown and nothing is replaced until the user chooses COPY-action.continue. (R4)
- **AC6** Given a file containing invalid UTF-8 bytes, when the user loads it, then COPY-error.encoding is shown and the previous document is unchanged. (R5)
- **AC7** Given a non-empty document, when the user clears it, then the document is empty. (R6)
- **AC8** Given a document that was replaced by a dropped file, when the user undoes, then the previous document is restored exactly. (R7)
- **AC9** Given a large file is loading, when the user cancels, then loading stops and the previous document is unchanged. (R8)
- **AC10** Given a file larger than the device can hold, when loading fails, then COPY-error.too_large is shown and the previous document is unchanged. (R9)
- **AC11** Given a document, when the user pastes 120 MB of text, then COPY-confirm.very_large is shown and nothing is inserted until the user confirms. (R4)
- **AC12** Given a 30 MB document on which the user has run 4 tool operations, when the user undoes repeatedly, then only the last 3 are undone and COPY-notice.undo_trimmed has been shown once. (R7)

## UX notes
Entry points: CMP-Editor (type/paste), CMP-DropOverlay (drop anywhere on SCR-Formatter),
CMP-Toolbar open and clear actions (COPY-action.open, COPY-action.clear). Empty state shows
COPY-empty.title and COPY-empty.body. Loading shows COPY-progress.loading with cancel
(COPY-action.cancel); a large paste shows COPY-progress.inserting; undoing a large-tier
operation shows COPY-progress.restoring.

## Edge cases
- Dropping several files → only the first is loaded; COPY-notice.multiple_files shown.
- Dropping a folder, or non-file content outside the editor text → ignored with COPY-error.not_a_file. Dragging text within the editor behaves as normal text editing.
- Empty file → document becomes empty (not an error).
- File the browser cannot read → COPY-error.unreadable; previous document kept.
- Unexpected internal failure during any operation → COPY-error.failed; document unchanged (INV-03).
- File with CRLF line endings → kept as-is; the document's line ending is recorded (used by beautify).
- File or paste with mixed LF and CRLF → normalised to the dominant line ending (RULE-17).

## Open questions
