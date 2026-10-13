# Spike SP-tree: lazy tree from token offsets

- **Date**: 2026-10-13 · **Branch**: `spike/tree` · **Time box**: 1 day. Used about 0.5 day.
- **Prototype**: `spikes/tree/` (throw-away). It reuses the SP-formatter engine and fixtures from `spikes/formatter/`, checked out from `spike/formatter`.
  - `src/tree-core.ts`: skip table, `children()` scanner with checkpoints, RULE-06 and RULE-12 helpers (about 450 lines).
  - `src/core-skip.ts`: the SP-formatter engine with skip-table hooks, used to measure the cost of building the table during validation.
  - `src/rowmodel.ts`: main-thread row model.
  - `src/page.ts`: custom virtual list, selected-row header (D-018), roving tabindex, CM6 "show in text".
  - `src/worker.ts`: CM6 `Text` mirror, queries, background checkpoint fill, value Blob.
  - `test/`: an independent oracle and vitest tests.
  - `bench/`: server, Playwright driver, Node A/B benchmark.
  - `results/`: raw logs and screenshots.
- **Decision**: **ADAPT**. Accept ADR-0007 with the amendments at the end.

## Question
Can a lazily scanned tree (skip table, no per-node index) meet these targets?
- Expand the root of a 50 MB document in < 500 ms.
- Show the first group of a 100,000-child container in ≤ 100 ms (F-006.AC9).
- Keep memory near-constant, including on adversarial shapes.
- Give exact copy path (RULE-06), exact copy value (RULE-11) and exact "show in text" spans.

## Reference machine and caveat
- **Machine**: Apple M3, 16 GB, macOS 27.0.1, Node 24.19.0.
- **Browsers**: Playwright 1.64 with **Chromium 156.0.8078.4** and **WebKit 27.2**, both headless. Viewport 1280 × 800.
- **Gecko was not run**: Playwright's Firefox does not launch on macOS 27 (known from SP-formatter).
- **The machine was heavily loaded by parallel spikes**: load average 19–72 on 8 cores during the runs. Timings are therefore pessimistic, and the validation A/B comparison is dominated by noise (see below).
- **Timing method**: every "paint" time runs from the action to the second `requestAnimationFrame` after render, so it includes about 1–2 frames (≈ 17–33 ms) of display latency.

## Result vs. pass criteria

| Criterion (spike plan) | Target | Chromium 156 | WebKit 27.2 | Verdict |
|---|---|---|---|---|
| Expand root, 50 MB (F1) — tree first shown, standalone skip pass included | < 500 ms | **165–169 ms** | **131–165 ms** | pass |
| Same, 100 MB: F1 / F2 / F3 / F4 / F7 / DEEP | (NFR-02 progress) | 394 / 245 / 481 / 604 / 307 / 450 ms | 332 / 218 / 183 / 346 / 293 / 272 ms | ok (see amendment 2) |
| Same, if the skip table was built during validation (root + first block only) | — | **0.4–6.7 ms** | 0.5–5.2 ms | pass |
| F-006.AC9: 100,000-child container in a 54 MB doc. Expand → group rows painted; first group `[0 … 99]` items with data | ≤ 100 ms | 16–21 ms; **22–26 ms** | 30 ms; **10–31 ms** | pass |
| 1,000,000-child container (52 MB doc), same steps | ≤ 100 ms | 10–28 ms; **19–30 ms** | 29–31 ms; **31–32 ms** | pass |
| Random group, 100k: `[73,400 … 73,499]` cold (no background fill) / warm | ≤ 200 ms | 47–75 / 9–24 ms | 33–48 / 29–31 ms | pass |
| Random group, 1M: `[734,000 … 734,099]` cold / warm (after the 38–111 ms background fill) | ≤ 200 ms | **197–283** / 18–32 ms | 99–125 / 31–33 ms | cold: marginal under load; warm: pass |
| Scroll with **1,010,110 visible rows** (height-scaled): 2 × (4 s fling at 4,000 px/frame + 3 s random jumps), plus 300 wheel events | no frame > 50 ms | max **16.7 ms**, 0 frames > 50 ms | max **17.9 ms**, 0 frames > 50 ms | pass |
| Tree structures | ≤ 50 MB on every fixture | Worker: skip table ≤ 48 B, checkpoints ≤ 2.7 MB (F4, 33 M children). Main: 10,106 row-model nodes plus ≤ 1,114 cached blocks = **+8 MB heap** with 1 M rows visible. | same structures | pass |
| Memory, total including the document | < 3× input | Worker heap (CM6 `Text` mirror) is 1.0× input for one-line F2/F3/F4, **2.45×** for F1 (5.3 M lines) and **2.88×** for F7. The tree adds < 0.03×. | not measurable (no CDP) | pass for the tree; the mirror is SP-pipeline's question |
| Validation throughput loss from the skip-table hooks | ≤ 10 % | Not resolvable under this load: A/B medians swing −30 % … +34 % in both directions, and the minima are within ±13 %. | — | inconclusive (structurally ~0, see Surprises 4) |
| Paths (RULE-06) and values (RULE-11), sample of 1,000 nodes | all exact | Node: 26/26 tests on 14 fixtures × thresholds, about 13,500 nodes checked against the oracle. Browser: 2,396 rows exact, 0 wrong. Show in text: 97/97 selections exact and in view. Clipboard round trip: 7/7. | 2,396 rows exact, 0 wrong. Show in text: 97/97. | pass |

