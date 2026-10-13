# Spike plan — JSON Formatter architecture (2026-10-13)

Inputs: `specs/40-technical/architecture.md`, ADR-0001 … ADR-0012, spike candidates in
`state.json` (SP-editor, SP-formatter, SP-tree, SP-iframe). **One spike added: SP-pipeline**
(end-to-end memory and main-thread budget at 100 MB), because the main risk is how the pieces
combine, not any one piece.

Spike code is throw-away and lives outside `src/` (e.g. `spikes/<id>/`); dependencies used
only by spikes are still registered (DEP-36 for Monaco). Every spike ends with a short result
note (numbers, decision, ADR amendments) appended to this file.

## Shared setup (½ day, before the first spike)
- Seeded fixture generator (Node script) → 1, 10, 50, 100, 200 MB variants of:
  F1 formatted API-like payload (objects, mixed scalars, ~30-char lines);
  F2 the same minified (one line); F3 wide array of small numbers (`[1,2,3,…]`, max nodes);
  F4 array of tiny containers (`[[],{},…]`); F5 one 10 MB string value;
  F6 CRLF version of F1; F7 non-ASCII-heavy (CJK + emoji) version of F1;
  F8 10,000-deep nesting; F9 a 100,000-child array inside a 50 MB document.
- Measurement harness (Playwright, Chromium via DevTools protocol): `performance.measure`
  spans, `requestAnimationFrame` gap probe (max frame gap), Long Animation Frames entries,
  JS heap (`Performance.getMetrics`) and renderer + worker process memory
  (`SystemInfo.getProcessInfo` / OS RSS); Firefox and Safari measured manually (about:memory,
  Activity Monitor) for the 100 MB cases only.
- Reference machine noted (CPU, RAM, OS, browser versions) in each result.

## Order and gating
| # | Spike | Time box | Depends on | Must pass before accepting |
|---|---|---|---|---|
| 1 | SP-formatter | 1 day | setup | ADR-0005 |
| 1 | SP-editor (parallel with SP-formatter) | 1 day | setup | ADR-0004 |
| 2 | SP-pipeline | 1.5 days | SP-formatter, SP-editor | ADR-0004, ADR-0005, ADR-0006 |
| 3 | SP-tree | 1 day | SP-formatter (tokenizer), SP-pipeline (worker shell) | ADR-0007 |
| any | SP-iframe | 1 day | none (can run first or in parallel) | ADR-0008, ADR-0009, ADR-0012 |

**Stack ADRs blocked by spikes**: ADR-0004 (editor), ADR-0005 (parsing/worker), ADR-0006
(commit/undo/memory), ADR-0007 (tree), ADR-0008 (host transport), ADR-0009 (hosting/CSP).
**Not blocked** (can be accepted now, pending only user review): ADR-0001 (license policy),
ADR-0002 (Preact), ADR-0003 (TypeScript/Vite/pnpm), ADR-0010 (testing), ADR-0011 (styling).
ADR-0012 additionally needs a user decision on offline support.

Total ≈ 6 focused days. If a spike blows its time box, stop and report what is known; do not
extend silently.

---

## SP-formatter — lossless token formatter in a worker
- **Question**: Can a hand-written, iterative, chunk-resumable TypeScript tokenizer validate
  (RULE-03/04/05/14) and beautify/minify losslessly at ≥ 50 MB/s in a worker on all three
  engines, with exact RULE-04 positions and 100 % JSONTestSuite agreement?
- **Prototype scope**: tokenizer state machine with explicit stack; validator with all
  RULE-04 codes and RULE-05 warnings; beautify (2 spaces, tab, 8 spaces; LF/CRLF; final break)
  and minify emitting chunks; chunked input from strings; line/column resolution pass; a
  time-sliced runner with cancel. No UI beyond a benchmark page that loads the worker.
