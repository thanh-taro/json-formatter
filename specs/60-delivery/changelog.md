# Changelog

Spec changes to items in `building` or `shipped` status are recorded here.

## 2026-10-13
- Initial M-1 spec set (draft).
- Spec review rounds 1–2 applied (see .build-my-app/reports/spec-review-round-*.md); decisions D-001…D-007.
- User approved gate G1 and delegated the status change: F-001…F-009, SCR-Formatter, CMP-*, FLOW-01…03 set to `ready`.
- NFR-07: minimum width lowered from 480 px to 360 px so the tool works in the portal's phone layout (D-012).
- Architecture clarifications accepted (D-015): RULE-17 mixed line endings normalised; RULE-02 + F-002.R7/AC10 confirmation for beautify results over 100 MB; F-007.R5/AC6 limited to detectable download blocks.
- Added F-010 Find text in the document (D-013), F-011 Work offline (D-014), CMP-SearchPanel, RULE-18, find copy — status draft.
- D1 design review: added CMP-Notice, CMP-ConfirmDialog; copy for issue/tree labels, cursor, valid-with-warnings; editor empty/all-selected/warning variants; status bar narrow; tokens toolbar 40, statusbar 28, panelHeader 32, treeRow 24 (4 px grid).
- Spec review of post-G1 items: NFR-01 covers offline-cache registration/update check at page open; F-011.AC3 aligned; F-004.R7/AC8 confirmation for re-indent over 100 MB; F-010 ACs tightened (cursor, 100 MB, toolbar, case, overlap, recount).
- User delegated status change: F-010, F-011, CMP-SearchPanel, CMP-Notice, CMP-ConfirmDialog set to `ready`.
- D1 round 2: accessible-name copy (COPY-label.toolbar/view/issues/tree), singular-form notes, Clear disabled on empty document.
