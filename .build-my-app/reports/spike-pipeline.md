# Spike SP-pipeline: end-to-end 100 MB (load, validate, edit, tool ops, undo, cancel, export)

- **Date**: 2026-10-13 · **Branch**: `spike/pipeline` (merges `spike/formatter` and `spike/editor`) · **Time box**: 1.5 days, about 0.5 day used.
- **Prototype**: `spikes/pipeline/` (throw-away). It reuses `spikes/formatter/src/core.ts` (tokenizer, flattened output) and the SP-editor CM6 large-tier setup.
- **Decision**: **ADAPT.** The pipeline works end to end on all three engines and meets every time, cancel and main-thread budget. Memory does not fit as ADR-0005/0006 are written:
  - Chromium meets 1.5 GB only after two changes: no CM `Text` mirror in the worker, and Blob-backed undo in the large tier.
  - Gecko and WebKit exceed 1.5 GB with every variant tried. This needs a spec decision on NFR-04.
  - WebKit scrolling of a formatted 100 MB document is still over budget.

## Question
With the worker mirror, chunked commit and three undoable whole-document operations, does a 100 MB session stay below 1.5 GB peak, with no main-thread task over 50 ms, and meet NFR-03 end to end?

## What was built
`spikes/pipeline/` has these parts:
- **Pages**: a stub host on `:5280` frames the tool on `:5281` (same-site, cross-origin, ADR-0008 frame attributes).
- **CSP**: ADR-0009's CSP verbatim, including `connect-src 'none'`. The only deviation is no boot-script hash.
- **Editor**: CM6 large tier mounted in a **shadow root** (lineNumbers, drawSelection, the SP-editor direct-input handler).
- **Worker**: a same-origin module worker (no `blob:` workers, no WASM).

Pipeline steps:
1. **Load**: the `File` is posted to the worker. The worker reads it, decodes it with a fatal UTF-8 decoder that keeps the BOM, validates it with the SP-formatter core, and forwards ~1 M-unit text chunks.
2. **Commit**: the main thread builds a pending `Text` in ≤ 8 ms slices (`src/builder.ts`) and commits it in one transaction.
3. **Edit sync**: edits go to the worker as change sets; the worker validates after 300 ms of idle.
4. **Tool ops**: beautify, minify, beautify, then re-indent (2 → 4 spaces, line-based). Output streams back and is committed as one undo step.
5. **Undo history**: a custom history (RULE-15: keeps the last 3 tool ops; on trimming it shows COPY-notice.undo_trimmed once).
6. **Undo, cancel, export**: undo ×3; cancel mid-beautify; export Blob → download link and `ClipboardItem` with a promised Blob.

Variants (URL parameters `mirror` and `undo`):

| Variant | Worker document | Undo entry of a tool op (large tier) |
|---|---|---|
| **A** (ADR as proposed) | CM `Text` mirror | previous `Text` (in memory) |
| **B** | no mirror: the main thread streams a snapshot per job (validate, tool, export) | previous `Text` |
| **C** | CM `Text` mirror | worker-built UTF-8 Blob |
| **D** | no mirror (snapshot per job) | Blob, built in the worker from the snapshot stream |
| **E** | **compact mirror**: a list of ~1 M-unit flat strings, line breaks normalised (`src/rope.ts`) | Blob |

**Instruments** (`bench.mjs`):
- rAF frame-gap probe and `longtask` observer (Chromium) per step.
- Main heap from `performance.memory` (Chromium, after `gc()`).
- macOS **phys_footprint** (`footprint -p`) and RSS of the renderer, sampled every ~150 ms. Only this driver's own process tree is counted, because other agents were running browsers at the same time.
- Chromium memory-infra dumps (`memdump.mjs`).
- `blob-probe.mjs` for the Blob limits.
- Gecko and Safari use a self-running page (`?auto=F1-100`) with `manual-serve.mjs`, which records footprint per step.

**Memory metric.** NFR-04 is judged on the **peak footprint of the renderer process** that holds the tool page and its worker. Footprint is what Activity Monitor shows; RSS undercounts on macOS because of memory compression.

