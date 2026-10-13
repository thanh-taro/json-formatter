# Design D1 — round 1 (merged audit + critique)

Sources: design-D1-round-1-audit.md (26 findings), design-D1-round-1-critique.md (15 findings). No blockers.

## Spec-side fixes (done)
- New CMP-Notice (progress/info/error bars + toast) and CMP-ConfirmDialog; SCR-Formatter regions/states updated.
- Copy: issue badges/tabs/collapse, cursor, valid-with-warnings, tree kinds/counts/group, go-to-error, dismiss.
- CMP-Editor variants: empty, warning, all-selected; gutter marks. CMP-StatusBar narrow variant.
- Tokens on the 4 px grid: toolbar 40, statusbar 28, panelHeader 32, treeRow 24. Style: controls use lineStrong borders, no shadows, disabled = muted (no opacity), min text font.size.xs.

## Design-side fixes (round 2 rework)
- Empty state (editor + Main variant); notices/errors/toast/confirm frames; whole-document clipboard fallback.
- Targets: ≥24 px everywhere (status buttons, tree actions/twisty, issue tabs), 44 px on the 390 px coarse-pointer frames.
- Busy: toolbar controls stay in place (disabled); progress + cancel in a CMP-Notice bar.
- View switch: selected segment with accent underline + lineStrong borders; indent selector as a real button/listbox; custom field 24 px+, 16 px text on coarse.
- IssuePanel: real tabs with padding; Main uses identical structure; hint as message, code as secondary; "1,204" grouping.
- ARIA: editor textbox (multiline); issue list ul/li with buttons; status live region only on validity.
- No unlabeled strings: every UI text has a data-copy; remove hard-coded shadow/opacity/off-scale sizes.
- Gutter marks for current/error/warning lines; tree/status narrow variant.

## Round 2 → 3 triage
- Fixing in round 3: toolbar empty-document disabled set (spec updated), busy chevron shift, coarse view switch ≥44 px, "1 line" singular, artboard heights.
- Deferred by plan (not D1 scope): 390 coarse frames for Notice/ConfirmDialog/TreeView/IssuePanel/DropOverlay → D4; Main empty/loading/error/large/confirm/narrow states → D2–D4.
