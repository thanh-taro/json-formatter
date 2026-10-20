---
id: F-009
title: Show the privacy guarantee
status: shipped
milestone: M-1
priority: P1
personas: [PER-01]
entities: []
rules: []
screens: [SCR-Formatter]
components: [CMP-StatusBar]
nfr: [NFR-01, NFR-07]
events: []
depends_on: []
---

## Intent
Users only trust a tool with secrets if they know it is safe — tell them plainly, and make the
claim true by construction (PRN-01).

## Scope
- In: a visible statement that content stays on the device, with a short explanation, and an
  always-visible link to the source repository so anyone can check the claim in the code.
- Out: proving it in the UI (the guarantee itself is NFR-01).

## Requirements
- **R1** A short privacy statement is always visible.
- **R2** The user can open a brief explanation of what the tool does and does not do with their data.
- **R3** A link to the source repository (`https://github.com/thanh-taro/json-formatter`) is always
  visible in the status area. It opens the repository in a new tab (standalone; embedded once the
  portal allows new tabs, architecture A3), without sending a referrer and
  without changing the document.

## Acceptance criteria
- **AC1** Given the tool is open, when the user looks at the status area, then COPY-privacy.badge is visible. (R1)
- **AC2** Given the privacy statement, when the user activates it, then COPY-privacy.details is shown and can be dismissed. (R2)
- **AC3** Given the tool is open standalone or embedded, at 320 px and at desktop width (NFR-07), when the user looks at the status area, then a link named COPY-privacy.source_label is visible next to the privacy statement and points to the source repository, without horizontal scrolling of the status area. (R3)
- **AC4** Given the tool is open standalone, when the user activates the source link, then the source repository opens in a new tab with no referrer, and the document, its undo history and the tool's state are unchanged. (R3)

## UX notes
CMP-StatusBar holds COPY-privacy.badge; details open as a small popover, which ends with a
COPY-privacy.notices link to the open-source licence notices shipped with the tool. The source
link (D-033) sits after the privacy statement at the inline end of CMP-StatusBar, as the GitHub mark
(D-034) followed by COPY-privacy.source (D-035); its accessible name and tooltip are
COPY-privacy.source_label, which contains the visible text.

## Edge cases
- Narrow widths → the statement may shorten to an icon labelled COPY-privacy.badge_label; the
  source link likewise shortens to its icon, still named COPY-privacy.source_label.
- Embedded in the portal, whose frame does not allow new tabs (architecture A3) → the browser
  blocks the source link, as it does the notices link; the tool does nothing else. The portal is
  asked to allow them (A3 change request); until then the link works standalone only.
- Opening the link is a navigation the user starts in a new tab; the tool itself makes no request (NFR-01).

## Open questions
