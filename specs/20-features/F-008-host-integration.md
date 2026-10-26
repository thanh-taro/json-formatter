---
id: F-008
title: Fit into the host portal
status: shipped
milestone: M-1
priority: P0
personas: [PER-02, PER-01]
entities: []
rules: [RULE-16]
screens: [SCR-Formatter]
components: []
nfr: [NFR-01, NFR-07, NFR-09]
events: []
depends_on: []
---

## Intent
Feel like a native part of the portal when embedded, and work fully on its own (PRN-05).

## Scope
- In: theme (light/dark) following the host or the system; filling the space the host gives;
  running standalone; accepting messages only from the trusted host.
- Out: sharing user content with the host (PRN-01); the host's own navigation and chrome; the
  language the host passes (F-012).

## Requirements
- **R1** When embedded, the tool uses the initial theme the host passes in its address from
  first display (no flash of the wrong theme), and follows later theme messages (RULE-16).
- **R2** When standalone, the tool follows the device's light/dark preference.
- **R3** The tool fills the area the host gives it and adapts when that area changes size.
- **R4** Only allowed host origins (RULE-16) can embed the tool; settings messages from any other
  origin are ignored.
- **R5** The only message the tool sends to the host is the ready signal; it never contains
  document content (INV-02, RULE-16).
- **R6** The tool works completely when opened standalone.

## Acceptance criteria
- **AC1** Given the host opens the tool with theme dark in its address, when the tool first displays, then it shows the dark theme with no light frame shown first. (R1)
- **AC2** Given the tool is embedded in light theme, when the host switches to dark, then the tool switches to dark without reloading or losing the document. (R1)
- **AC3** Given the tool is opened standalone on a device set to dark, when it loads, then it shows the dark theme. (R2)
- **AC4** Given the tool is embedded, when the host area is resized, then the tool fills the new area without a page scrollbar of its own. (R3)
- **AC5** Given a settings message from an origin not in the allowed list, when it arrives, then it is ignored. (R4)
- **AC6** Given the tool is embedded and the user uses every M-1 feature, when messages to the host are observed, then the only one is the ready signal, with no document content. (R5)
- **AC7** Given the tool is opened standalone, when the user uses every M-1 feature, then each works as specified. (R6)
- **AC8** Given a page whose origin is not in the allowed list, when it tries to embed the tool, then the browser refuses to display the tool inside it. (R4)

## UX notes
No visible controls for theme when embedded; the host owns it. SCR-Formatter has no header of its
own when embedded (the host shows the title).

## Edge cases
- Host sends an unknown theme value → keep the current theme.
- Host never sends a theme → follow the device preference.

## Open questions