- **Measurements**: MB/s for validate, beautify, minify on F1, F2, F3, F7 at 10/100 MB (Node +
  worker in each engine; median of 5); max slice duration; cancel latency; heap growth during
  formatting; JSONTestSuite pass rate (y_/n_/i_ with recorded expectations); 10,000 fast-check
  round-trip cases (token sequence equality, numbers byte-identical, chunk-boundary
  independence with random chunk sizes); F8 depth 10,000 valid and 10,001 → `too-deep` at the
  right bracket; positions for every example in F-005 acceptance criteria.
- **Pass criteria**: ≥ 50 MB/s validate and ≥ 50 MB/s beautify/minify (Chromium) and
  ≥ 30 MB/s (Gecko, WebKit) on F1 at 100 MB; 100 % y_/n_; zero property-test failures; no
  stack overflow; cancel ≤ 50 ms; all F-005 position examples exact.
- **If it fails**: profile hot loop (charCodeAt dispatch tables, avoid per-char allocations);
  as a last resort evaluate a WebAssembly tokenizer (new ADR).
- **Time box**: 1 day.

## SP-editor — CodeMirror 6 vs Monaco at 50–100 MB in an iframe
- **Question**: Does CodeMirror 6, configured for the large tier, open, scroll and edit 50 MB
  and 100 MB documents (formatted and minified) inside a cross-origin iframe within budget —
  and if not, does Monaco?
- **Prototype scope**: a page per engine in a cross-origin iframe (stub host on another local
  port, portal frame attributes); document injected via chunked `Text` building (CM6) /
  model creation (Monaco); large-tier config (no highlighting, no bracket matching, no
  wrapping); scripted scroll (top → bottom, page jumps, long-line horizontal scroll on F2);
  scripted typing at the start, middle, end; error marker decoration at a far position; a
  whole-document replace + undo; normal-tier config with highlighting on 10 MB. CSP header as in
  ADR-0009 (`style-src 'self'`) with violation listener.
- **Measurements**: time to first render after text is available; longest main-thread task
  during document creation; max frame gap during 10 s scripted scroll; keystroke-to-paint
  latency (p50/p95/max); heap and renderer memory with one document and with 3 undo snapshots;
  compressed bundle size of each engine's minimal setup; CSP violations; 10 MB normal tier
  highlighting cost while scrolling.
- **Pass criteria** (CM6, both F1 and F2): 50 MB open < 3 s and 100 MB < 6 s with no task
  > 50 ms when building in slices; max frame gap ≤ 50 ms while scrolling; keystroke-to-paint
  p95 ≤ 50 ms, max ≤ 100 ms; editor-side memory < 1 GB with 100 MB + 3 snapshots; zero CSP
  violations in all three engines; long minified line scrolls horizontally without jank.
  Decision rule: CM6 is chosen if it passes; Monaco only if CM6 fails and Monaco passes; on a
  tie the smaller bundle (CM6) wins.
- **Also answer**: can the stock history be bounded per RULE-15, or is the custom history
  field required (expected: custom)?
- **Time box**: 1 day.

## SP-pipeline — end-to-end 100 MB (added)
- **Question**: With the worker mirror, chunked commit, and three undoable whole-document
  operations, does a 100 MB session stay < 1.5 GB peak with no main-thread task > 50 ms, and
  meet NFR-03 end to end?
- **Prototype scope**: SP-formatter core + SP-editor CM6 page joined: file load through the
  worker (stream decode, validate, forward chunks, adopt), edit sync via change sets, beautify
  → minify → beautify → re-indent (4 tool ops, trimming to 3), undo ×3, cancel mid-format,
  export Blob → download and clipboard item. Variant B: no mirror (snapshot per validation).
  Variant C: Blob-backed undo entries.
- **Measurements**: peak renderer + worker memory per step on F1, F2, F7 at 100 MB (and F1 at
  200 MB best effort); longest main-thread task and max frame gap during each step;
  click-to-shown time for beautify at 10 MB and 100 MB; cancel-to-idle time; keystroke →
  validation result time at 100 MB; memory of variants B and C.