**Machine**:
- Apple M3, 16 GB, macOS 27.0.1.
- Chromium 156.0.8078.4 (Playwright headless shell), and Google Chrome 155.0.8059.40 headless for one cross-check.
- WebKit 27.2 (Playwright).
- **Firefox 157.0.1**: the installed app, run `--headless`. Playwright Firefox 1555 still dies at launch.
- **Safari not measured.** The display was asleep, so rAF in the headed Safari window never ran and the auto run stalled after load.

**Load.** Other agents loaded the machine heavily during the first runs (load average 13–72). Timing numbers from those runs are pessimistic. The `-r2` runs were taken at load ≤ 10.

Fixtures (SP-formatter generator, MB = 10⁶ bytes):

| Fixture | Content | Size |
|---|---|---|
| F1 | formatted | 100 MB, 5.28 M lines |
| F2 | minified | 1 line |
| F7 | CJK and emoji | 82 M UTF-16 units |
| F1 | formatted | also 10, 150 and 200 MB |

## Result vs. pass criteria

| Criterion (spike plan) | Measured | Verdict |
|---|---|---|
| Peak < 1.5 GB, F1 100 MB, Chromium | **A 2,262 / 2,282 MB · B 1,520 / 1,650 · C 1,792 / 1,979 · D 1,413 / 1,376 · E 1,478 / 1,502 / 1,297 (¹)**. Real Chrome 155, E: 1,385 | A, B, C **fail**; D passes; E is borderline |
| Peak < 1.5 GB, F2 100 MB, Chromium | Load and scroll: 430 / 258 MB. Beautifying F2 gives 150 MB, which is the very-large tier (RULE-02), so later steps are out of NFR-04 scope. E peak there: 1,722–1,802 MB | in-tier pass |
| F7 100 MB, Chromium, E | 1,644 / 1,672 MB (scroll transient). Tool ops alone: 1,593 | marginal fail |
| Gecko / WebKit must not crash | No crash. **WebKit E / D: 2.0–2.8 GB · WebKit A: 4.9 GB during tools, 6.9 GB by the end · Firefox E: 2.6 GB** | observed, **over 1.5 GB** |
| No main-thread task > 50 ms in load, tools, undo, cancel, export | Chromium: 0 long tasks in these steps in A, C, D and E. Builder slices are typically ≤ 14 ms, with outliers of 21–43 ms (GC, or D's 1 MB snapshot windows). One 73 ms task in B run 1, under heavy load. WebKit and Firefox: max main slice 5–34 ms | pass (Chromium); WebKit and Gecko pass on slices |
| No frame > 50 ms while scrolling (NFR-04) | Chromium wheel: 16.8–50 ms fresh, 33–83 ms after the synthetic jump storm. **WebKit F1: 78–170 ms fresh; 169–986 ms after the storm.** Firefox: 33 ms wheel, 83 ms after the storm. F2 (one line): 17–19 ms everywhere | Chromium marginal; **WebKit fail** |
| 10 MB beautify ≤ 1 s | Chromium 107–153 ms click to shown | pass |
| 100 MB beautify ≤ 10 s | Click to shown: Chromium 0.54–1.8 s (worst under load), Chrome 1.5 s, WebKit 0.65–1.85 s, Firefox 1.0 s. Minify 0.37–1.4 s; re-indent 0.54–1.85 s | pass, ≥ 5× margin |
| Cancel ≤ 200 ms, document unchanged | Chromium 8–30 ms, WebKit 13–19 ms, Firefox 5 ms; `docUnchanged` true every time. One invalid WebKit probe: the job had already finished; the trigger was fixed | pass |
| COPY-notice.undo_trimmed path | 5 tool ops (load + 4) → trims = 2, history = last 3 tool ops, notice shown once, undo ×3 restores exact lengths | pass |
| Keystroke → validation result, 100 MB (includes the 300 ms debounce) | Chromium A 828–998 ms, E 637 ms, D 831 ms; WebKit 611–969 ms; Firefox 741 ms | informative |
| Mirror correctness | The worker export is byte-identical to the editor after typing (E, Chromium, WebKit, Firefox). Download equals the fixture bytes after undo ×3 | pass |
| Zero CSP violations | 0 in every run (shadow-root mount, same-origin worker) | pass |

(¹) Several runs per variant; the run label is the order. The peak over a run is usually set by the scroll steps (see Surprise 1), not by tool ops. Tool-phase peaks alone:

| Variant | Tool-phase peak |
|---|---|
| A | 2,262–2,282 MB |
| B | 1,501–1,520 MB |
| C | 1,792–1,979 MB |
| **D** | **1,044–1,176 MB** |
| **E** | **1,297–1,468 MB** |

## Numbers

### Chromium 156, F1 100 MB, after the attribution fix (`results/chromium-*-r2.json`), peak footprint MB

| Step | A | B | C | D | E |
|---|---|---|---|---|---|
| load (time, ms) | 697 (773) | 356 (528) | 797 (766) | 354 (685) | 568 (766) |
| wheel, fresh | 1,495 | 1,243 | 1,520 | 1,240 | 1,334 |
| synthetic fling and jump storm | 1,680 | 1,420 | 1,699 | 1,376 | 1,453 |
| beautify #1 | 1,503 | 1,078 | 1,586 | 1,044 | 1,192 |
| re-indent (4th tool op) | **2,282** | 1,501 | 1,802 | 1,044 | 1,371 |
| undo ×3 (max) | 2,173 | 1,342 | 1,979 | 859 | 1,190 |
| settled after GC (end of run) | 1,749 | 1,226 | 1,637 | 501 | 749 |
| main heap peak during tools | 1,050 | 1,075 | 510 | 704 | 571 |
| undo of a tool op, time to shown | **3–10 ms** (+ mirror re-seed 36–573 ms) | 4–7 ms | 770–940 ms | 480–1,115 ms | 390–650 ms |

### Memory composition (Chromium memory-infra, A, `memdump.mjs`)

| Point | V8 main | V8 worker(s) | Blink GC (Oilpan) | PartitionAlloc |
|---|---|---|---|---|
| after load + GC | 294 | ~215–427 | 6 | 98 |
| mid-fling (scroll storm) | 330–348 | ~415 | **966–1,334** | 110 |
| after the storm + GC | 325 | 300 | 7 | 112 |
| after the 4th tool op | 1,101 | ~880 | 12 | 73 |
| after tools + GC | 864 | ~490 | 5 | 13 |

- One CM `Text` for F1 100 MB is **~245 MB of heap (2.45× the bytes)**. `architecture.md` assumed ~175 MB.
- In the Oilpan heap mid-fling, `allocated_objects` was only 74 MB of the 1,334 MB. The rest is garbage awaiting GC.

### WebKit 27.2, F1 100 MB (no forced GC, so footprint includes uncollected garbage)

| Step | A | D (r1 / r2) | E (r1 / r2) |
|---|---|---|---|
| load | 955 | 530 / 735 | 686 / 794 |
| wheel fresh: footprint / max frame (frames > 50) | 1,314 / 100 (32) | 798 / 148 (34), 1,322 / 78 (32) | 1,149 / 170 (114), 1,323 / 169 (32) |
| storm / wheel after the storm, max frame | 146 / 193 | 157 / 637, 598 / 169 | 345 / 986, 232 / 600 |
| wheel after `view.setState(view.state)` (compaction probe) | 553 | 90, 258 | 176, 331 |
| tool ops, peak | 3,682 → **4,901** | 2,690 / 2,714 | 2,274–2,508 / 2,686 |
| end of run | 6,945 | 2,421 | 1,557 / 2,061 |

### Firefox 157.0.1 headless, E, F1 100 MB (`results/manual-firefox-rope-blob-F1-100.json`)

| Step | Time | Max frame | Peak footprint (MB) |
|---|---|---|---|
| load | 1,026 ms | 17 ms | 697 |
| wheel-like scroll | – | 33 ms | 929 |
| storm | – | 117 ms (31 frames > 50) | 1,428 |
| beautify | 1.0 s | – | 1,665 |
| minify | 0.62 s | – | 1,949 |
| beautify | 0.97 s | – | 1,943 |
| re-indent | 0.9 s | 67 ms | 2,358 |
| undo ×3 | 0.44–1.04 s | – | **2,575** |
| cancel | 5 ms | – | – |
| export | 105 ms | – | – |

Main-thread slices were at most 34 ms in every step.

### Best effort > 100 MB (RULE-02 very-large tier)

| Case | Measured |
|---|---|
| Chromium, E, F1 200 MB | Load 1.0 s. Tools 1.2–1.7 s; undo 0.9–1.5 s. Peak 3.2 GB (scroll transient), 2.3 GB during tools. Wheel max frame 167–300 ms |
| WebKit, E, F1 200 MB | Load 1.5 s; footprint 5.7 GB; wheel max frame up to 2.3 s |
| WebKit, F1 150 MB | Download OK (524 ms). **Copy fails with `NotAllowedError`** (it works at 100 MB) |

## Evidence
All commands are run from `spikes/pipeline/`.

Setup:
```
pnpm install
pnpm exec tsx scripts/gen-fixtures.ts F1:10,100,150,200 F2:100 F7:100
pnpm exec vite build
node serve.mjs &
```

Measurement runs:
```
node bench.mjs chromium A F1-100MB          # A..F; writes results/<browser>-<variant>-<fixture>.json
TAG=r2 sh run-list.sh "chromium E F1-100MB" "webkit D F1-100MB"
CHANNEL=chrome node bench.mjs chromium E F1-100MB
JSFLAGS='--heap-growing-percent=20' STEPS=load,scroll,tools TAG=hgp20 sh run-list.sh "chromium E F1-100MB"
node memdump.mjs A F1-100MB                  # memory-infra breakdown; DETAIL=midFling for Oilpan spaces
node blob-probe.mjs webkit 100 120 150       # results/blob-probe-webkit.txt
python3 summarize.py results/chromium-E-F1-100MB-r2.json
```

Gecko (manual):
```
node manual-serve.mjs firefox '<regex>' &
firefox --headless --profile <tmp> 'http://localhost:5380/host.html?src=tool.html%3Fauto%3DF1-100%26mirror%3Drope%26undo%3Dblob'
python3 summarize_manual.py results/manual-firefox-*.json
```

Run logs are in `results/run-*.log` and include the load average at the start of each run.

**Caveats**:
- Headless browsers; synthetic scrolling. The fling of 4,000 px per frame is harsher than real input.
- Before the attribution fix, the first B, C and D runs could include other agents' processes. They are superseded by the `-r2` runs.
- The WebKit and Firefox footprints include garbage that could not be force-collected.
- Re-indent is a simplified 2 → 4 space line pass, not the full RULE-09 algorithm.
- No redo was implemented.

## What surprised us
1. **The memory peak is set by GC heuristics during scrolling, not by what we retain.**
   - With a single 100 MB document, the Chromium renderer reaches 1.24–1.70 GB while scrolling. The cause is Blink layout garbage: Oilpan reaches 1.3 GB with only 74 MB of objects allocated.
   - It drops back to 0.4–0.7 GB after a GC.
   - V8 and Oilpan let garbage grow in proportion to the *live* heap, which the 245 MB `Text` dominates. At 10 MB the same scroll adds only ~100 MB.
   - Proof: with `--heap-growing-percent=20` the scroll peak falls from 1,334–1,502 to **635–707 MB**, and the tool peak is unchanged.
   - The page cannot control this. The only lever is a smaller live heap on the main thread.
2. **A CM `Text` costs 2.45× the document bytes** (5.3 M line strings). The architecture budget of ~175 MB per copy is about 40 % too low. That is why A is 2.3 GB:
   - main thread: current + 3 history `Text`s ≈ 1.05 GB;
   - worker: mirror + pending mirror ≈ 0.6–0.9 GB.
3. **Undo of a tool op in A desynchronises the mirror.** An inverted whole-document change set cannot be sent as a change set (100 MB of JSON). The mirror has to be re-seeded from the editor in slices (36–573 ms), which ADR-0005/0006 do not mention. With Blob undo the reload re-seeds the mirror for free.
4. **WebKit cannot read worker-built Blobs larger than ~100–120 MB with `Blob.stream()` or `arrayBuffer()`.**
   - It throws `NotReadableError`, in the creating worker as well as after a round trip: 100 MiB works, 120 MiB fails (`blob-probe.mjs`). Reading 16 MB `slice()` windows works.
   - This first appeared as Blob undo failing in WebKit for the 150 MB F2-beautify documents.
   - Fix: read Blobs in 1 MB `slice().arrayBuffer()` windows (implemented). After the fix, undo passes 3/3.
   - File-backed Blobs (a picked 200 MB file) stream fine.
   - Related: **WebKit `ClipboardItem` copy of a 150 MB Blob fails** with `NotAllowedError`, while 100 MB works.
5. **Footprint in WebKit and Firefox keeps growing across operations** (WebKit A: 0.95 → 6.9 GB, while RSS stayed at 0.7–1.9 GB). Without a forced GC there is no way to tell garbage from retention.
   - The spike plan's "Gecko / WebKit observed" stance is the honest one: the 1.5 GB budget is only verifiable in Chromium.
6. **A compact mirror is cheap.** The flat-chunk rope is ~1× the bytes (two bytes per unit for non-ASCII). It applies change sets correctly: the export after typing is byte-identical.
   - Its offset-addressable chunks also suit ADR-0007's offset-based tree scans better than a line tree.
   - Even so, no mirror at all (D) is ~150–300 MB lower again at the tool-op peak.
7. **WebKit's degraded F1 scrolling is not caused by the jump storm alone.** It is already over 50 ms on a fresh page, and was worse under machine load.
   - `view.setState(view.state)` (resets the height map) helped in 2 of 4 runs (637 → 90, 986 → 176 ms) and hurt in 1 (193 → 553). It is not a fix.
8. **Clipboard copy is the largest export transient.** The browser materialises the text: Chromium total RSS rises by ~0.4–0.6 GB during copy. Download through an object URL is cheap (130–620 ms).

## Recommendation: ADAPT

### ADR-0005 (parsing and worker): amend
1. **No persistent CM-`Text` mirror in the worker.** Measured cost: +245 MB steady and +245 MB more during every tool op.
   - Adopt **variant D: no persistent mirror**. The worker receives a streamed snapshot per job (validate, tool op, export, tree build) and holds nothing between jobs except per-version results (validation result, tree skip table).
   - Snapshot windows: ≤ 256 K units, posted in ≤ 8 ms main-thread slices. Measured with 1 MB windows: maximum slice 13–43 ms, 0.4–1.0 s per 100 MB.
   - **Fallback, if SP-tree shows that serving text windows from the main thread is too slow**: variant E. That is a compact flat-chunk mirror (`spikes/pipeline/src/rope.ts`, ~1× the bytes) kept in sync by change sets. It is never a CM `Text`.
   - Update "Alternatives considered" accordingly: "snapshot per validation" is the chosen option, and the measured main-thread cost is acceptable.
2. **Blob reading**: read `File` / `Blob` input in **1 MB `slice().arrayBuffer()` windows, never `Blob.stream()`**. Reason: the WebKit failure above ~100–120 MB for in-memory Blobs. This also bounds worker slices.
3. **Slices** (confirms the SP-formatter amendment): load and tool jobs measured a worker maximum slice of 17–50 ms (GC included). Cancel was 5–30 ms on all engines.
4. Validation after an edit: 300 ms debounce. Measured keystroke → result 0.6–1.0 s at 100 MB on all engines. COPY-status.checking is required meanwhile (as already specified).

### ADR-0006 (commit, line endings, undo): amend
1. **Large and very-large tiers: undo entries of tool operations store the previous document as a worker-built UTF-8 Blob.** This is mandatory, not a fallback.
   - Undo reloads through the chunked load path, with progress: 0.4–1.1 s at 100 MB in Chromium, 0.3–1.2 s in WebKit, 0.4–1.0 s in Firefox.
   - Typing entries keep in-memory change sets.
   - In the normal tier, in-memory `Text` undo is allowed (10 MB: 289 MB peak in total).
2. **Memory budget table** (`architecture.md`): use **~2.45× the bytes per editor `Text` copy** (245 MB for 100 MB F1; ~300 MB for F7).
   - The irreducible main-thread peak is current + pending ≈ 0.5–0.6 GB during a tool op.
   - Add a line for "GC transient while scrolling: up to +1 GB in Chromium, not controllable".
3. **Chunked commit confirmed**: builder slices ≤ 8–14 ms typical; dispatch of the 100 MB replace takes 2–6 ms; 0 long tasks during load, tools, undo and export.
4. **Commit/adopt protocol**: without a mirror there is no adopt step. Results carry the document version, and stale results are dropped (unchanged).

### Other ADRs
- **ADR-0007 / SP-tree**: plan for the worker *not* holding the text.
  - Option 1: tree child queries request text windows from the main thread (`doc.sliceString`, ≤ 1 MB). SP-editor's windowed find shows this runs at 360+ MB/s.
  - Option 2: if that is too slow, use the E rope.
- **ADR-0004**: the shadow-root mount and the direct-input handler work in the full pipeline in Chromium, WebKit and Gecko (0 CSP violations). WebKit F1 scrolling is still over budget.

### Spec changes needed (proposed only; `specs/` was not edited)
1. **NFR-04, memory.** "Peak memory below 1.5 GB" is met only in Chromium, with D (1.38–1.41 GB) or E (1.30–1.50 GB). Even there, the margin is consumed by GC transients while scrolling, which the tool cannot control. Gecko measured 2.6 GB and WebKit 2.0–2.8 GB, with no means to separate garbage from retention.
   Options for the user:
   - (a) Measure NFR-04 memory in Chromium, as the tool renderer + worker after GC (live memory). D measured 0.5 GB settled. Gecko and WebKit then only must not crash or be killed.
   - (b) Raise the limit to ~2.5–3 GB of peak footprint across engines.
   - (c) Keep 1.5 GB literally and lower the fully supported size for WebKit and Gecko (for example to 50 MB).
   - Recommended: **(a)**.
2. **NFR-04, scrolling in WebKit.** Formatted 100 MB documents scroll with 78–170 ms frames even on a fresh page (Chromium and Gecko ≤ 50 ms on the wheel; one-line documents are fine everywhere). This is a user decision:
   - either accept a WebKit exception for scrolling in the large tier;
   - or fund a follow-up spike on the CM height map in WebKit.
3. **F-007 (copy) and RULE-02.** In WebKit, copying a document larger than ~120 MB fails, which can happen in the very-large tier. The spec should say that very-large copy may fall back to COPY-error.clipboard (select all + manual copy). Downloads work at 150 MB.
4. **RULE-15 wording.** Undo of a tool op in the large tiers takes up to ~1–2 s with progress, because it is a reload. No wording change is needed if NFR-02's "progress after 0.5 s" covers it; it does.
5. **F-005 / ENT-Issue offsets**: no change. The pipeline uses editor positions in the worker as SP-formatter proposed.

### Notes for the caller
- Please append the result note to `spike-plan.md` when merging; it was not edited here, to avoid branch conflicts.
- A Safari tab at `localhost:5380` may still be open from the stalled manual run. `osascript` could not close it while the display was asleep.
- To measure Safari: run `node manual-serve.mjs safari '^(?!.*ms-playwright).*com\.apple\.WebKit\.WebContent'` with the display awake, then open the auto URL.
