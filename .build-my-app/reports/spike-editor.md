# SP-editor result — CodeMirror 6 vs Monaco at 10–100 MB in a cross-origin iframe (2026-10-13)

**Decision: ADAPT — CodeMirror 6 is chosen (ADR-0004 stands), with six mandatory adaptations.
Monaco is rejected.** CM6 meets the open, typing, memory, replace/undo and error-marker
criteria in Chromium at 50 and 100 MB in both shapes. Five things are needed to get there or are
still marginal: the editor must be mounted in a shadow root, otherwise the ADR-0009 CSP breaks
it; very long lines need a direct-input handler; find needs its own engine; the
syntax-highlighting tier must drop to about 2 MB; and WebKit scrolling and memory at 50–100 MB
formatted, plus Gecko (not measured), stay open for SP-pipeline.

Branch `spike/editor`, code in `spikes/editor/` (throw-away). Time used: about 0.5 day of the
1-day time box.

## Setup
- **Machine**: Apple M3, 16 GB, macOS 27.0.1. Playwright 1.64.0, **Chromium 156.0.8078.4**
  and **WebKit 27.2**, both headless. Node 24.19, Vite 8.3.4, TypeScript 7.0.2.
- **Gecko was not measured.** Playwright Firefox (builds 1555 and 1495) is killed with
  SIGTERM at launch on this macOS 27 machine, with and without the command sandbox. A manual
  Firefox run is carried over to SP-pipeline.
- **Engines**: `@codemirror/state 6.7.6`, `view 6.43.14`, `commands 6.11.1`,
  `language 6.13.1`, `lang-json 6.0.2`, `search 6.7.2`, and `monaco-editor 0.57.0` (DEP-36).
  All are MIT.
- **Embedding**: a stub host on `http://localhost:5180` frames the tool on
  `http://localhost:5181`. That is same-site and cross-origin, like the portal. The frame uses
  `sandbox="allow-scripts allow-same-origin allow-forms allow-downloads"`,
  `allow="clipboard-write"` and `referrerpolicy="strict-origin"` (ADR-0008). The tool origin
  sends the ADR-0009 headers. The full CSP is `default-src 'none'; script-src 'self';
  style-src 'self'; … frame-ancestors http://localhost:5180`. Spike-only deviations: no
  boot-script hash, and `connect-src 'self'` so the page can fetch fixtures.
- **Fixtures** (`gen-fixtures.mjs`, seeded, gitignored):
  - F1 is the formatted API-like payload, with about 18.5 bytes per line. 100 MB is 5,662,749
    lines.
  - F2 is the same data minified into one line.
  - Sizes are 1, 5, 10, 50 and 100 MB.
  - A unique needle `needle-UNIQUE-term` sits at about 90 % of the document.
- **Large-tier CM6 config**: `lineNumbers`, `drawSelection`, `search`, the error-marker field,
  default and search keymaps, and stock `history` (used only for the replace/undo test). There
  is no highlighting, no bracket matching and no wrapping. The **normal tier** adds `lang-json`
  with `defaultHighlightStyle`, `bracketMatching`, `highlightActiveLine` and
  `highlightSpecialChars`.
- **Document injection** uses the ADR-0006 path. `buildText` appends complete lines to a pending
  `Text` in slices of ≤ 8 ms of work, yielding between slices, then creates the view or
  dispatches a single replace.
- **Instruments** (`src/probe.ts`):
  - rAF frame-gap probe;
  - `longtask` observer (Chromium);
  - keystroke-to-next-frame latency: `keydown.timeStamp` to the first rAF, then the next
    macrotask;
  - Event Timing durations;
  - `securitypolicyviolation` listener;
  - JS heap via `performance.memory` after a forced `gc()` (Chromium);
  - OS RSS of the browser's processes via `ps` (max single process, which is the renderer).