## Numbers

### Time to first tree view (`T.open`, threshold 4 KB, first run; median of 3 in brackets)
Each run builds the skip table with a standalone pass, then reads the root and its first block, applies the initial RULE-12 expansion and paints.

| Fixture | MB | Lines | Root children | Chromium: first paint (skip pass) | WebKit: first paint (skip pass) |
|---|---|---|---|---|---|
| F1-10 | 10 | 0.53 M | 23,025 | 53 ms (31) | 65 [48] ms (31) |
| F1-50 | 50 | 2.6 M | 114,992 | 169 [165] ms (142) | 165 [131] ms (147) |
| F1-100 | 100 | 5.3 M | 229,734 | 394 [496] ms (371) | 332 [231] ms (296) |
| F2-100 (one line) | 100 | 1 | 345,450 | 245 ms (225) | 218 [195] ms (174) |
| F3-100 `[1,2,…]` | 100 | 2 | 25,707,666 | 481 ms (460) | 183 ms (160) |
| F4-100 `[[],{},…]` | 100 | 2 | 33,333,334 | 604 [531] ms (579) | 346 [314] ms (305) |
| F7-100 CJK | 100 | 4.5 M | 196,345 | 307 ms (284) | 293 [206] ms (255) |
| F9-50 (100k array inside) | 54 | 2.3 M | 3 | 181 ms (173) | 184 [131] ms (170) |
| F9M-50 (1M array inside) | 52 | 2.1 M | 3 | 196 ms (187) | 163 [133] ms (156) |
| DEEP-100 (5,000-deep chains) | 100 | 2 | 9,998 | 450 [498] ms (366) | 272 [264] ms (199) |

- **Skip-table size**: at 1, 4 and 16 KB the table holds **1–4 entries** on every realistic fixture. F1 records are about 430 B, so only the root and the "head", "big" and "tail" members are ever ≥ 1 KB.
- **DEEP adversarial case** (5,000 nested arrays of more than 1 KB each, repeated): with the threshold set to 64 B (unit test) or 4 KB, the bounded table compacted 2–5 times. The effective threshold rose to 2–16 KB, keeping memory at ≤ 1.2 MB.
- **Standalone pass throughput**: 150–380 MB/s in Chromium, and 200–300 MB/s in Node when the machine was quieter.

### Big containers, raw runs: `results/chromium-big.txt`, `results/webkit-big.txt`
Three fresh pages per fixture. "Cold" means background checkpoint fill was off, so the scan ran from the nearest checkpoint left behind by the first-group query. "Warm" means after the fill completed. The fill runs in ≤ 8 ms slices (max slice 7.8–17.5 ms) and takes 8–34 ms for 100k children and 38–111 ms for 1M.

### Scroll, 1M visible rows: `results/*-scroll.txt`, screenshots `results/scroll-1M-*.png`
- **Setup**: expanding all 10,100 groups of the 1M container takes 2–5 ms on the main thread (pure arithmetic, no worker calls).
- **Height**: the total is 24.2 M px, so the list runs height-scaled (spacer capped at 8 M px).
- **Frames**: max 16.7 ms in Chromium and 17.9 ms in WebKit.
- **Placeholders**: during the 4,000 px/frame fling, **90 % of rendered frames contained placeholder rows** for one or more frames, because each new block (100 rows) is one worker round trip. With wheel scrolling it is less.

### Correctness: `results/vitest.txt`, `results/*-correct.txt`
- **Oracle**: an independent full parser of the raw source (any line endings) with its own key decoder and RULE-06 formatter. It never uses `JSON.parse`.
- **Per sampled node, the test navigates from the root** with `children(c, idx, 1)` and compares:
  - kind, child count, and span (mapped CRLF → editor positions);
  - preview;
  - `formatPath` against the oracle path;
  - `valueText(span)` against the raw source slice.
- **Fixtures**: TRICKY, CRLF TRICKY, AC2, scalar root, BOM, F1, CRLF F6, CJK F7, minified F2, F3, F4, the 20k-child big array, a 30k-member object and deep chains.
  - Thresholds: 1, 8, 64, 1K, 4K and 16K, so jumps through the skip table are exercised.
  - Every block of a 20k array and of the F3 root is checked in random order, before and after the background fill.