- **Pass criteria**: peak < 1.5 GB on F1/F2 100 MB in Chromium (Gecko/WebKit observed, must
  not crash); no main-thread task > 50 ms in any step; 10 MB beautify ≤ 1 s, 100 MB ≤ 10 s;
  cancel ≤ 200 ms with document unchanged; COPY-notice.undo_trimmed path works. Decide: mirror
  vs snapshot (ADR-0005), in-memory vs Blob undo (ADR-0006), tunable constants.
- **Time box**: 1.5 days.

## SP-tree — tree from token offsets
- **Question**: Can a lazily scanned tree with a skip table (no per-node index) expand the
  root of a 50 MB document in < 500 ms and show the first group of a 100,000-child container in
  ≤ 100 ms, with near-constant memory, including adversarial shapes?
- **Prototype scope**: skip-table construction during validation (threshold 1, 4, 16 KB);
  worker `children(container, from, 100)` with checkpoint caching; main-thread row model with
  RULE-12 grouping; fixed-row virtual list with height scaling; expand/collapse, collapse all;
  copy value via Blob; reveal span in the CM6 page.
- **Measurements**: skip-table build overhead on validation (MB/s delta) and size; expand
  root time on F1 50/100 MB, F3, F4; first group and random group (e.g. `[73,400 … 73,499]`)
  time on F9; scroll max frame gap with 1 M visible rows; memory delta (target < 3× input
  total including the document — the candidate criterion — and tree structures ≤ 50 MB).
- **Pass criteria**: expand root (50 MB) < 500 ms; F-006.AC9 first group ≤ 100 ms; random
  group ≤ 200 ms after first expansion; scroll frames ≤ 50 ms; validation throughput loss
  ≤ 10 %; tree structures ≤ 50 MB on every fixture; correct paths (RULE-06) and exact values
  (RULE-11) on a sample of 1,000 nodes.
- **Time box**: 1 day.

## SP-iframe — embedding, clipboard, drop, download, theme, CSP
- **Question**: Do theme-at-first-paint, `taro:theme`/`taro:ready` messaging, origin
  checks, clipboard (small and 100 MB), file drop and input, download, and the strict CSP
  work in Chromium, Gecko and WebKit (Playwright **and** real Safari), with the portal's real
  frame attributes — and what fails without them?
- **Prototype scope**: static tool page served with the ADR-0009 headers (local server that
  emits `_headers`), stub host on a second origin with
  `sandbox="allow-scripts allow-same-origin allow-forms allow-downloads"`,
  `allow="clipboard-write"`, `referrerpolicy="strict-origin"`, plus variants without
  `allow-downloads` / `clipboard-write`; a third, non-allow-listed origin. Optional: register
  the ADR-0012 service worker inside the frame.
- **Measurements / checks** (matrix engine × variant): first painted frame colour with
  `?theme=dark` (screenshot at first paint) — no light frame; theme switch by message; message
  from wrong origin ignored; exactly one outbound message; `document.referrer` value;
  `writeText` small; ClipboardItem with promised 100 MB Blob (time, success); clipboard failure
  mode without permission; download success and observable signal when blocked; drop of
  file / several files / folder / text; file input; resize without page scrollbar;
  `securitypolicyviolation` events (must be 0, incl. editor styles under `style-src 'self'`);
  network requests after load (must be 0); framing from the unlisted origin refused;
  `require-trusted-types-for 'script'` compatibility (informational); service worker makes no
  requests after load (if tried).
- **Pass criteria**: all spec behaviours work in all three engines with the portal's
  attributes; each failure without a grant hits the specified fallback (COPY-error.clipboard /
  COPY-error.download) or is documented as undetectable (open issue O-3); zero CSP violations;
  zero requests after load. Output: final frame-attribute snippet for the portal's catalog,
  confirmed message contract, and any spec notes.
- **Time box**: 1 day.