- **Scroll tests**:
  - *Scripted* (10 s): a 4 s "fling" adding 4000 px of scrollTop per frame (about 3,000 lines per
    frame at 100 MB, harsher than any real gesture), then 4 s of random jumps every 100 ms, then
    2 s alternating top and bottom for F1, or horizontal scrolling for F2.
  - *Wheel*: 300 real `mouse.wheel` events of ±800 px.
- **Typing**: 26 characters at 50 ms intervals at the start, middle and end of the document.

## Results — CodeMirror 6, Chromium 156, large tier (F1 = formatted, F2 = one line)
| | F1-10 | F2-10 | F1-50 | F2-50 | F1-100 | F2-100 |
|---|---|---|---|---|---|---|
| open: text available → first frame (ms) | 49 | 17 | 184–203 | 18 | **350** | 33 |
| longest build slice / long tasks during open (ms) | 8 / none | 2 / none | 9 / none | 7 / none | 10 / none | 14 / none |
| wheel scroll: max frame gap (ms) | 16.8 | 16.8 | 33.4 | 16.8 | **50.0** (0 frames > 50) | 16.8 |
| scripted scroll: max frame gap (frames > 50 ms) | 16.8 (0) | 16.8 (0) | 50.1 (1/1050) | 33.3 (0) | **66.6 (5/902, all in the fling phase)** | 33.3 (0) |
| typing p95 / max (ms) | 21 / 21 | 19 / 20 | 20 / 25 | 19 / 31 | 23 / 25 | **72 / 128** |
| error marker at 97 % placed and scrolled to (ms) | 30 | 33 | 30 | 20 | 32 | 27 |
| whole-document replace (tool op): longest frame (ms) | 17 | 17 | 17 | 17 | 17 | 23 |
| undo of a whole-document replace (ms) | 16 | 16 | 17 | 16 | 17 | 16 |
| heap after open / with 3 snapshots (MB) | 28 / 65 | 13 / 64 | 127 / 306 | 53 / 303 | **253 / 607** | 103 / 604 |
| renderer RSS after open / with 3 snapshots (MB) | 191 / 355 | 152 / 321 | 299 / 591 | 181 / 551 | **459 / 914** | 239 / 745 |
| caret reaches the end of the document (long line) | yes | yes | yes | yes | yes | yes |
| CSP violations (shadow-root mount) | 0 | 0 | 0 | 0 | 0 | 0 |

"3 snapshots" means the open document plus 3 whole-document replaces with distinct texts. That is
4 distinct 100 MB `Text`s alive: the current one and 3 in history.

Long-line horizontal scroll (F2, 4000 px per frame) had a max frame of 33 ms. The 100 MB line is
represented as a 2.5 M px scroll width through line gaps, and the caret at its end is visible.

**Find (F-010, 50 MB and 100 MB)**:
- The search panel opens with Mod-F and its field gets focus.
- Typing into the field stays responsive: p95 15–18 ms.
- Enter selects the needle correctly.
- **But the stock `findNext` is one blocking task**: 2.1 s at 50 MB and 3.9–4.2 s at 100 MB.
  `SearchCursor` scans at about 23 MB/s.
- The stock-cursor count of `status` (157k–467k matches) takes 3.9–7.6 s even when time-sliced.
- A windowed alternative finds the needle at 100 MB in 96–242 ms and counts 314k matches in
  219 ms, with slices ≤ 14 ms. It works in 1 MB windows of `doc.sliceString`, then
  `toLowerCase`, then `indexOf`, time-sliced at 8 ms, and runs at 360–2600 MB/s.

## Results — CodeMirror 6, WebKit 27.2, large tier
| | F1-50 | F2-50 | F1-100 | F2-100 |
|---|---|---|---|---|
| open → first frame (ms) / longest slice | 209 / 8 | 19 / 8 | 310 / 8 | 25 / 11 |
| wheel max gap (frames > 50) after the scripted scroll | **169 (38)** | 20 (0) | **229 (35)** | 20 (0) |
| wheel max gap, fresh page (2 runs, F1-50) | 41 (0), 139 (2) | | | |
| scripted scroll max (frames > 50) | 61 (17) | 25 (0) | 116 (54) | 26 (0) |
| typing p95 / max (ms) | 24 / 27 | 21 / 25 | 25 / 27 | 40 / 45 |
| replace longest frame / undo (ms) | 148 / 16 | 24 / 12 | 24 / 16 | 44 / 15 |
| WebContent RSS after open / with 3 snapshots (MB) | 483 / 1338 | 436 / 1182 | 700 / **1856** | 636 / **1643** |
| CSP violations | 0 | 0 | 0 | 0 |

