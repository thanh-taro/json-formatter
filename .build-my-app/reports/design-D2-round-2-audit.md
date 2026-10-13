# Design D2–D4 — round 2 re-audit (design-auditor, relayed)

Round-1 majors: all resolved, no regressions. Scripted: theme blocks = tokens.json; no raw colors in screens; all data-copy IDs exist and match; ARIA ids resolve; token_contrast 0 failures.

| Frame | Finding | Spec | Sev |
|---|---|---|---|
| 8 narrow SCR frames | size/lines dropped; must be always visible | F-005.R6 | major |
| CMP-StatusBar narrow | "451 B · 14 lines" contradicts sample | – | minor |
| many boards | untokenised px (52,76,96,160,240,280,400); #0B0810 backdrop | design.md | minor |
| error-bar btn.out | dark lineStrong on dangerBg 2.9:1 | NFR-06 | minor |
| FLOW-02 s1/s2, Narrow-Error | "Warnings (0)" tab while invalid | copy | minor |
| FLOW-01/02/03 | no connectors/spec links; no FLOW-02 beautify step | design.md | minor |
| D1 | 16 of 20 hints never shown; raw aria-labels | F-005.R3 | minor |
| FLOW-01 s4 | copy confirmed in-button, not toast | CMP-Notice | minor |

G2: (a) FAIL (narrow size/lines) · (b) PASS · (c) PASS · (d) PASS colors, minor px · (e) PASS, one 2.9:1 minor · (f) PASS, minors.
