---
id: ADR-0005
title: Custom streaming tokenizer in one module worker with a document mirror
status: proposed
date: 2026-10-13
supersedes: []
---

## Context
- INV-01 / PRN-02: formatting may change only insignificant whitespace — number spelling,
  key order and duplicate keys preserved. `JSON.parse` loses all three, so no
  parse-then-stringify approach is acceptable.
- RULE-03/04/05: strict RFC 8259, first error with a code-specific position, warnings
  (duplicate keys, unsafe numbers, byte-order mark) capped at 1,000. RULE-14: depth 10,000 —
  recursion would overflow the stack, so processing must be iterative.
- NFR-03: 10 MB ≤ 1 s, 100 MB ≤ 10 s; NFR-02/PRN-04: never block the UI; progress after
  0.5 s, cancel after 1 s; F-005.R7: validation on every change without blocking typing.
- NFR-08: conformance with a public JSON test suite.
- Cross-origin isolation (needed for `SharedArrayBuffer`) is impractical in an iframe
  embedded by a third-party page (requires COEP on the host too).
- SP-formatter (2026-10-13) built this design as a prototype: 119–272 MB/s (Chromium),
  118–216 (Firefox), 135–303 (WebKit) on 100 MB; JSONTestSuite 95/95 y_ and 188/188 n_;
  110,000 property cases; 10,000-level nesting without recursion; all F-005 positions exact.
  It found three issues the design had to absorb: V8 rope retention of `+=`-built output
  (6.3× memory, 200–380 ms GC pauses), cancel latency up to 55.7 ms with 4 MB slices, and a
  WebKit worker that disappeared silently under memory pressure.

## Decision
1. **MOD-Core — one hand-written, table-driven, iterative tokenizer/validator** (pure
   TypeScript, no DOM, no dependencies) that consumes the document as a sequence of string
   chunks and can suspend/resume at any chunk boundary. An explicit container stack (byte
   array of 10,001 entries) replaces recursion. All operations are built on it:
   - *validate*: first error (RULE-04 positions) or valid + warnings (RULE-05) + document
     facts (UTF-8 byte length, line count, the per-line depth sums that let the UI predict the
     beautified size for any indent instantly);
   - *beautify / minify*: emit only (a) exact slices of input tokens and (b) generated
     whitespace — lossless by construction (INV-01), output streamed in ~1–2 MB chunks;
     **every emitted chunk is a flat string** (built with `+=`, then flattened on emit, e.g.
     by a one-line regexp test) — measured: retained output 6.3× → 1.0× text size, beautify
     1.75× faster, longest chunk ≤ 58 ms; the output-size check sits **in the hot loop at
     every generated line break**, so pathological expansion (20 KB at 10,000 levels →
     200 M characters in one `feed`) still streams in bounded chunks;
   - *duplicate keys* (RULE-05): one shared key stack with a frame per object; linear scan up
     to 16 keys, then a lazily created `Set` — no allocation per object;
   - *re-indent* (RULE-09): two line-based passes (detect unit, convert), valid or not;
   - *tree queries* (ADR-0007).
   Offsets are tracked in editor positions (UTF-16 code units, one per line break); line and
   column in code points (ENT-Issue) are resolved only for reported issues, in one sorted
   pass (`resolvePositions`), so the hot loop keeps no line or column state (confirmed
   exact at chunk sizes 1, 3 and whole).
   **Plain TypeScript, no WebAssembly**: 2–6× headroom over the 50 MB/s target on every
   engine; ADR-0009's CSP also blocks WASM compilation (no `'wasm-unsafe-eval'`).
2. **MOD-Worker — one dedicated module worker** owns all heavy work:
   - a **document mirror** (`@codemirror/state` `Text`), kept in sync by applying each editor
     change set with its version number; tool results computed in the worker are *adopted* as
     the next mirror version without sending the text back; jobs **feed the mirror's lines
     directly** (`Text.iter`) into MOD-Core — chunk size barely matters (32-character pieces
     still run at 100–154 MB/s), so no windowed `sliceString` copy is made;
   - a **job scheduler**: one job at a time; every job carries the document version; newer
     edits supersede queued validation; validation is debounced (immediate below 1 MB,
     ~150–300 ms idle in larger tiers);
   - **cooperative cancellation**: long loops run in time slices of **~16 ms or ~1 MB of
     input**, whichever comes first, and yield to the worker's event loop through a
     `MessageChannel` tick, so `cancel` and `edit` messages are processed between slices;
     output chunks are posted (or adopted) **at the end of each slice**, not held until the
     job ends, which keeps GC pauses inside slices and cancel ≤ 50 ms (with 30 ms / 4 MB the
     measured worst case was 55.7 ms, a GC pause);
   - **file reading**: the `File` handle is posted to the worker, which streams and decodes it
     with a fatal UTF-8 decoder that keeps a leading byte-order mark (RULE-13, RULE-03),
     validates while reading, and forwards decoded chunks to the main thread;
   - **export**: builds a `Blob` (UTF-8, document line ending) from the mirror for copy and
     download, off the main thread.
