# Traceability — JSON Formatter M-1

Run date: 2026-10-14 (QA round 2, main c40c3ab + QA tests). Build: `pnpm build` (fresh). Commands: `pnpm test` (vitest), `E2E_PORT_BASE=4873 CI=1 pnpm exec playwright test --project=chromium --project=webkit`.
Firefox: cannot launch on this machine — **not run**.

## Last results (fresh full run)
- Unit/property/conformance (vitest): 35 files, 397 tests, all pass.
- E2E Chromium + WebKit: 458 executions = 401 pass, 57 skipped, 0 fail, 0 flaky (Chromium 208 pass/21 skip, WebKit 193 pass/36 skip; skips are WebKit best-effort >100 MB cases, Chromium-only visual/forced-colors/axe cases and the VISUAL-only capture, each has a Chromium pass). Plus `tests/e2e/qa-round2.spec.ts`: 22 executions, all pass (run separately).
- `pnpm typecheck`, `pnpm lint`, `pnpm spec:lint` (402 IDs, 0 errors), `pnpm check:size` (critical path 176.9 KB of 250 KB), `pnpm check:licenses` (incl. dist/ scan): pass.
- Visual capture (`VISUAL=1 VISUAL_OUT=...round2/app`): 65 screenshots in `.build-my-app/reports/qa/visual/round2/app`, side by side with the boards in `round2/compare`.
- Bugs: `.build-my-app/reports/qa/bugs.md` (Round 2 section): all round-1 bugs fixed except QA-025 (accepted) and QA-026 (phase 6); 2 new minor UI notes, 0 regressions.
- Tests added in QA: AC tests listed below plus QA-regression tests (qa-a-ui-a11y.spec.ts, f006 QA-014/QA-024, f010 QA-015/QA-016, unit dist-scan/headers/tree-expansion) are part of the run.

## Flows (one e2e each)
| Flow | Test | Chromium | WebKit |
|---|---|---|---|
| FLOW-01 | tests/e2e/flows-01-03.spec.ts: `FLOW-01 F-001.R1 F-002.R1 F-007.R1 F-007.R2 paste, validate, beautify, copy and download` | pass | pass |
| FLOW-02 | tests/e2e/f005-validate.spec.ts: `FLOW-02 F-005.R1 F-005.R5 read the error, jump to it, fix it, and the document becomes valid` | pass | pass |
| FLOW-03 | tests/e2e/flows-01-03.spec.ts: `FLOW-03 F-001 F-006.R1 ... tree: expand to a node, copy path and value, show in text` | pass | pass |

Also: tests/e2e/m1-session.ts (used by smoke/host specs) exercises every M-1 feature once, standalone and embedded (F-008.AC6/AC7, NFR-01).

## Acceptance criteria (M-1 features F-001 … F-011)
Results: pass = all matching tests passed; pass/skip = some matching tests skipped on that engine (documented best-effort), the rest passed.

### F-001

| AC | Test(s) (file: title) | Chromium | WebKit |
|---|---|---|---|
| F-001.AC1 | f001-load.spec.ts: F-001.AC1 pasting {"a":1} into an empty document gives exactly that te | pass | pass |
| F-001.AC2 | f001-load.spec.ts: F-001.AC2 dropping a UTF-8 file data.json replaces the document and re | pass | pass |
| F-001.AC3 | f001-load.spec.ts: F-001.AC3 choosing a UTF-8 file with the open action replaces the docu | pass | pass |
| F-001.AC4 | f001-load.spec.ts: F-001.AC4 RULE-02 a 30 MB file loads and COPY-notice.large is shown | pass | pass |
| F-001.AC5 | f001-load.spec.ts: F-001.AC5 RULE-02 a 150 MB file asks first and replaces nothing until <br>f001-load.spec.ts: F-001.AC5 RULE-02 after Continue the 150 MB file replaces the document | pass | pass/skip |
| F-001.AC6 | f001-load.spec.ts: F-001.AC6 RULE-13 INV-03 a file with invalid UTF-8 is refused with COP | pass | pass |
| F-001.AC7 | f001-load.spec.ts: F-001.AC7 clearing a non-empty document empties it | pass | pass |
| F-001.AC8 | f001-load.spec.ts: F-001.AC8 INV-04 undo after a dropped file restores the previous docum | pass | pass |
| F-001.AC9 | f001-load.spec.ts: F-001.AC9 INV-03 cancelling a large file while it loads keeps the prev<br>f001-load.spec.ts: F-001.AC9 review B1 cancelling while the final commit waits for the bu | pass | pass/skip |
| F-001.AC10 | f001-load.spec.ts: F-001.AC10 INV-03 when the device cannot hold the file, COPY-error.too | pass | pass |
| F-001.AC11 | f001-load.spec.ts: F-001.AC11 RULE-02 pasting 120 MB asks first and inserts nothing until<br>f001-load.spec.ts: F-001.AC11 RULE-02 after Continue the 120 MB paste is inserted | pass | pass/skip |
| F-001.AC12 | f001-load.spec.ts: F-001.AC12 RULE-15 with 5 loads of 30 MB only the last 3 undo; COPY-no | pass | pass |

