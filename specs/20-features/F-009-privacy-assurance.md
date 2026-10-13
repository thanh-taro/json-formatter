---
id: F-009
title: Show the privacy guarantee
status: ready
milestone: M-1
priority: P1
personas: [PER-01]
entities: []
rules: []
screens: [SCR-Formatter]
components: [CMP-StatusBar]
nfr: [NFR-01]
events: []
depends_on: []
---

## Intent
Users only trust a tool with secrets if they know it is safe — tell them plainly, and make the
claim true by construction (PRN-01).

## Scope
- In: a visible statement that content stays on the device, with a short explanation.
- Out: proving it in the UI (the guarantee itself is NFR-01).

## Requirements
- **R1** A short privacy statement is always visible.
- **R2** The user can open a brief explanation of what the tool does and does not do with their data.

## Acceptance criteria
- **AC1** Given the tool is open, when the user looks at the status area, then COPY-privacy.badge is visible. (R1)
- **AC2** Given the privacy statement, when the user activates it, then COPY-privacy.details is shown and can be dismissed. (R2)

## UX notes
CMP-StatusBar holds COPY-privacy.badge; details open as a small popover.

## Edge cases
- Narrow widths → the statement may shorten to an icon labelled COPY-privacy.badge_label.

## Open questions
