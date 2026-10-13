# Design audit - D2-D4 (screen + flow artboards) - round 1

Scope: 31 non-component artboards (FLOW-01 x4, FLOW-02 x3, FLOW-03 x4 + SCR-Find, Edge x12, Narrow x7), each with dark/light tweak.
Method: scripted checks over design/canvas/*.dc.html (token map vs tokens.json, data-copy vs copy.md, ids/ARIA refs, inline sizes, toolbar/CSS diff vs D1, sample-JSON line/column/size recount) plus manual read against SCR-Formatter, FLOW-01..03, F-001..F-011.

## Passed (no findings)
- All 31 frames expose theme enum dark/light; both theme blocks equal tokens.json (25 roles each). No raw hex/rgb outside theme blocks.
- Every data-copy ID exists; text matches copy.md (templates and singulars OK). No visible UI string without data-copy except gutter numbers, "Aa" (same as D1), and code identifiers (`trailing-comma`, `unsafe-number`).
- Sample JSON consistent: trailing comma at Line 9, col 50 (line 9 is 50 chars, comma last); unsafe-number at 3:11, 4:12 (beautified) and 1:16, 1:39 (minified, 251 B, cursor col 252); sizes 340 B/14 lines, 339 B, 415 B/25 lines, 31.6 KB/1,506 lines all recount correctly; Show-in-text selection lines 10-15 with cursor Ln 10, Col 5 matches tree row events[1].
- SCR-Formatter states all present: empty, default (Main), loading, error, large, confirm, plus busy, undo-trimmed, encoding, too-large, not-a-file, download, tree-checking, tree-too-large. Flow steps match design-plan D2/D3 (FLOW-01 x4, FLOW-02 x3, FLOW-03 x4).
- Narrow: 44px targets via `.coarse` for toolbar, seg, tabs, tree rows, dialog, dismiss, status badge (exception below). ARIA ids/labelledby all resolve in D2-D4 frames.
- Known gap (not counted): narrow tree row actions absent.

## Findings
| Frame | Finding | Spec ID | Severity |
|---|---|---|---|
| Edge-Clipboard | Plan D4 lists "clipboard blocked (text + tree fallback field)"; only the text variant exists. No frame shows the tree view with the read-only field holding the path/value, selected, with COPY-error.clipboard (field exists only in D1 CMP-TreeView). | F-006.R9/AC12, F-007.AC7, CMP-TreeView | major |
| Narrow-Find | Prev / Next / Close icon buttons carry inline `width:28px;height:28px`, overriding `.coarse .ibtn` 44px. Same inline override is in desktop SCR-Find (fine there) and was copied to narrow. Violates >=44px coarse targets. | F-010, NFR-07, tokens size.touchTarget | major |
| Narrow-Find | Issue panel omitted although the document has 2 warnings (Narrow-Default shows it); inconsistent with the layout region rule, and no note that it is intentionally hidden. | SCR-Formatter layout 4, F-005.R4 | minor |
| Edge-TreeChecking | Tree header shows a determinate progress bar (64%) and a Cancel button; spec for "checking" is only COPY-tree.checking with the previous tree dimmed (progress+cancel belong to COPY-progress.tree building). | F-006.R10/AC13, CMP-TreeView | minor |
| Edge-TreeTooLarge | Adds a "Text" action button (reuses COPY-view.text) not in the spec for COPY-tree.too_large; harmless but unspecified. | F-006.AC11 | minor |
| FLOW-03 (set) | FLOW-03 exit "document invalid -> tree explains + jump to error -> FLOW-02" has no frame (COPY-tree.invalid / go_to_error only in D1 CMP-TreeView). Not in plan; flag for plan update. | FLOW-03 exits, F-006.R7/AC8 | minor |
| FLOW-01/02/03 (canvas.json) | No connectors/links between steps and no cross-flow link (FLOW-01 invalid -> FLOW-02; FLOW-03 invalid -> FLOW-02); only page titles. Frames are ordered left-to-right with 80px gaps. | FLOW-01..03 diagrams | minor |
| All D2-D4 frames | No spec-ID link inside artboards ("each artboard links its spec ID"); only the title. | adapters/design.md Review | minor |
| SCR-Find.dc.html | File name uses SCR-Find but the screen ID is SCR-Formatter (title is correct: "SCR-Formatter / find open / embedded"). Flow titles carry a `· name` suffix beyond `<FLOW-ID> / step <n>`. | adapters/design.md Naming | minor |
| Edge-Busy, Edge-Loading, Edge-TreeChecking | Progress bars use raw `aria-label="Formatting… 42%"` / "Reading file… 18%" / "Updating tree…" (text equals copy but no COPY ID attribute). | adapters/design.md Copy | minor |
| FLOW-01-2-Pasted | Beautify focus ring is an inline `style="outline:..."` rather than the `.focus` class used elsewhere. | D1 consistency | minor |
| All issue-panel frames | `role="tab"` buttons have no `aria-controls` for tabpanel `ip-p` (also in D1). | CMP-IssuePanel a11y | minor |
| Coverage (D1-only) | COPY-progress.tree, COPY-progress.exporting, COPY-notice.no_indent, COPY-notice.multiple_files, COPY-search.none, COPY-drop.hint, COPY-privacy.details and 15 of 18 error hints are shown only in D1 components (hints nowhere). Acceptable if D1 is the home; no screen frame shows them in context. | F-001 edge, F-004.R5, F-005 hints, F-007.R6, F-009.R2 | minor |
| D1 (consistency) | `#0B0810` raw hex in every CMP-*.dc.html (outside theme blocks) is not in tokens.json; tree rows/tabs use 24px/32px/52px with no size token (tokens: codeLine 20px for tree rows, tree row drawn 24px). Frames inherit it. | tokens.json, adapters/design.md Tokens | minor |
| Main.dc.html (D1) | `aria-*` references id `m-p1`, which does not exist in the file. | CMP-StatusBar a11y | minor |

No blockers.
