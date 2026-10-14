# QA bugs — JSON Formatter M-1

Visual evidence: `.build-my-app/reports/qa/visual/{design,app,compare}/` (compare = design left, app right). Design boards were rendered with `{{theme}}` substituted (the boards' support.js is not in the repo) in Chromium; the design's web fonts were blocked, so tiny glyph-width differences are not reported. Captured by `VISUAL=1 ... playwright test visual-capture` (tests/e2e/visual-capture.spec.ts).

Run summary: all tests pass; no functional e2e failure. The bugs below are design/spec conformance defects the suite does not detect.

## QA-001 (major) Narrow toolbar has no overflow menu; Tree, Copy, Download unreachable on phones
- Spec: CMP-Toolbar "narrow: groups collapse into an overflow menu (COPY-action.more)"; NFR-07 (usable down to 360 px); NFR-06 touch; boards SCR-Formatter_*_narrow (toolbar: Beautify, Minify, Text|Tree, Copy, "...").
- Steps: open `/?theme=dark` at 390x760 with touch emulation (Chromium isMobile, hasTouch). Inspect the toolbar.
- Expected: compact toolbar with an overflow "More actions" menu; every action reachable.
- Actual: the full desktop toolbar is rendered, `overflow-x: hidden`, scrollWidth 1014 px vs 390 px; Text, Tree, Copy, Download sit at x 707-998, i.e. clipped and not scrollable by touch. `COPY-action.more` is not used anywhere in src. Existing narrow e2e tests pass only because Playwright scrolls clipped controls into view programmatically.
- Evidence: compare/SCR-Formatter_{default,error,find-open,tree,toast,notice,confirm,empty}_narrow.{dark,light}.png (app/ for raw).

## QA-002 (minor) Beautify is not the filled accent button
- Spec: style.md rule 2 "Beautify is the only filled control (accent/onAccent)"; all design boards show it filled.
- Actual: Beautify is rendered as a plain text button in both themes.
- Evidence: compare/FLOW-01_step2.light.png, FLOW-02_step1.dark.png.

## QA-003 (minor) Indent selector differs from design
- Spec/design: CMP-Toolbar pill showing label "Indent" + value ("Indent  2 spaces") with chevron.
- Actual: native-looking select showing only "2 spaces" (no "Indent" text, native arrow); wider box.
- Evidence: compare/FLOW-02_step1.dark.png.

## QA-004 (minor) Find panel narrow layout differs
- Design (SCR-Formatter_find-open_narrow): row 1 = field only; row 2 = match case, count, previous, next, close.
- Actual: close button on row 1 beside the field; row 2 = match case, count, previous, next.
- Evidence: compare/SCR-Formatter_find-open_narrow.dark.png. (Controls remain >= 44 px per F-010 tests.)

## QA-005 (minor) Status bar shows cursor position in the tree view
- Design (tree boards, embedded): status bar in tree view has no "Ln, Col" segment.
- Actual: "Ln 1,506, Col 2" shown with the tree.
- Evidence: compare/SCR-Formatter_tree-clipboard_embedded.dark.png, tree-checking_embedded.dark.png.

## Not captured / notes (not bugs)
- SCR-Formatter error-download: deprecated (D-023, COPY-error.download not shown); not implemented, as specified.
- SCR-Formatter tree-too-large (148 MB) and undo-trimmed light: not captured (heavy); covered functionally by F-006.AC11 and F-001.AC12 tests; undo-trimmed dark captured.
- "Embedded" boards were captured standalone at 1200x760 (same layout); the embedded-host behaviour is covered by host.spec.ts and f007 embedded clipboard test.
- Firefox: not run.
- Matches within tolerance: FLOW-01/02/03 steps, Main, empty, find (embedded), loading, busy, large notice, confirm, errors (encoding, too large, not-a-file, clipboard), tree checking, tree clipboard, both themes (colours, regions, copy).

## Triage — all QA audits (2026-10-14)
Sources: qa-runner (this file above), a11y.md, security.md, perf.md, license-audit-2.md. No blockers.

| ID | Sev | Area | Finding | Fix group |
|---|---|---|---|---|
| QA-001 | major | UI | 390 px: no overflow menu; Tree/Copy/Download clipped, unreachable by touch | A |
| QA-010 | major | a11y | Coarse pointer toolbar buttons 28 px (44 px required) | A |
| QA-011 | major | a11y | Reflow fails at 320 px (min-width 360; NFR-07 now 320, D-029) | A |
| QA-012 | major | a11y | No forced-colors rules; pressed/selected states indistinguishable | A |
| QA-013 | major | a11y | Focus lost to body after Minify, file-open Cancel, notice dismiss | A |
| QA-014 | major | privacy | Tree keys/values/path lack translate="no" (auto-translate could send content off device) | B |
| QA-015 | major | find | Find count doubled when the term is typed character by character | B |
| QA-016 | major | perf | First keystroke < 300 ms after opening Find at 100 MB takes ~137 ms (NFR-02) | B |
| QA-002..005 | minor | UI | Beautify not accent-filled; indent selector style/label; narrow Find layout; Ln/Col in tree view | A |
| QA-020 | minor | a11y | No h1/landmarks; editor focus ring; Go to error doesn't focus editor (+ others in a11y.md) | A |
| QA-021 | minor | license | No UI link to /third-party-notices.txt | A |
| QA-022 | minor | license | check-licenses lacks dist/ scan (ADR-0001 rule 6); duplicate lucide-static; DEP-22/33 not direct; notices list unbundled crelt/streamparser | C |
| QA-023 | minor | security | Trusted Types; CI persist-credentials; corpus hash pinning; pnpm trustPolicy/blockExoticSubdeps/strictDepBuilds; tighter Permissions-Policy | C |
| QA-024 | minor | tree | Expansion restore: duplicate keys after earlier insert; renamed key exhausts 200-block budget | B |
| QA-025 | minor | perf | Chromium scroll memory peaks 1.25–1.6 GB (after-GC 0.65–0.86 passes); fast scrollbar drags drop 1–9 frames | record |
| QA-026 | major | release | No deploy workflow / post-deploy header smoke test | phase 6 |

Process: each fix starts with a failing test, then the fix, then the full suite.

## Round 2 (2026-10-14) — verification of fix groups A, B, C on main (c40c3ab)

Build `pnpm build`; `E2E_PORT_BASE=4873 CI=1`. Chromium + WebKit (390/320 touch emulation; forced colors Chromium). Independent probe: `tests/e2e/qa-round2.spec.ts` (22 executions, all pass; evidence in `visual/round2/*.{chromium,webkit}.png`); regression suites named below are in the full run (401 pass, 57 skip by design, 0 fail, 0 flaky). Design comparison: `visual/round2/compare/` (design left, app right; raw in `visual/round2/app/`).

| ID | Status | Evidence (test; screenshot in `.build-my-app/reports/qa/visual/round2/`) |
|---|---|---|
| QA-001 | FIXED | R2 QA-001 narrow 390 and 320 touch (both engines): Beautify, Minify, Text, Tree, Copy, More tappable in bar, Download/Open/Find/Re-indent/Clear/indent in menu, scrollWidth <= width, real taps, download from menu works; QA-001_narrow-{390,320}-{default,tree,menu}.{chromium,webkit}.png |
| QA-002 | FIXED | R2 QA-002 desktop dark+light: Beautify bg = accent, Minify not; QA-002-003-020_main.{dark,light}.* |
| QA-003 | FIXED | visible "Indent" label next to value; same shots |
| QA-004 | FIXED | R2 QA-001 (find step): field alone on row 1, rest below, all >= 44 px; QA-004_find-narrow-{390,320}.* ; compare/SCR-Formatter_find-open_narrow.* matches design |
| QA-005 | FIXED | cursor segment hidden in tree; QA-005_tree.{dark,light}.* |
| QA-010 | FIXED | all toolbar/menu/find targets >= 44 px under touch (R2 QA-001 + qa-a QA-010 test) |
| QA-011 | FIXED | no horizontal scroll at 320x640 incl. find and notice; QA-011_notice-320.*; qa-a QA-011 (320x256, 320x640, 640x512) |
| QA-012 | FIXED (Chromium emulation) | R2 QA-012: pressed/selected/toggle/tree-selected computed styles differ; QA-012_forced-colors-{main,find,tree}.chromium.png. Real Windows High Contrast still manual |
| QA-013 | FIXED | R2 QA-013 (both engines): focus on Minify/Beautify button after run, editor after notice dismiss; qa-a QA-013 covers Open-cancel dialog and Escape on notice; QA-013_focus-after-dismiss.* |
| QA-014 | FIXED | R2 QA-014 + f006-tree `QA-014 ... translate="no"`: editor, tree rows, path, find field never translatable; QA-014_tree.* |
| QA-015 | FIXED | R2 QA-015 (3 repeats, both engines): keys typed immediately after Ctrl/Cmd+F land in the field, count 1 of 3, document unchanged; f010 QA-015 tests; QA-015_find-count.* |
| QA-016 | FIXED by root-cause test (not re-measured) | f010 `QA-016 ... 100 MB typing right after opening find` passes on Chromium (skipped on WebKit by design). The 137 ms wall number from perf.md was not re-measured; confirm with a perf re-run if wanted |
| QA-020 | FIXED | banner/main landmarks present (R2 QA-002..), axe `region` and heading rules clean on all main states both themes; editor focus ring solid 2 px; qa-a QA-020 tests (Go to error focuses editor) |
| QA-021 | FIXED | R2: privacy dialog link href /third-party-notices.txt; QA-021_privacy.{dark,light}.* |
| QA-022 | FIXED | `pnpm check:licenses`: dist/ scanned, 18 packages ship, all registered; tests/unit/dist-scan.test.ts |
| QA-023 | FIXED (Trusted Types documented as not enforced) | headers.test.ts (Permissions-Policy), pnpm-workspace/CI changes reviewed in git; not runtime-verifiable here |
| QA-024 | FIXED | tests/unit/tree-expansion.test.ts + f006 restore test (pass) |
| QA-025 | OPEN (recorded, accepted) | unchanged; perf.md R3/R4 |
| QA-026 | OPEN (phase 6) | no deploy workflow in repo |

Design comparison (group A states, both themes, `visual/round2/compare/`): narrow default/find/error/notice/tree/toast/confirm/empty, FLOW-01..03, tree boards. Now match: filled Beautify, More menu, indent label, find layout, no Ln/Col in tree. Remaining differences (not bugs of the round-1 list): see N-1, N-2. Confirm/toast narrow boards differ in fixture only (capture shows 200 MB, a lingering "Copied" toast), not in design.

### New findings
- **N-1 (minor, UI, CMP-Toolbar / style.md)** Narrow Text|Tree switch: the design shows a bordered pill group with the active segment filled; the app shows the pressed segment bordered and Tree as bare text (compare/SCR-Formatter_default_narrow.dark.png). Steps: open `/?theme=dark` at 390 px with content. Expected: segmented control as in SCR-Formatter_default_narrow.
- **N-2 (minor, UI)** Narrow editor shows the 2 px accent focus ring around the whole editor on load (QA-020 fix); the boards show none. Likely accepted (a11y); confirm with design.
- **N-3 (info, F-010.R1 / NFR-06)** In the overflow menu, pressing Enter on More actions and ArrowDown within the same instant moves to Open file, not Find (menu focus lands one frame after open). Only reproducible with synthetic keys sent < 16 ms apart; Find itself then takes keys immediately. No fix required.
- **N-4 (known, a11y.md M-A4)** WebKit default does not Tab to buttons in the find panel, privacy badge etc.; not in the triage table; needs real Safari (manual M5).
- Test harness: visual-capture.spec.ts and openFile helper assumed Open/Find in the narrow toolbar; capture spec updated to use the overflow menu (`VISUAL_OUT` env var added). No product defects found in round 2; no regressions.