3. **Protocol**: a small typed message protocol (discriminated unions, version + job id on
   every message), hand-written — no RPC library. Results for a stale version are dropped.
   Large payloads move as transferable `ArrayBuffer`s or `Blob`s; text chunks move as strings
   of bounded size.
4. **Watchdog and restart**: the worker can die without an `error` event (WebKit content
   process under memory pressure: the pending request never resolved). `WorkerClient`
   therefore expects a progress or result message for every running job at least every 1 s,
   and treats a cancel ignored for > 1 s the same way. On a miss it terminates the worker,
   starts a new one, re-seeds the mirror from the editor in chunks, discards any pending
   document (the visible document is unchanged, INV-03) and reports `failed(internal)` so the
   UI shows an error.

## Alternatives considered
- **`JSON.parse` + `JSON.stringify`** — fastest native path, but lossy (numbers, duplicate
  keys), no error codes or positions per RULE-04 — violates INV-01 and PRN-03.
- **Existing lossless parsers** (`json-bigint`, `lossless-json`, `jsonc-parser`, `@lezer/json`)
  — none gives RULE-04 codes/positions and RULE-05 warnings exactly; most are recursive or
  build object trees (memory ×10 at 100 MB); `jsonc-parser` is lenient by design. Our grammar
  is small; owning it is lower risk than adapting.
- **WebAssembly tokenizer** (e.g. Rust/simdjson-style) — adds a toolchain, a string↔bytes
  copy per chunk, a second language and a CSP relaxation (`'wasm-unsafe-eval'`); SP-formatter
  showed plain TypeScript already exceeds the target 2–6×. Dropped.
- **Main-thread time-sliced validation** — no worker plumbing, but competes with input and
  scrolling at 100 MB (NFR-02, NFR-04).
- **No mirror; send a full snapshot per validation** — less memory, but ~100 MB copied per
  keystroke pause at 100 MB plus garbage-collection churn; SP-pipeline measures both.
- **`SharedArrayBuffer` + `Atomics` cancellation** — needs cross-origin isolation, which
  conflicts with iframe embedding by an arbitrary host page.
- **Comlink RPC** (Apache-2.0) — convenient, but hides transfer semantics and cancellation;
  the protocol is ~15 message types.

## Consequences
- Correctness concentrates in MOD-Core: property-based and conformance tests (ADR-0010) are
  mandatory (≥ 10k cases per seed in CI; the spike's property tests found a real
  duplicate-key bug that example tests missed), and the core is benchmarked in isolation.
- Test oracles for INV-01 use an independent reference tokenizer and token-sequence
  equality, never `JSON.parse`: Node 24.19 (V8 13.6) returns wrong member names for escaped
  keys after object-shape reuse (`{"x":{"k":1,"\\":2},"y":{"k":3,"\u0061":4}}`). This only
  affects tests run in Node — the product never calls `JSON.parse`, and Chromium 156 /
  WebKit 27.2 parse it correctly.
- Throughput: NFR-03 holds with ≥ 4× margin on every fixture and engine (worst 10 MB: 472 ms;
  worst 100 MB: 2.3 s). Beautifying arrays of tiny values (output ≈ 2× input) is the slowest
  case at 47–71 MB/s.
- Memory: the mirror duplicates the document (≈ 1× text size plus per-line overhead); the
  budget in `architecture.md` accounts for it; SP-pipeline verifies peak < 1.5 GB with the
  flattened-output core and three 100 MB undo snapshots.
- Validation of a 100 MB document after an edit takes ~1–2 s; the status shows
  COPY-status.checking meanwhile (F-005.R7, INV-05). Incremental re-validation is an M-3
  optimisation.

## Evidence
- SP-formatter report: `.build-my-app/reports/spike-formatter.md` (prototype, tests, benches
  and raw logs in `spikes/formatter/`, branch `spike/formatter`).
- SP-iframe report (CSP blocks WASM and `blob:` workers): `.build-my-app/reports/spike-iframe.md`.

<!-- Accepted ADRs are immutable. Write a new ADR to change a decision. -->