WebKit has no forced-GC hook, so its RSS includes uncollected garbage. Treat it as an upper bound
that is still unresolved.

## Results — Monaco 0.57, Chromium (comparison)
| | F1-10 | F1-50 | F2-50 | F1-100 | F2-100 |
|---|---|---|---|---|---|
| open → first frame (ms) / single long task (`createModel`, not sliceable) | 123 / 105 | 187 / 177 | 166 / 159 | 357 / **347** | 275 / **267** |
| wheel / scripted scroll max (ms) | 16.8 / 16.8 | 16.8 / 16.8 | 16.8 / 16.8 | 16.8 / 16.8 | 16.8 / 16.8 |
| typing p95 / max (ms) | 16 / 18 | 19 / 20 | **171 / 197** | 19 / 21 | **525 / 668** |
| whole-document replace: longest frame (ms) | 218 | 1094 | 863 | **2297** | **3345** |
| undo (ms) | 143 | 717 | 906 | 1621 | **7271** |
| heap with 3 snapshots (MB) | 175 | 789 | 726 | **1557** | **1438** |
| find needle, first match (ms) | 35 | 128 | 68 | 250 | 513 (sync) |
| CSP violations (`style-src-elem` and `style-src-attr`) | **56,353** | 56,349 | 1,243 | 56,339 | 687 |

Monaco scrolls better (16.8 ms everywhere, WebKit F1-50 wheel max 37 ms) and searches faster.
It fails the open, replace, undo, long-line typing, memory and CSP criteria.

**Bundle size** (`size/measure.mjs`, minified IIFE, JS + CSS):

| Setup | gzip | brotli |
|---|---|---|
| CM6 large-tier minimal | 93.8 KB | 81.3 KB |
| CM6 with the normal-tier extras | 106.9 KB | 92.3 KB |
| Monaco minimal (editor API + find) | 700.5 KB | 555.9 KB |

The Monaco figure excludes its editor worker (304 KB raw).

## Normal tier (highlighting) — Chromium
| | F1-1 | F2-1 | F1-5 | F2-5 | F1-10 | F2-10 |
|---|---|---|---|---|---|---|
| wheel max (ms) | 16.8 | 16.8 | 16.8 | 16.8 | 16.8 | 16.8 |
| scripted max (frames > 50); long tasks | 16.8 (0) | 16.8 (0) | **83 (7)**; 7 × 100 ms parse tasks on random jumps | 16.8 (0) | **83 (16)** | 33 (0) |
| typing p95 / max (ms) | 20 / 22 | 34 / 37 | 21 / 21 | **63 / 70** | 18 / 19 | **95 / 103** |

Highlighting stays within budget at 1 MB. From 5 MB on, far jumps trigger Lezer's 100 ms
synchronous parse-to-viewport, and typing in a multi-MB line exceeds a p95 of 50 ms.

