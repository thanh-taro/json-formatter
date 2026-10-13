# Spike SP-formatter: lossless token formatter in a worker

- **Date**: 2026-10-13 · **Branch**: `spike/formatter` · **Time box**: 1 day. Used about half of it.
- **Prototype**: `spikes/formatter/` (throw-away). Contents:
  - `src/core.ts`: the engine, about 800 lines.
  - `src/fixtures.ts`: seeded fixture generator.
  - `test/`: vitest and fast-check tests.
  - `bench/`: Node bench, browser worker bench page, Playwright driver.
  - `results/`: raw logs.
- **Decision**: **ADAPT**. Accept ADR-0005 with the amendments listed at the end.

## Question
Can a hand-written, iterative, chunk-resumable TypeScript tokenizer do all of the following?
- Validate (RULE-03/04/05/14).
- Beautify and minify losslessly, at ≥ 50 MB/s in a worker, on all three engines.
- Report exact RULE-04 positions.
- Agree 100 % with JSONTestSuite.

## Hypothesis
A table-driven `charCodeAt` state machine with an explicit stack does this in plain JS:
- It runs well above 50 MB/s.
- Output is built only from input slices plus generated whitespace, so INV-01 holds by construction.
- WebAssembly is not needed.

## Reference machine
- Apple M3, 16 GB, macOS 27.0.1.
- Node 24.19.0 (V8 13.6).
- Chromium 156.0.8078.4 (Playwright, headless).
- WebKit 27.2 (Playwright, headless).
- **Firefox 157.0** (the installed app, run by hand). Playwright's Firefox build will not start on this macOS; see Surprises.
- **Safari 27.0.1** (real, run by hand).

MB = 10⁶ UTF-8 bytes of input. Times are the median of 5 runs, after one warm-up run. Firefox and Safari used 3 runs. Input is fed in 1 MB string chunks unless noted.

## Result vs. pass criteria

| Criterion | Target | Measured | Verdict |
|---|---|---|---|
| F1 100 MB, Chromium worker: validate / beautify / minify | ≥ 50 MB/s each | **272 / 119 / 167 MB/s** | pass |
| F1 100 MB, Gecko worker (Firefox 157) | ≥ 30 MB/s | **216 / 118 / 155 MB/s** (¹) | pass |
| F1 100 MB, WebKit worker (Playwright 27.2) | ≥ 30 MB/s | **303 / 166 / 135 MB/s** | pass |
| F1 100 MB, WebKit worker (real Safari 27.0.1) | ≥ 30 MB/s | **326 / 286 / 299 MB/s** (¹) | pass |
| JSONTestSuite y_ / n_ | 100 % | **95/95 y_, 188/188 n_** | pass |
| Property tests (fast-check) | 0 failures | **0 failures in 110,000 cases** (10k on the default seeds, plus 2 × 50k on seeds 99 and 12345) after fixing 1 engine bug they found | pass |
| No stack overflow | 10,000 valid; 10,001 → `too-deep` | 10,000 levels valid (arrays and mixed `{"k":[…`). 10,001 → `too-deep` at 1:10001. 1,000,000 × `[` → `too-deep` at 1:10001. | pass |
| Cancel latency | ≤ 50 ms | WebKit ≤ 25 ms, Safari ≤ 17 ms, Firefox ≤ 34 ms. Chromium, after the fix: 24 of 25 probes ≤ 39 ms, **1 outlier at 55.7 ms** (a GC pause). Before the fix there was a 129 ms outlier. | marginal → adapt |
| F-005 position examples | all exact | AC2 2:8, AC3 1:7, AC4 1:10, AC5 1:8 and 1:19, AC10 1:1, AC11 1:10001, plus 40 RULE-04 cases. All exact at chunk sizes 1, 3 and whole. | pass |

(¹) Firefox and Safari were measured before the output-flattening fix described below. That fix only makes things faster, so these numbers are lower bounds.

**NFR-03** (10 MB ≤ 1 s, 100 MB ≤ 10 s) holds with at least 4× margin on every fixture and engine:
- Worst 10 MB case: 472 ms (Safari, F3 beautify, an outlier on a cold JIT).
- Worst 100 MB case: 2.3 s (Node, F3 beautify, before the fix).

## Numbers

### Throughput, MB/s (after the flatten fix unless marked)