- **TRICKY** contains:
  - escaped keys `"a\"b"`, `"ABC"`, `""`, `"1abc"`, `"日本"`, `"a\nb"`, `"😀"`, the lone surrogate `"\ud800"`, `"tab\tkey"` and `"back\\slash"`;
  - duplicate `dup` keys (each occurrence is its own row with an identical path);
  - `12345678901234567890`, `1.50`, `-0`, `1E+2` and `2.5e-3`;
  - a 500-char string (preview truncated at 200, copy value full) and empty `{}`, `[ ]`;
  - a 250-element array (groups `[0 … 99] [100 … 199] [200 … 249]`, F-006.AC4).
- **Browser checks**: every visible row is copied (path, plus value via the worker Blob). Every 25th row is revealed in a CM6 `EditorView` holding the same text; the checks are the selected text (`sliceDoc`) and that the selection is inside the scroll viewport. The real clipboard round trip (`writeText` / `ClipboardItem(Blob)` → `readText`) was run in Chromium only.

## Evidence (run from `spikes/tree/`)
```
pnpm install
npx vitest run                                   # 26 tests: oracle, grouping, paths, checkpoints, hook table == standalone table
npx tsx bench/serve.ts 8788 &                    # COOP/COEP page + worker, bundles rebuilt per request
npx tsx bench/run.ts chromium correct|open|validate|big|scroll   # -> results/chromium-*.txt
npx tsx bench/run.ts webkit   correct|open|big|scroll            # -> results/webkit-*.txt
node --import tsx bench/node-validate.ts F1-100 7                # results/node-validate.txt
```
- **Chromium heaps**: CDP `Runtime.getHeapUsage` on the page and on the dedicated worker, attached through `Target.setAutoAttach`, after `HeapProfiler.collectGarbage`.
- **Chromium RSS**: max renderer RSS among the processes descended from our own browser PID.
- **WebKit memory**: not measured.

## What surprised us
1. **The skip table is almost empty in practice; the checkpoints do the work.**
   - Realistic payloads are many small records, so at 1–16 KB only the root and a few top-level members are indexed. The threshold barely matters.
   - What makes AC9 and random groups fast is the per-container checkpoint array: the offset of every 100th child, 8 B per 100 children, built while scanning and in the background.
   - The skip table matters only for *nested* large containers (F9: jumping over a 25 MB "head" costs O(1)), and as the source of root and child counts.
2. **The ADR's "flattened visible-row list" would not survive 1M visible rows.** The prototype keeps no row array. It keeps a tree of expanded ranges with arithmetic RULE-12 group sizes and prefix sums, and looks up row *i* with binary search per level.
   - 1,010,110 visible rows cost 10,106 nodes (+8 MB heap).
   - "Expand all groups" takes 2–5 ms. Collapse-all is O(1).
3. **CM6 `Text` chunks make the scanner simpler.** The mirror iterates by lines, and no valid JSON token contains a raw line break, so a token never spans two chunks. The tree scanner needs no cross-chunk token state, unlike the validator.
   - Offsets are editor positions, so "show in text" is an identity mapping.
   - Copy value (`sliceString(s, e, lineEnding)`) reproduces CRLF documents byte-exactly (F6: 1,049/1,049).
4. **Building the skip table during validation costs nothing measurable.** It adds one store per container open, one increment per comma, and a subtract-and-compare per close. A/B runs were noise-bound (±30 % between identical runs under load 24–72). It removes the separate pass, which costs 0.15–0.6 s at 100 MB (the only slow part of "first tree view").
5. **Validation on CM6 `Text` line chunks was slower than SP-formatter's 1 MB string chunks**: 83–180 vs 248–272 MB/s in Chromium, measured under load. Part of this is the per-line `feed()` overhead with 5 M lines; this should be re-measured in SP-pipeline on a quiet machine.
6. **Roving tabindex breaks under virtualization.** When the selected row scrolls out of the rendered window, nothing in the tree is tabbable. Fix (prototyped): the tree container becomes the tab stop (`tabindex=0`) and, on focus, scrolls the selected row in and moves focus to it.
7. **Height scaling makes wheel scrolling coarser.** One pixel of the 8 M px spacer covers (rows × 24 / 8 M) rows: 3× at 1M rows. Frames stay fast, but fine scrolling of huge expansions needs wheel interception in scaled mode.
8. **The worker mirror dominates memory, not the tree.** F1-100 as CM6 `Text` is 244 MB of worker heap (2.45×), and F7 is 288 MB. The tree adds ≤ 3 MB in the worker and ≤ 9 MB on the main thread. Adding the editor's own document on the main thread (SP-editor) would exceed 3× for multi-line documents. This is for SP-pipeline.
9. **Cold random access in a 1M container is the only marginal number.** It took 197–283 ms in Chromium under load 30–70, because the cold scan covers about 18 MB from the last checkpoint. The background fill finishes within 38–111 ms of the first expansion, so a real user rarely hits the cold case.