### F-002

| AC | Test(s) (file: title) | Chromium | WebKit |
|---|---|---|---|
| F-002.AC1 | f002-beautify.spec.ts: F-002.AC1 F-002.R2 beautifies a minified object with the default 2-spa | pass | pass |
| F-002.AC2 | f002-beautify.spec.ts: F-002.AC2 indent style tab indents every nesting level with exactly on | pass | pass |
| F-002.AC3 | f002-beautify.spec.ts: F-002.AC3 RULE-01 a custom indent of 3 spaces adds exactly 3 spaces pe | pass | pass |
| F-002.AC4 | f002-beautify.spec.ts: F-002.AC4 numbers keep their spelling and keys keep their order | pass | pass |
| F-002.AC5 | f002-beautify.spec.ts: F-002.AC5 both members of a duplicate key remain in their original ord | pass | pass |
| F-002.AC6 | f002-beautify.spec.ts: F-002.AC6 INV-03 an invalid document is unchanged; the trailing-comma  | pass | pass |
| F-002.AC7 | f002-beautify.spec.ts: F-002.AC7 INV-04 one undo restores the document exactly as before beau | pass | pass |
| F-002.AC8 | f002-beautify.spec.ts: F-002.AC8 50 MB: progress, scroll and cancel work; editing and other a | pass | pass |
| F-002.AC9 | f002-beautify.spec.ts: F-002.AC9 a CRLF document stays CRLF and keeps one final line break | pass | pass |
| F-002.AC10 | f002-beautify.spec.ts: F-002.AC10 RULE-02 a result over 100 MB asks first; declining leaves t<br>f002-beautify.spec.ts: F-002.AC10 choosing COPY-action.continue beautifies into a document ov | pass | pass/skip |

### F-003

| AC | Test(s) (file: title) | Chromium | WebKit |
|---|---|---|---|
| F-003.AC1 | f003-minify.spec.ts: F-003.AC1 minifies to the most compact equivalent text | pass | pass |
| F-003.AC2 | f003-minify.spec.ts: F-003.AC2 numbers appear exactly as written | pass | pass |
| F-003.AC3 | f003-minify.spec.ts: F-003.AC3 INV-03 an invalid document is unchanged; the single-quotes e | pass | pass |
| F-003.AC4 | f003-minify.spec.ts: F-003.AC4 INV-04 one undo restores the previous text exactly | pass | pass |
| F-003.AC5 | f003-minify.spec.ts: F-003.AC5 50 MB: progress, scroll and cancel work; editing and other a | pass | pass |

### F-004