| Fixture | Node 24 | Chromium 156 | WebKit 27.2 (PW) | Firefox 157 (¹) | Safari 27.0.1 (¹) |
|---|---|---|---|---|---|
| F1-10MB validate / beautify / minify | 166 / 131 / 169 | 249 / 150 / 284 | 385 / 176 / 176 | 238 / 135 / 145 | 323 / 154 / 435 |
| **F1-100MB** | 241 / 138 / 165 | **272 / 119 / 167** | 303 / 166 / 135 | 216 / 118 / 155 | 326 / 286 / 299 |
| F2-100MB (minified, 1 line) | 225 / 125 / 275 | 248 / 113 / 313 | 260 / 193 / 443 | 198 / 91 / 270 | 326 / 128 / 123 |
| F3-100MB (`[1,2,3…]`) | 148 / 71 / 155 | 176 / 57 / 172 | 231 / 67 / 244 | 117 / 47 / 111 | 251 / 63 / 251 |
| F4-100MB (`[[],{},…]`) | 77 / 52 / 104 | – | – | – | – |
| F7-100MB (CJK + emoji) | 293 / 166 / 216 | 323 / 142 / 190 | 439 / 267 / 323 | 280 / 137 / 169 | 474 / 392 / 52 (²) |

(²) One Safari outlier: F7-100MB minify gave 457–2223 ms across 3 runs, under memory pressure from the earlier runs in the same worker. Earlier in a fresh Playwright WebKit process, the same op ran at 459 MB/s.

Beautifying F3/F4 is the slowest case because the output is 1.8–2× the input (one line per element). It is the only case below 60 MB/s, and it is not the pass fixture.

### Feed chunk size (Node, F1-100MB, validate / beautify / minify)
| Chunk size | MB/s |
|---|---|
| 32 chars | 154 / 100 / 121 |
| 1 KB | 246 / 141 / 184 |
| 64 KB | 246 / 143 / 157 |
| 1 MB | 241 / 138 / 165 |

### Time slicing in the worker (F1-100MB; slice budget 30 ms or 4 MB; 256 KB pieces; yield via MessageChannel)
| Engine | validate: max / p95 slice | beautify: max / p95 slice | Cancel latency |
|---|---|---|---|
| Chromium | 16.8 / 16.1 ms | 50.2 / 49.5 ms | 55.7, 11.1, 24.5, 25.5, 7.9 ms |
| Chromium, rerun | 20.5 / 16.3 ms | 42.5 / 32.1 ms | 10 probes, max 38.9 ms |
| Chromium, 16 ms budget | 16.8 / 16.1 ms | 81.1 / 28.7 ms | 10 probes, max 30.1 ms |
| WebKit | 18 / 17 ms | 30 / 28 ms | max 25 ms |
| Firefox | 22 / 20 ms | 36 / 34 ms | max 34 ms |
| Safari | 12 / 11 ms | 21 / 20 ms | max 17 ms |

Two things set the slices:
- The 4 MB unit cap ends almost every slice (24 slices per 100 MB). The 30 ms time budget rarely fires.
- The maximum slice is set by garbage-collection pauses, not by tokenizer work.

### Memory (Node, `--expose-gc`, F1-100MB, output chunks kept; heap growth above the 107 MB input string)
| Op | Peak heap growth | Retained after GC | Process maxRSS |
|---|---|---|---|
| validate | +4 MB | 0 MB | 437 MB |
| beautify, **before** fix | +628 MB | **628 MB for 100 M chars (6.3×)** | 1,067 MB |
| beautify, after fix | +134 MB | 100 MB (1.0×) | 556 MB |
| minify, before → after fix | +455 → +129 MB | 455 → 67 MB | 957 → 621 MB |
| F2-100MB beautify (output 150 M chars) | +190 MB | 151 MB | 713 MB |
| F7-100MB beautify (two-byte strings) | +204 MB | 164 MB | 782 MB |

The fix also made beautify 1.75× faster in Node (1,291 → 740 ms). The longest single 1 MB chunk fell from 200–380 ms to ≤ 58 ms.

### Conformance detail (JSONTestSuite, MIT, files in a gitignored `vendor/` folder)

n_ rejections by code:

| Code | Count |
|---|---|
| invalid-number | 43 |
| unexpected-character | 32 |
| unclosed-container | 16 |
| invalid-literal | 14 |
| invalid-escape | 14 |
| extra-content | 13 |
| not valid UTF-8 (RULE-13 decoder) | 12 |
| unclosed-string | 9 |
| unquoted-key | 5 |
| missing-comma | 4 |
| control-character | 4 |
| missing-colon | 4 |
| single-quotes | 4 |
| comment | 4 |
| trailing-comma | 3 |
| empty-document | 2 |
| too-deep | 2 |
| unexpected-closing | 2 |
| `empty` (the 0-byte file `n_structure_no_data`; per RULE-03 it is neither valid nor invalid) | 1 |

