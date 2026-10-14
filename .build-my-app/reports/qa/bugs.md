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