## Pass criteria (spike plan) vs result
| Criterion | CM6 Chromium | CM6 WebKit | Monaco Chromium |
|---|---|---|---|
| 50 MB open < 3 s, 100 MB < 6 s, no task > 50 ms when sliced | **pass**: 0.20 s / 0.35 s; slices ≤ 14 ms | **pass**: 0.21 s / 0.31 s; ≤ 11 ms | fail: 105–347 ms single task |
| Max frame gap ≤ 50 ms while scrolling | **pass** with the wheel (max 50.0 at F1-100). **Marginal fail** on the synthetic fling at F1-100 (66.6 ms, 5 of 902 frames) | **fail** on F1-50/100 after heavy random jumps (169–229 ms); F2 passes | pass |
| Keystroke p95 ≤ 50 ms, max ≤ 100 ms | **pass** except F2-100 (p95 72, max 128), which needs the direct-input fix. Without it: p95 1.2–5.6 s at 50–100 MB | **pass** (≤ 40 / 45) | fail on F2 (p95 171–525) |
| Editor memory < 1 GB with 100 MB + 3 snapshots | **pass**: heap 607 MB, renderer RSS 914 MB | **unresolved**: RSS 1.6–1.9 GB, no GC control | fail: heap 1.4–1.6 GB |
| Zero CSP violations | **pass only with a shadow-root mount**; a document mount fails | pass (shadow root) | fail (687–56k) |
| Long minified line scrolls horizontally without jank | pass (≤ 33 ms; end reachable) | pass (≤ 26 ms) | pass |
| Also: error marker far away, whole replace + undo | pass (≤ 42 ms; ≤ 23 ms; ≤ 17 ms) | pass (replace 148 ms once at F1-50) | fail (0.2–3.3 s; undo up to 7.3 s) |
| F-010 find on 50 MB works | functionally yes. **Stock `findNext` blocks 2–4 s, so it fails F-010.AC6 / NFR-02**; the custom windowed find passes | same (1.1–3.3 s UI find) | n/a |

The decision rule says CM6 is chosen if it passes and Monaco only if CM6 fails and Monaco
passes. Monaco fails more criteria than CM6, including hard ones (CSP, replace/undo, memory). CM6
is chosen, with adaptations.

## Surprises (in order of impact)
1. **ADR-0004's CSP assumption is wrong for a document mount.**
   - `style-mod` 4.1.4 uses constructable (adopted) stylesheets only when the root is a
     **ShadowRoot** (`!root.head`). On a `Document` it inserts a `<style>` element.
   - `style-src 'self'` blocks that element (1 violation). The editor then has **no base
     styles**: the scroller is not `overflow:auto`, its height is 18 M px, and CM's `inView` is
     false.
   - Consequences: a whole-document replace rendered all 568,047 lines (1.1 M DOM nodes, 5–7 s at
     10 MB). The next replace threw `TypeError … HeightMapGap.blockAt → Text.lineInner`. Typing
     and scrolling silently did nothing useful.
   - Fix: mount the view in a shadow root (`new EditorView({ parent: shadowRoot, root:
     shadowRoot })`). This gives 0 violations in Chromium and WebKit. Evidence:
     `results/*-noshadow.json` and `results/chromium-cm-large-*.json`.
2. **Replacing the document while the editor is `display:none` renders every line.**
   - CM treats a hidden view as "not in view" and accepts the mapped viewport, which a
     full-range change stretches to the whole document.
   - Measured at 10 MB: replace took 1.5–1.6 s and left 568,047 `.cm-line`s, and the view did not
     recover when shown again. At 100 MB this would be tens of seconds and gigabytes.
   - This is relevant to F-006: the text view is hidden while the tree view is shown, and
     beautify or minify can still run.
   - With `visibility:hidden` instead: 10–13 ms and 72 lines (`repro-hidden.mjs`). Evidence:
     `HIDEMODE=display` versus `HIDEMODE=visibility node repro-hidden.mjs`.
3. **Typing in a very long line is O(line length) per keystroke.**
   - The cause is CM's DOM-change reader, `findDiff` in `applyDOMChange`, at about 2.5 ms per MB:
     270 ms per key at 100 MB, and 0.5–5.8 s latency under 50 ms key repeat.
   - `highlightSpecialChars` rescans the line on each key as well.
   - Fix (spike `directInput`): a `beforeinput` handler for `insertText` on lines ≥ 100k
     characters (not composing) that dispatches `replaceSelection` and prevents the DOM edit. It
     brings F2-100 to p95 72 ms, max 128 ms, and F2-50 to p95 19 ms. The remainder at 100 MB is a
     `Text` iterator walk in the view, still O(line).
   - IME composition still takes the slow path on very long lines. Accepted, because JSON keys
     are rarely composed inside a 100 MB minified line, but noted.