i_ outcomes:

| Outcome | Files |
|---|---|
| Accepted: huge or tiny numbers (flagged `unsafe-number`) | 10 |
| Accepted: lone or invalid surrogate escapes | 10 |
| Accepted: `i_structure_500_nested_arrays` | 1 |
| Accepted: `i_structure_UTF-8_BOM_empty_object` (valid, plus a `byte-order-mark` warning) | 1 |
| Rejected by the fatal UTF-8 decoder (UTF-16 input, overlong sequences, Latin-1, …) | 13 |

Every y_ file round-trips token-identically through beautify and minify when fed in 7-char chunks.

### Large-fixture byte checks (`scripts/selfcheck.ts`, 10 and 100 MB)
- `beautify(F1) === F1` byte-for-byte, with 64 KB chunks.
- `minify(F1)` is exactly the matching prefix of F2.
- `beautify(F2 cut to F1's records) + LF === F1`.

## Evidence (run from `spikes/formatter/`)
```
pnpm install
tsx scripts/gen-fixtures.ts                      # fixtures/ (gitignored): F1,F2,F3,F4,F7 × 10/50/100 MB, F8
vitest run                                       # 61 tests: rules/positions, JSONTestSuite, 10k property cases
SEED=99 NUM_RUNS=25000 vitest run test/property.test.ts --testTimeout=600000
tsx scripts/selfcheck.ts                         # results/selfcheck.txt
tsx scripts/jts-codes.ts                         # results/jts-codes.txt
tsx bench/node-bench.ts 5 1048576                # results/node-bench.txt (before fix), node-bench-flat.txt (after)
tsx bench/node-bench.ts 3 32 F1-100MB            # results/node-chunksize.txt
node --expose-gc --import tsx bench/node-mem.ts F1-100MB beautify
tsx bench/serve.ts 8787 1000 &                   # benchmark page + worker on localhost
tsx bench/browser-bench.ts chromium 5 F1 10,100  # results/playwright-flat.txt (one fresh browser per fixture)
open -a Firefox "http://127.0.0.1:8787/?auto=1&post=1&runs=3"   # results/manual-browsers.txt
open -a Safari  "http://127.0.0.1:8787/?auto=1&post=1&runs=3"
node scripts/v8probe.mjs; tsx scripts/v8probe-browsers.ts
```
`results/playwright.txt` and `results/playwright-webkit*.txt` are the first runs, before the fix. They include the WebKit stall described below.

## What surprised us
1. **Rope (cons-string) retention was the real cost, not tokenizing.**
   - Building output with `+=` leaves V8 rope trees of millions of tiny slices: 6.3× the text size.
   - Those trees caused 200–380 ms garbage-collection pauses and made beautify slower.
   - Fix: force each emitted ~2 MB chunk flat with a one-line regexp test. Retained memory drops to 1.0×, beautify gets 1.75× faster, and the longest chunk drops to ≤ 58 ms.
   - Without this fix, the SP-pipeline 1.5 GB budget would be at risk.
2. **`JSON.parse` in Node 24.19 / V8 13.6 returns wrong member names.** This happens for escaped keys after object-shape (map-transition) reuse:
   - `{"x":{"k":1,"\\":2},"y":{"k":3,"\u0061":4}}` parses with key `"\\"` instead of `"a"` in `y`.
   - `"\n"` keys are affected too.
   - Chromium 156 and WebKit 27.2 parse it correctly; the bug is fixed upstream.
   - It made a JSON.parse-based test oracle fail. Test oracles must not depend on `JSON.parse` for keys.
   - It is extra support for ADR-0005's "no `JSON.parse`" choice.
3. **WebKit's content process died silently.** This happened after about 10 consecutive 100 MB jobs (each generating, formatting and keeping output) in one long-lived worker:
   - No `crash` event fired and the pending request never resolved.
   - In a fresh process the same job runs at 459–500 MB/s.
   - So the worker can disappear under memory pressure without any error.
4. **Playwright's Firefox (build 1555) does not start on macOS 27**: it is killed with SIGTERM at launch, both headless and headful. Gecko had to be measured by hand in the installed Firefox, through a self-posting benchmark page.
5. **Chunk size barely matters.** Even 32-char chunks run at 100–154 MB/s. The worker can feed CodeMirror `Text` lines directly; it does not need to join windows with `sliceString`.
6. **A 20 KB input (F8, 10,000 levels) beautifies to exactly 200,000,000 chars**, and it does so inside a single `feed()` call.
   - The prototype checks output size only at the end of each `feed`, so one call can grow the output without bound.
   - The check has to sit in the hot loop, at each generated line break.
   - This confirms that F-002.AC10 needs the size prediction before running.
