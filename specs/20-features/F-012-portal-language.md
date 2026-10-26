---
id: F-012
title: Use the portal's language
status: building
milestone: M-1
priority: P1
personas: [PER-02, PER-01]
entities: []
rules: [RULE-02, RULE-10, RULE-16, RULE-19]
screens: [SCR-Formatter]
components: [CMP-Toolbar, CMP-Editor, CMP-StatusBar, CMP-IssuePanel, CMP-Notice, CMP-ConfirmDialog, CMP-DropOverlay, CMP-SearchPanel, CMP-TreeView]
nfr: [NFR-01, NFR-05, NFR-06, NFR-07, NFR-09]
events: []
depends_on: [F-008]
---

## Intent
The portal is used in English and Vietnamese. The tool should speak the same language as the
portal around it, so it feels native (PRN-05), and pick a sensible language on its own when
opened standalone.

## Scope
- In: every user-facing string (copy.md) in each supported language (RULE-19); the language the
  host passes in the tool's address and in later settings messages (RULE-16); the fallback to the
  browser's language; marking the page language for assistive technology; formatting of counts,
  line and column numbers, and sizes for the active language.
- Out: the document itself and anything derived from it (keys, values, paths, the tree's node
  names) — it is user content and never changes with the language; JSON terms that are part of
  the standard (`true`, `false`, `null`, escape sequences, the tree's value kinds `object`,
  `array`, `string`, `number`, `boolean`, `null`); the product name "JSON Formatter" (also the
  page title); download file names (RULE-10); a language control inside the tool (the host owns
  it, like the theme); remembering the language on the device; languages other than en-US and
  vi-VN.

## Requirements
- **R1** The tool shows every user-facing string in the active language (RULE-19), from first
  display, with no frame in another language shown first, and marks the page with that language.
- **R2** When embedded, the tool follows later language messages from the host without reloading
  and without losing the document, its undo history, the selection, the view (text or tree, with
  the tree's expansion), the find state, or the chosen indent style (RULE-16).
- **R3** When the host passes no language, or one that is not supported, the tool picks the
  language per RULE-19: the browser's preferred languages, then en-US.
- **R4** Language messages are accepted only from allowed host origins and from the embedding
  page; messages from anywhere else, or with an unsupported value, are ignored (RULE-16, NFR-09).
- **R5** The document, every operation's result, validation results (codes, positions), paths,
  copied values and download file names are identical in every language (INV-01).
- **R6** Counts, line and column numbers, and sizes shown to the user are formatted the way the
  active language writes numbers; plural forms follow the active language.
- **R7** Text in every supported language renders in the tool's own typefaces and fits the layout
  down to 320 px wide without a horizontal scrollbar (NFR-07).

## Acceptance criteria
- **AC1** Given the host opens the tool with language vi-VN in its address, when the tool first displays, then every user-facing string on the page is the vi-VN text from copy.md, the page language is vi-VN, and no English UI text is shown first. (R1)
- **AC2** Given the host opens the tool with language en-US in its address, when it first displays, then every user-facing string is the en-US text and the page language is en-US. (R1)
- **AC3** Given the tool is embedded in vi-VN with an edited document, a selection, the tree view open with a node expanded, find open with a query, and indent set to 4 spaces, when the host sends a language message for en-US, then the UI switches to English without reloading, the page language is en-US, and the document, selection, view, expansion, find query and indent style are unchanged and undo still restores the previous edit. (R2)
- **AC4** Given the tool is embedded in vi-VN, when a language message arrives from an origin not in the allowed list, from a frame other than the embedding page, or with an unsupported value, then the language stays vi-VN. (R4)
- **AC5** Given the tool is opened with no language in its address, when the browser's preferred languages are `[vi]` or `[fr-FR, vi]`, then it shows vi-VN; and when they are `[fr-FR, en-GB, vi]` or `[fr-FR]`, then it shows en-US. (R3)
- **AC6** Given the host passes an unsupported language (e.g. fr-FR) in the address, when the tool first displays, then it behaves as if no language was passed (AC5). (R3)
- **AC7** Given the same document and actions (beautify, minify, re-indent, validate, copy path, copy value, download), when they are run in vi-VN and in en-US, then the document text, issue codes and positions, copied text and download file names are identical. (R5)
- **AC8** Given the tool is in vi-VN with a 1,234-line document of 1,500,000 bytes, when the status bar shows the size and line count, then the numbers use Vietnamese formatting (`1,5 MB`, `1.234`); in en-US the same values show `1.5 MB` and `1,234`. (R6)
- **AC9** Given the tool is in en-US, when a count is 1 (one line, one warning, one key, one item), then the singular word is used; in vi-VN the text has no plural change. (R6)
- **AC10** Given the tool is in vi-VN, when it displays, then Vietnamese UI text renders in the tool's own UI and mono typefaces, including letters such as `ễ`, `ộ`, `ư`, `đ`. (R7)
- **AC11** Given the tool is in vi-VN at 320 px wide, when every state of SCR-Formatter is shown, then there is no horizontal scrollbar and no control label is clipped. (R7)
- **AC12** Given copy.md, when the strings are generated, then every COPY ID that is not deprecated has a text for every supported language, with the same placeholders. (R1)
- **AC13** Given the tool was first opened in en-US, when it is reopened offline in vi-VN, then it loads and Vietnamese UI text renders in its own typefaces, and in every language the network log shows no font request after the initial load, whatever the user types (NFR-01). (R7)
- **AC14** Given the tool is in vi-VN with the tree view open, when the value kinds are shown, then they read `object`, `array`, `string`, `number`, `boolean`, `null` and each is marked as English. (R1)
- **AC15** Given the tool is in en-US showing COPY-notice.large for a 15,000,000-byte document (large tier, RULE-02), when the host switches to vi-VN, then the notice shows the vi-VN text with `15,0 MB`; and an open large-content dialog or progress bar switches its text the same way, with the pending choice or operation unchanged. (R2, R6)

## UX notes
No language control in the tool; the host owns it (RULE-16). The tree's value kinds stay in English
in every language and are marked as English inside a vi-VN page so screen readers pronounce them
correctly (NFR-06). Literal JSON tokens inside hints (`true`, `null`, escapes) stay as written. Toolbar labels, the status bar and the issue
panel are longer in Vietnamese; they wrap or use their existing narrow variants and are never
truncated (AC11). A live switch does not announce anything and does not move focus.

## Edge cases
- The address holds `vi` or `vi-vn` (no region or other letter case) → matched to vi-VN (RULE-19).
- The address holds `en-GB` → matched to en-US (same primary language, RULE-19).
- The host answers the ready signal with the language and re-sends it on every switch (RULE-16);
  the same value may arrive more than once and is applied each time with no visible change.
- The host sends a theme message and a language message together → both apply independently.
- A switch while an operation shows progress, or while the large-content dialog is open → the
  progress text and the dialog switch language; the operation and the pending choice are unchanged.
- Hints and notices already on screen switch language on a switch (they are re-rendered from their
  COPY IDs, not kept as text).

## Open questions