4. **The stock search engine is too slow for 50–100 MB.** `SearchCursor` normalises character
   by character, about 23 MB/s, and `findNext` runs synchronously. F-010 needs its own sliced
   engine (or the worker mirror). It needs its own panel anyway, for "1 of 3" counting (stock CM
   has no match count).
5. **Highlighting fits about 2 MB, not 10 MB.** See the normal-tier table.
6. **The chunked builder must not concatenate the carry of a single long line.** The first
   version was O(n²) on F2: 5.7 s and 79 ms slices at 50 MB. Collecting pieces and joining once
   gives 16 ms total at 100 MB.
7. **CM's own long-line and huge-document handling works well.** Line gaps cap the 100 MB line
   at a 2.5 M px scroll width, and BigScaler caps 5.6 M lines at a 7 M px scroll height. Open is
   fast (`Text` built in 0.33 s at 100 MB F1, view in ~10 ms), and structure-shared undo
   snapshots cost about 120–150 MB of heap per 100 MB document.
8. **WebKit's F1 scroll degrades after many random jumps.** The likely cause is height-map
   fragmentation: `updateHeight` recursion is hot in the Chromium profile too. A fresh page
   wheels at 41–139 ms max.

## RULE-15 — stock history or custom? Custom history is required (as ADR-0004/0006 expect)
`check-history.mjs` drives stock `history()` in state only, with `isolateHistory` per event:

| Stock history setting | Undo depth | Tool ops still undoable |
|---|---|---|
| `minDepth: 100`, 30 typing events between tool ops | 105 | 3 of 4 |
| `minDepth: 100`, 60 typing events between tool ops | 111 | **1 of 4** |
| `minDepth: 3`, 5 typing events between tool ops | 5 | **0 of 4** |

Depth is counted in events and trimmed at `minDepth + 20`. It cannot express "the last 3 tool
operations, plus the typing between them". In the large tier a high `minDepth` would keep up to
about 120 whole-document snapshots, which is unbounded memory. Measured in this spike: with 3
snapshots, heap is 607 MB at 100 MB in Chromium.

## Recommended ADR / spec changes
- **ADR-0004 (editor engine): keep CodeMirror 6 and amend it.**
  - (a) Styles: CM must be mounted in a **shadow root**. `style-mod` adopts stylesheets only
    there; a document mount needs `'unsafe-inline'` or a per-response nonce, which is impossible
    on static hosting. The editor's own styling goes through `EditorView.theme` or
    `baseTheme`, because page CSS does not pierce the shadow root. The NFR-06 screen-reader pass
    must include the shadow-DOM editor.
  - (b) Hiding: the text view must never be `display:none` while its document can change. Use
    `visibility:hidden` with layout kept (or off-screen positioning) when the tree view is shown.
    Otherwise use `view.setState` while hidden, which only works with the custom history, because
    the history must be carried into the new state.
  - (c) Large tier: add the long-line direct-input handler and drop `highlightSpecialChars`.
  - (d) Tier config: syntax highlighting, bracket matching and active line apply only to
    documents **≤ 2 MB** (measured clean at 1 MB; budget exceeded at 5 MB).
  - (e) Find: own panel and own engine (windowed, time-sliced, count completes after the first
    match). Do not use `@codemirror/search`'s `findNext` / `SearchCursor` on large documents.
    `@codemirror/search` itself is optional, and if used it must be added to the dependency
    registry (it is not in DEP-04…10).
  - (f) Correct "Styles are injected via constructable stylesheets" in the Decision text.
- **ADR-0006**: confirmed.
  - Chunked commit: slices ≤ 10–15 ms in Chromium and ≤ 11 ms in WebKit. The builder must
    accumulate a long line's pieces and join once.
  - Custom history field: confirmed by the RULE-15 check.
  - Keep the Blob-snapshot fallback on the table for WebKit (RSS 1.6–1.9 GB with 3 snapshots,
    unresolved).