7. **One real engine bug was found by the property tests, and it would not have shown up in example tests.** The duplicate-key check read a stale depth field, which raised false `duplicate-key` warnings whenever nested keys shared a chunk.

## Spec ambiguities found (proposed, not edited)
- **ENT-Issue `offset`**:
  - The spec says "code points", which makes CRLF count as 2.
  - ADR-0005 says editor offsets count one per line break.
  - Proposal: users only see line and column. Define `offset` as internal editor positions, or drop it from the entity.
- **RULE-04 unclear cases.** These are the prototype's choices; please confirm and add them as examples:
  - A raw line break inside a string → `control-character` at the break. Users may expect `unclosed-string`. Consider a rule that a line break inside a string reports `unclosed-string` at the opening quote.
  - A `/` not followed by `/` or `*` → `unexpected-character`. RULE-04 says `comment`, but only `//` and `/*` are comments.
  - `[1]]` → `extra-content`, not `unexpected-closing`.
  - `{"a":}` → `unexpected-closing`.
  - `[1,,2]` → `unexpected-character`.
  - `[1 x]` → `missing-comma`.
  - `{"a" }` → `missing-colon` at `}`.
  - A document with only a BOM → `empty-document`.
- **RULE-05 `unsafe-number`: "more than 17 significant digits".** The prototype ignores leading and trailing zeros, so `1.000000000000000000000` is not flagged. Please confirm.
- **RULE-05 `duplicate-key`.** The prototype compares decoded names, so `"a"` and `"\u0061"` count as duplicates. Please confirm.
- **NFR-08 and JSONTestSuite `n_structure_no_data` (0 bytes).** RULE-03 makes this `empty`, not an error. Record it as a documented expectation.

## Recommendation: ADAPT. Accept ADR-0005 with these amendments
1. **Output emission (MOD-Core):**
   - Emitted chunks must be flat strings. Build with `+=` and flatten on emit (measured fix), or encode to UTF-8 `Uint8Array` chunks for the Blob export path.
   - Check the output buffer size inside the hot loop, at each generated line break, so pathological expansion (F8) still streams in bounded chunks.
2. **Slicing (MOD-Worker):**
   - Change the budget from "~30 ms or ~4 MB" to "**~16 ms or ~1 MB of input**".
   - Hand output chunks off (post or adopt) as each slice ends, instead of holding them until the job finishes. This keeps garbage-collection pauses inside slices and cancel at or below 50 ms; the one miss measured was 55.7 ms at 4 MB.
3. **Worker liveness:**
   - Extend the hard-cancel fallback (§4) to *silent worker death*: a heartbeat, or a per-job watchdog that expects progress at least every 1 s.
   - On a miss: terminate, restart, reseed the mirror, keep the document unchanged, and show an error. The WebKit observation shows the worker can vanish without an `error` event.
4. **Input feeding:** feed the mirror's lines (`Text.iter`) directly. No windowed `sliceString` is needed, which saves one 100 MB copy per job.
5. **Duplicate keys:** keep one shared key stack with a frame per object; scan linearly up to 16 keys, then switch to a lazily created `Set`. This allocates nothing per object, and it is the design that passed.
6. **Positions:** confirmed. The core reports UTF-16 offsets, and `resolvePositions` maps them to line and column in one sorted pass. The hot loop keeps no line or column state.
7. **Keep plain TypeScript and drop the WebAssembly alternative.** It is not needed: there is 2–6× headroom on every engine.
8. **For ADR-0010 (testing):**
   - The INV-01 oracle is an independent reference tokenizer plus token-sequence equality, never `JSON.parse`. That function is buggy in Node 24.19.
   - Run the property suite at ≥ 10k cases per seed in CI, with a 60 s test timeout.
   - Gecko automation: Playwright's Firefox does not launch on macOS 27, so run Gecko in Linux CI or keep the manual page (`bench/serve.ts`).
9. **For SP-pipeline:** use the flattened-output core. Re-measure peak memory with three 100 MB undo snapshots. Before the fix, output alone cost 6× in Node.
10. **Spike plan:** please append a short result note for this spike to `spike-plan.md` when merging. It was not edited here, to avoid conflicts with parallel spike branches.
