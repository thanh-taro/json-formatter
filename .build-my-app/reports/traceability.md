# Traceability — JSON Formatter M-1

Run date: 2026-10-14. Build: `pnpm build` (fresh). Commands: `pnpm test` (vitest), `E2E_PORT_BASE=4273 CI=1 pnpm exec playwright test --project=chromium --project=webkit`.
Firefox: cannot launch on this machine — **not run**.

## Last results (fresh full run)
- Unit/property/conformance (vitest): 34 files, 384 tests, all pass.
- E2E Chromium + WebKit: 360 test executions = 346 pass, 14 skipped, 0 fail, 0 flaky (the 14 skips are WebKit-only by design: >100 MB best-effort cases, Chromium-only visual/axe cases; each has a Chromium pass).
- `pnpm typecheck`, `pnpm lint`, `pnpm spec:lint` (400 IDs, 0 errors), `pnpm check:size` (critical path 173.9 KB of 250 KB): pass.
- Visual capture (tests/e2e/visual-capture.spec.ts, `VISUAL=1`): 65 screenshots in `.build-my-app/reports/qa/visual/` — see `bugs.md`.
- Bugs: `.build-my-app/reports/qa/bugs.md` (the QA run found real defects; the tests above do not detect them because Playwright scrolls a clipped control into view).

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
Perf numbers: parallel perf-analyst, `.build-my-app/reports/qa/perf.md` (not present when this report was written; reference it for NFR-02/03/04/05 values). A11y detail: `.build-my-app/reports/qa/a11y.md`; security/privacy: `.build-my-app/reports/qa/security.md`.

| NFR | Measurement method | Result |
|---|---|---|
| NFR-01 privacy | tests/e2e/privacy.spec.ts + network-log.ts, m1-session (full session, request log shows none after load, CSP header, no CSP violations), f011-offline | pass (Chromium, WebKit). Security audit: qa/security.md (note its 2 majors). |
| NFR-02 responsiveness / progress | e2e progress+cancel tests (F-001.AC9, F-002.AC8, F-006.R8, F-007.AC8, F-010.AC6) | pass for progress/cancel behaviour; latency traces in qa/perf.md |
| NFR-03 throughput | tests/bench (`pnpm bench`) | see qa/perf.md |
| NFR-04 large docs | f006-tree AC9 (50 MB, 100k and 1M children), F-001/F-002 large tiers | pass in e2e (Chromium); memory/frame numbers in qa/perf.md. 100 MB+ tests are skipped on WebKit (best effort). |
| NFR-05 startup | Lighthouse/lab throttling (lighthouserc.json); check:size budget 173.9/250 KB | size: pass; timing: see qa/perf.md |
| NFR-06 accessibility | axe in e2e (many states) + qa/a11y.md (28 states x 2 engines, 0 AA violations) + keyboard tests | automated pass. **Manual:** screen-reader pass (VoiceOver/NVDA) for the user. Touch: see bug QA-001 (toolbar actions unreachable on phones). |
| NFR-07 browser support | Chromium + WebKit e2e; 360 px width | Chromium/WebKit pass. **Firefox: not run (cannot launch here) — manual/CI.** **Manual:** real Safari (macOS and iOS), real Firefox, real devices. 360 px/390 px: FAIL, see QA-001. |
| NFR-08 correctness | tests/conformance (JSONTestSuite) + tests/property + format-roundtrip (vitest) | pass |
| NFR-09 embedding safety | tests/e2e/host.spec.ts (frame-ancestors header, message origin) | pass |

## Manual checks for the user
- Real Safari (macOS, iOS) and real Firefox: smoke FLOW-01..03, file open/drop, download in the portal iframe.
- Screen reader (VoiceOver, NVDA) on SCR-Formatter: status announcements, tree, find.
- Clipboard operations longer than 5 s on a very large document (F-007.AC8 uses a stubbed clipboard).
- Real phones/tablets: touch targets, toolbar reachability (QA-001), virtual keyboard with find.
- Real memory behaviour on 100 MB+ documents in Firefox/Safari.