## Spec ambiguities (proposed, not edited)
- **RULE-06 escaping of member names**:
  - The prototype formats the *decoded* name: `"ABC"` → `$.ABC`, `"😀"` → `$["😀"]`.
  - Non-identifier names are re-escaped minimally, like `JSON.stringify`: `"`, `\`, control characters, and lone surrogates as `\udXXX`; `/` and non-ASCII are not escaped. Example: `$["a\"b"]`, `$["\ud800"]`.
  - Please confirm decoded rather than as-written, and add these as examples.
- **RULE-12 initial expansion when the root itself is grouped** (more than 100 children): what does "its direct children are expanded" mean?
  - The prototype expands the first group chain down to `[0 … 99]` and expands those 100 children.
  - Please confirm, or say "only the root and the first group".
- **F-006.R2: how keys are shown.** The prototype shows decoded names as JSON-quoted strings (`"a\nb"`). Values are shown as written.
- **RULE-11 with mixed line endings**: copy value joins lines with the document's dominant line ending (ADR-0006 §3). A node spanning mixed endings is therefore not byte-exact. Suggest referencing the ADR-0006 consequence in RULE-11.
- **CMP-TreeView keyboard**: say that the tree container is the tab stop when the selected row is not rendered (Surprise 6).

## Recommendation: ADAPT. Accept ADR-0007 with these amendments
1. **§1 Skip table**:
   - Build it inside the validation pass (hooks in MOD-Core), always in the large and very-large tiers. Drop §6's "only after the tree was opened" optimisation: the cost is not measurable and it saves 0.15–0.6 s at 100 MB.
   - Keep the threshold at 4 KB.
   - Bound the table at `max(65,536, 4 × length / T)` entries. On overflow, double T and drop smaller entries. This is monotonic: an indexed container's ancestors stay indexed.
   - Table size is ≤ 1.2 MB at 100 MB, even when adversarial.
2. **First tree view without a validation-built table** (e.g. after a cancelled validation): the standalone structural pass (150–380 MB/s) must run as a sliced, cancellable job under COPY-progress.tree (NFR-02), because it takes 0.6 s at 100 MB on F4.
3. **§2 Checkpoints are the main mechanism**:
   - Create a checkpoint array (8 B per 100 children) per container with more than 100 children, filled while scanning.
   - Run the background fill as a LIFO queue (most recently expanded container first) in ≤ 8 ms slices.
   - Query scans that can exceed one slice (cold random access in containers with more than 500k children) should also yield, so validation and edit messages interleave.
4. **§3 Row model**: replace the "flattened visible-row list" with a range tree.
   - Each expanded container or group is a node with its RULE-12 group size, a map of expanded entries and lazily rebuilt prefix sums. Row *i* is found by binary search per level.
   - Item data lives in a bounded block cache (100 rows per block, LRU, a few thousand blocks).
   - Expansion and collapse are O(depth); a flat list is O(visible rows).
5. **§4 Virtual list**:
   - Fixed 24 px rows, pooled row elements, and a spacer capped at 8 M px with proportional mapping (Gecko-safe).
   - In scaled mode, intercept wheel and keyboard paging so they move by virtual pixels.
   - The roving-tabindex fallback from Surprise 6.
   - Prefetch the neighbouring blocks (±1 viewport) to cut placeholder frames during fast scrolling.
6. **§5 Copy value**:
   - The worker builds `Blob([text.sliceString(s, e, lineEnding)])`. This was measured exact for LF, CRLF and CJK.
   - For WebKit (not measured here, a known constraint), create the `ClipboardItem` synchronously in the click handler with a *Promise* of the Blob, so the user-activation window is not lost during the worker round trip.
   - Copy path is formatted on the main thread from the container path parts held in the row model. No worker call is needed.
7. **Show in text**: worker offsets are CM6 positions, so pass the span straight to `EditorView` (selection plus `scrollIntoView`). This was 97/97 exact and in view in both engines.
8. **Carry to SP-pipeline**:
   - Measure the CM6 `Text` mirror's memory (2.45–2.88× for multi-line 100 MB documents) together with the editor's own copy.
   - Measure validation throughput on `Text` line chunks on a quiet machine.
   - Run Gecko by hand.
9. **Spike plan**: please append a short result note for this spike to `spike-plan.md` when merging. It was not edited here, to avoid conflicts with parallel spike branches.