| AC | Test(s) (file: title) | Chromium | WebKit |
|---|---|---|---|
| F-004.AC1 | f004-reindent.spec.ts: F-004.AC1 4·n leading spaces become n tabs | pass | pass |
| F-004.AC2 | f004-reindent.spec.ts: F-004.AC2 each leading tab becomes 2 spaces | pass | pass |
| F-004.AC3 | f004-reindent.spec.ts: F-004.AC3 a compact array line keeps its layout and the number of line | pass | pass |
| F-004.AC4 | f004-reindent.spec.ts: F-004.AC4 an invalid document with a trailing comma is re-indented and | pass | pass |
| F-004.AC5 | f004-reindent.spec.ts: F-004.AC5 INV-04 one undo restores the previous text exactly | pass | pass |
| F-004.AC6 | f004-reindent.spec.ts: F-004.AC6 a minified document is unchanged and COPY-notice.no_indent i | pass | pass |
| F-004.AC7 | f004-reindent.spec.ts: F-004.AC7 a 50 MB document shows progress, scrolls, blocks other actio | pass | pass |
| F-004.AC8 | f004-reindent.spec.ts: F-004.AC8 RULE-02 a result over 100 MB asks first; Cancel changes noth<br>f004-reindent.spec.ts: F-004.AC8 RULE-02 after Continue the re-indented result replaces the d | pass | pass/skip |

### F-005

| AC | Test(s) (file: title) | Chromium | WebKit |
|---|---|---|---|
| F-005.AC1 | f005-validate.spec.ts: F-005.AC1 F-005.R1 F-005.R2 a character that makes a valid document in | pass | pass |
| F-005.AC2 | f005-validate.spec.ts: F-005.AC2 trailing comma at line 2 column 8 with COPY-hint.trailing_co | pass | pass |
| F-005.AC3 | f005-validate.spec.ts: F-005.AC3 {"a": True} → invalid-literal at line 1 column 7 with COPY-h | pass | pass |
| F-005.AC4 | f005-validate.spec.ts: F-005.AC4 two top-level values → extra-content at line 1 column 10 | pass | pass |
| F-005.AC5 | f005-validate.spec.ts: F-005.AC5 F-005.R4 valid with a duplicate-key and an unsafe-number war | pass | pass |
| F-005.AC6 | f005-validate.spec.ts: F-005.AC6 F-005.R5 activating an issue moves the cursor to it and scro<br>f005-validate.spec.ts: F-005.AC6 CMP-StatusBar activating "Invalid JSON" jumps to the error t<br>f005-validate.spec.ts: F-005.AC6 CMP-Editor narrow: jumping into a soft-wrapped long line sho | pass | pass |
| F-005.AC7 | f005-validate.spec.ts: F-005.AC7 F-005.R6 the shown size and line count follow every change | pass | pass |
| F-005.AC8 | f005-validate.spec.ts: F-005.AC8 F-005.R7 typing in a 50 MB document shows the character at o | pass | pass |
| F-005.AC9 | f005-validate.spec.ts: F-005.AC9 a document of zero characters shows COPY-status.empty and no | pass | pass |
| F-005.AC10 | f005-validate.spec.ts: F-005.AC10 only spaces and line breaks → empty-document at line 1 colu | pass | pass |
| F-005.AC11 | f005-validate.spec.ts: F-005.AC11 RULE-14 10,001 nested arrays → too-deep at the opening brac | pass | pass |

### F-006

