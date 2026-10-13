# Gate G2 — Design

Canvas: https://claude.ai/artifact/8xP24369wHcxHjdw7QtKgW (v75) · mirror: design/canvas/ (44 boards)

| Check | Result | Evidence |
|---|---|---|
| Every M-1 screen state and component variant designed | pass | D1 (13 component boards) + D2–D4 (31 screen/flow boards); narrow size/lines fixed in round 3 |
| Design auditor: no blockers | pass | design-D1-round-1/2, design-D2-round-1/2 audits; round 3 fixes applied |
| Every text uses a COPY ID | pass | scripted check: all data-copy IDs exist and texts match copy.md |
| Only tokens used | pass (colors) / accepted minors | colors scripted equal tokens.json; some layout px (e.g. 160/240/400 widths) not tokenised — accepted minor |
| Contrast + touch targets | pass | a11y-design.md: 0 text < 4.5:1, 0 icons < 3:1 over 79 renders; ≥24 px desktop, ≥44 px narrow |
| Adapter matches tool | pass | adapters/design.md (Claude Design canvas, naming) |

Choices made: Workbench style (D-010); tree actions in a selected-row header bar (D-018); soft-wrap under 600 px (D-019); notices/toasts/confirm as components; 4 px grid sizes.
Accepted minors: untokenised layout widths, no flow connectors on the canvas, "Warnings (0)" tab while invalid.
Manual follow-ups for QA: screen-reader pass, real focus order, 200% zoom, forced colors.