- **ADR-0009**: no change needed for CM6 with the shadow-root mount. Monaco would have needed
  `'unsafe-inline'` for both `style-src-elem` and `style-src-attr`.
- **RULE-02 (spec; user decision, not edited here)**: the normal tier says "≤ 10 MB —
  everything enabled", but syntax colouring only fits about 2 MB. Two options:
  - either let the large-tier reductions (colouring, bracket matching) start at 2 MB, with
    COPY-notice.large shown there;
  - or keep the tiers and add "syntax colouring may be reduced above 2 MB".

  The tier thresholds for everything else (10 MB / 100 MB) hold.
- **F-010 (spec)**: no change. AC6 is achievable with the custom engine. Note that
  case-insensitive matching of non-ASCII text needs a length-preserving fold (`toLowerCase` can
  change length).
- **Architecture size budget**: the CM critical path is 93.8–106.9 KB gzip. That is better than
  the 130–150 KB estimate (which includes Lezer) and well within ≤ 160 KB.

## Carried to SP-pipeline
- **Gecko measurement (manual Firefox)**: all criteria, especially long-line typing and the 100 MB
  scroll.
- **WebKit / real Safari**:
  - F1 scroll at 50–100 MB after many jumps. If it stays above 50 ms, investigate height-map
    fragmentation upstream, or reset or compact the height map after a jump storm.
  - RSS with 3 snapshots, measured with Safari's memory tools. If it is above budget, use the
    ADR-0006 Blob fallback in WebKit.
- **End-to-end memory** with the worker mirror added. The editor side is 607 MB heap and 914 MB
  RSS in Chromium.
- **Upstream (optional)**: report the CM issues for a hidden or unstyled view on full-document
  replace (renders everything, then `HeightMapGap.blockAt` throws) and for O(line) `findDiff`.

## Evidence and reproduction
- Code: `spikes/editor/` (`src/cm.ts`, `src/monaco.ts`, `src/probe.ts`, `bench.mjs`,
  `serve.mjs`, `gen-fixtures.mjs`, `profile.mjs`, `repro-replace.mjs`, `repro-hidden.mjs`,
  `check-text.mjs`, `check-history.mjs`, `size/measure.mjs`, `run-all.sh`).
- Raw results: `spikes/editor/results/<browser>-<engine>-<tier>-<fixture>.json`, plus run logs and
  `results/summary.md` (all runs, generated by `node summarize.mjs`).
- Reproduce:
  ```
  cd spikes/editor && pnpm install && node gen-fixtures.mjs 1 5 10 50 100
  pnpm exec vite build && node serve.mjs &
  sh run-all.sh cm-chromium; sh run-all.sh monaco-chromium; sh run-all.sh cm-webkit
  node check-history.mjs; node size/measure.mjs
  HIDEMODE=display node repro-hidden.mjs; HIDEMODE=visibility node repro-hidden.mjs
  SHADOW=0 STEPS=open,replace node bench.mjs chromium cm large F1-10MB   # CSP failure mode
  NOMIN=1 pnpm exec vite build && node profile.mjs type F2-100MB          # long-line profile
  ```
- Profiles (Chromium CPU profile, top self time):
  - typing at the start of the F2-100 line without the fix: `findDiff` 1451 ms per 6 keys and
    `MatchDecorator.updateRange` 130 ms;
  - with the fix: `nextInner` 159 ms per 6 keys;
  - F1-100 fling scroll: forced layout through `readSelectionRange`, and `HeightMap.updateHeight`
    recursion.
- Caveats:
  - Headless browsers.
  - Synthetic input through Playwright: latency is measured from `keydown.timeStamp`, not from
    hardware.
  - Fixture fetch time (0.02–1.2 s) is excluded from "open" because the real app reads a `File`
    in the worker.
  - RSS is the max single browser process, which is the renderer for the same-site iframe.