| AC | Test(s) (file: title) | Chromium | WebKit |
|---|---|---|---|
| F-006.AC1 | f006-tree.spec.ts: F-006.AC1 switching to the tree shows the tree; switching back shows t<br>f006-tree.spec.ts: F-006.AC1 the tree in the light theme passes the accessibility audit | pass | pass/skip |
| F-006.AC2 | f006-tree.spec.ts: F-006.AC2 rows show key, kind, the value as written and child counts | pass | pass |
| F-006.AC3 | f006-tree.spec.ts: F-006.AC3 at first the root and its direct children are expanded, deep | pass | pass |
| F-006.AC4 | f006-tree.spec.ts: F-006.AC4 expanding an array of 250 elements shows [0 … 99], [100 … 19 | pass | pass |
| F-006.AC5 | f006-tree.spec.ts: F-006.AC5 copying the path of items[0]["content-type"] puts $.items[0] | pass | pass |
| F-006.AC6 | f006-tree.spec.ts: F-006.AC6 RULE-11 copying the value of 1.50 puts 1.50 on the clipboard | pass | pass |
| F-006.AC7 | f006-tree.spec.ts: F-006.AC7 showing a nested node in text selects exactly its text and s | pass | pass |
| F-006.AC8 | f006-tree.spec.ts: F-006.AC8 an invalid document shows COPY-tree.invalid with an action t | pass | pass |
| F-006.AC9 | f006-tree.spec.ts: F-006.AC9 NFR-04 a 50 MB document: a 100,000-child container shows its<br>f006-tree.spec.ts: ADR-0007 F-006.AC9 a 1,000,000-child container: first group within 100 | pass | pass/skip |
| F-006.AC10 | f006-tree.spec.ts: F-006.AC10 collapse all leaves only the root expanded | pass | pass |
| F-006.AC11 | f006-tree.spec.ts: F-006.AC11 a very large document whose tree cannot be built shows COPY | pass | pass/skip |
| F-006.AC12 | f006-tree.spec.ts: F-006.AC12 when the clipboard is blocked, COPY-error.clipboard is show | pass | pass |
| F-006.AC13 | f006-tree.spec.ts: F-006.AC13 INV-05 after an undo to a different text the tree shows COP | pass | pass |

### F-007

| AC | Test(s) (file: title) | Chromium | WebKit |
|---|---|---|---|
| F-007.AC1 | f007-copy-download.spec.ts: F-007.AC1 copying puts exactly the document text on the clipboard and <br>f007-copy-download.spec.ts: F-007.AC1 the copied toast in the light theme, stacked up to two | pass | pass/skip |
| F-007.AC2 | f007-copy-download.spec.ts: F-007.AC2 a document loaded from orders.json and beautified downloads <br>f007-copy-download.spec.ts: F-007.AC2 RULE-10 a CRLF document is saved with its own line ending, b | pass | pass |
| F-007.AC3 | f007-copy-download.spec.ts: F-007.AC3 a pasted document that was minified downloads as minified.js | pass | pass |
| F-007.AC4 | f007-copy-download.spec.ts: F-007.AC4 when the host does not allow clipboard writing, COPY-error.c | pass | pass |
| F-007.AC5 | f007-copy-download.spec.ts: F-007.AC5 INV-02 NFR-01 downloading makes no network request | pass | pass |
| F-007.AC6 | NONE FOUND | - | - |
| F-007.AC7 | f007-copy-download.spec.ts: F-007.AC7 from the tree view a refused copy shows the text view with t | pass | pass |
| F-007.AC8 | f007-copy-download.spec.ts: F-007.AC8 F-007.R6 NFR-02 copying a 100 MB document shows COPY-progres | pass | pass |

### F-008

| AC | Test(s) (file: title) | Chromium | WebKit |
|---|---|---|---|
| F-008.AC1 | host.spec.ts: F-008.AC1 dark theme from the address shows from the first frame, no l<br>smoke.spec.ts: F-008.AC1 theme from the address is shown from the first frame when em | pass | pass |
| F-008.AC2 | host.spec.ts: F-008.AC2 host switches light to dark: the tool follows without reload<br>host.spec.ts: F-008.AC2 RULE-16 an unknown theme value from the host keeps the curre<br>host.spec.ts: F-008.AC2 F-008.R1 a device change does not override the address or ho | pass | pass |
| F-008.AC3 | host.spec.ts: F-008.AC3 standalone tool shows the dark theme of the device and follo<br>smoke.spec.ts: F-008.AC3 standalone tool follows the dark device preference | pass | pass |
| F-008.AC4 | host.spec.ts: F-008.AC4 the tool fills the host area after resizes, with no page scr | pass | pass |
| F-008.AC5 | host.spec.ts: F-008.AC5 NFR-09 a theme message from an unlisted origin is ignored | pass | pass |
| F-008.AC6 | host.spec.ts: F-008.AC6 F-008.R5 INV-02 using every M-1 feature embedded, the only m<br>host.spec.ts: NFR-01 F-008.AC6 embedded, first visit<br>smoke.spec.ts: smoke: F-008.AC6 F-008.AC7 one session uses every M-1 feature, standal | pass | pass |
| F-008.AC7 | host.spec.ts: F-008.AC7 F-008.R6 standalone: every M-1 feature works without a host,<br>host.spec.ts: NFR-01 F-008.AC7 standalone, first visit<br>host.spec.ts: NFR-01 F-008.AC7 standalone, returning visit (offline cache in control<br>smoke.spec.ts: smoke: F-008.AC6 F-008.AC7 one session uses every M-1 feature, standal | pass | pass |
| F-008.AC8 | host.spec.ts: F-008.AC8 NFR-09 a page on an unlisted origin cannot display the tool | pass | pass |

### F-009

| AC | Test(s) (file: title) | Chromium | WebKit |
|---|---|---|---|
| F-009.AC1 | privacy.spec.ts: F-009.AC1 the status area shows the privacy badge (standalone)<br>privacy.spec.ts: F-009.AC1 the status area shows the privacy badge (embedded)<br>privacy.spec.ts: F-009.AC1 F-009.AC2 at narrow widths the badge is an icon named COPY-p | pass | pass |
| F-009.AC2 | privacy.spec.ts: F-009.AC2 activating the badge shows the details, which can be dismiss<br>privacy.spec.ts: F-009.AC2 activating the badge shows the details, which can be dismiss<br>privacy.spec.ts: F-009.AC1 F-009.AC2 at narrow widths the badge is an icon named COPY-p | pass | pass |

### F-010

| AC | Test(s) (file: title) | Chromium | WebKit |
|---|---|---|---|
| F-010.AC1 | f010-find.spec.ts: F-010.AC1 F-010.R1 the find shortcut in the editor opens the panel wit | pass | pass |
| F-010.AC2 | f010-find.spec.ts: F-010.AC2 F-010.R2 F-010.R3 typing "status" selects the first match af | pass | pass |
| F-010.AC3 | f010-find.spec.ts: F-010.AC3 F-010.R3 from match 3 of 3, next selects match 1; Enter / Sh | pass | pass |
| F-010.AC4 | f010-find.spec.ts: F-010.AC4 F-010.R4 a term the document does not contain shows COPY-sea | pass | pass |
| F-010.AC5 | f010-find.spec.ts: F-010.AC5 F-010.R5 with match case on, only "status" matches, not "Sta | pass | pass |
| F-010.AC6 | f010-find.spec.ts: F-010.AC6 F-010.R6 NFR-02 in a 100 MB document typing a term stays res | pass | pass/skip |
| F-010.AC7 | f010-find.spec.ts: F-010.AC7 F-010.R1 the toolbar Find action opens the panel with its fi | pass | pass |
| F-010.AC8 | f010-find.spec.ts: F-010.AC8 RULE-18 with match case off, "Status" and "status" both matc | pass | pass |
| F-010.AC9 | f010-find.spec.ts: F-010.AC9 RULE-18 in "aaaa", "aa" shows 1 of 2 (matches never overlap) | pass | pass |
| F-010.AC10 | f010-find.spec.ts: F-010.AC10 deleting one of 3 counted occurrences recounts to "of 2" | pass | pass |

### F-011

| AC | Test(s) (file: title) | Chromium | WebKit |
|---|---|---|---|
| F-011.AC1 | f011-offline.spec.ts: F-011.AC1 after one online visit the tool opens with no connection and<br>f011-offline.spec.ts: F-011.AC1 after one online visit the tool opens with no connection and<br>f011-offline.spec.ts: F-011.AC3 F-011.AC1 after a deploy with a changed /sw.js and new asset<br>f011-offline.spec.ts: F-011.AC1 a newer page in the HTTP cache whose assets were never loade | pass | pass |
| F-011.AC2 | f011-offline.spec.ts: F-011.AC2 NFR-01 a whole session makes no requests after the page fini | pass | pass |
| F-011.AC3 | f011-offline.spec.ts: F-011.AC3 a new version never reloads the open session and is used fro<br>f011-offline.spec.ts: F-011.AC3 F-011.AC1 after a deploy with a changed /sw.js and new asset | pass | pass |

F-007.AC6 is deprecated (D-023): no test, no UI (the design board SCR-Formatter error-download is intentionally not implemented).

## Non-functional requirements
Detail: perf `.build-my-app/reports/qa/perf.md`, a11y `.build-my-app/reports/qa/a11y.md`, security/privacy `.build-my-app/reports/qa/security.md`, licenses `qa/license-audit-2.md`.

| NFR | Measurement | Result |
|---|---|---|
| NFR-01 privacy | privacy.spec.ts, network-log.ts, m1-session, f011-offline; security.md (MJ-2 translate fixed, QA-014) | pass (Chromium, WebKit). Security mn-items hardened (QA-023); MJ-1 (deploy headers) open as QA-026 |
| NFR-02 responsiveness / progress | e2e progress+cancel (F-001.AC9, F-002.AC8, F-006.R8, F-007.AC8, F-010.AC6 incl. QA-016 root-cause test); perf.md numbers | pass; first-key-after-Find (perf R2) covered by the QA-016 test, not re-measured by wall clock |
| NFR-03 throughput | perf.md (10 MB <= 1 s, 100 MB <= 10 s); `pnpm bench` | pass (about 10x margin) |
| NFR-04 large docs | f006 AC9 (50 MB, 100k, 1M children), F-001/F-002 large tiers; perf.md | pass Chromium; transient memory > 1.5 GB and fling frame drops recorded (QA-025, accepted); WebKit 100 MB scroll = known limit D-025 |
| NFR-05 startup | perf.md (cold 0.6 s, cached 0.07 s, Lighthouse TTI 0.53 s); check:size 176.9/250 KB | pass |
| NFR-06 accessibility | axe round 2 (qa-round2.spec.ts: empty, invalid, loaded, find, tree, privacy, 390 menu, 320; dark + light; both engines): 0 violations; qa-a-ui-a11y.spec.ts (touch 44 px, forced colors, focus return, landmarks); a11y.md; keyboard walkthrough of overflow menu and Find (qa-round2 `keyboard`) pass | automated pass. Safari/WebKit does not Tab to buttons by default (M-A4, manual). **Manual:** screen reader pass |
| NFR-07 browser support / min width | Chromium + WebKit e2e; 390 and 320 touch (QA-001/010/011); forced colors | pass Chromium/WebKit. **Firefox not run (cannot launch here); real Safari/devices manual** |
| NFR-08 correctness | tests/conformance (JSONTestSuite), tests/property, format-roundtrip (vitest) | pass |
| NFR-09 embedding safety | host.spec.ts (frame-ancestors, origin check) | pass (stub host); real portal build vs production build, local routed origins: 20/20 Chromium+WebKit (qa/portal-embedding.md, 2026-10-14). Live check is manual item 5 |

## Manual checks for the user (exact steps)
1. Real Safari (macOS, iOS) and real Firefox: open the production URL; run FLOW-01 (paste `{"a":1,"b":[1,2]}`, Beautify, Copy, Download), FLOW-02 (type `{"a":1,}`, click the error, fix it), FLOW-03 (paste 250-element array, Tree, expand, Copy path, Show in text). In Safari also press Tab through the page (find buttons, "Local only" reachable? then Option+Tab) — a11y.md M-A4/M5. Playwright Firefox cannot launch here.
2. VoiceOver (macOS Safari, then iOS): follow a11y.md M5-M11 (toolbar, More actions menu, find count "1 of N", tree announcements, error status).
3. Clipboard longer than 5 s: paste or open a ~100 MB file, press Copy, confirm the "copying" progress and that the result pastes complete (F-007.AC8 uses a stubbed clipboard).
4. Real phone (iOS Safari, Android Chrome) at 390/360/320 px: tap More actions, every item; Find with the on-screen keyboard; check 44 px targets, pinch-zoom to 200%, no horizontal page scroll.
5. Embedding in the real portal (portal side implemented; local check passed, qa/portal-embedding.md): on the live sites, load the tool in the portal iframe, toggle portal theme (tool follows without reload), resize, run FLOW-01, check the portal CSP/frame-ancestors allow it.
6. Notices link inside the portal frame: privacy details > "Open-source notices" opens in a new tab via target=_blank; a portal iframe sandbox without allow-popups blocks it. Verify there; if blocked, decide between adding allow-popups in the portal or an in-frame notices view.
7. Windows High Contrast / forced colors (real Edge): Text/Tree pressed, tabs, match case, tree selected row distinguishable (Chromium emulation passes).
8. Real memory on 100 MB+ documents in Firefox/Safari; headed Chromium Performance trace for fast scrollbar drags (QA-025).
9. Deploy: header smoke test after first deploy (QA-026).
