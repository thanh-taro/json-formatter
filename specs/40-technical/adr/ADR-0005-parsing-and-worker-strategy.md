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

## Decision
1. **MOD-Core — one hand-written, table-driven, iterative tokenizer/validator** (pure
   TypeScript, no DOM, no dependencies) that consumes the document as a sequence of string
   chunks and can suspend/resume at any chunk boundary. An explicit container stack (byte
   array of 10,001 entries) replaces recursion. All operations are built on it:
   - *validate*: first error (RULE-04 positions) or valid + warnings (RULE-05) + document
     facts (UTF-8 byte length, line count, the per-line depth sums that let the UI predict the
     beautified size for any indent instantly);
   - *beautify / minify*: emit only (a) exact slices of input tokens and (b) generated
     whitespace — lossless by construction (INV-01), output streamed in ~1–4 MB chunks;
   - *re-indent* (RULE-09): two line-based passes (detect unit, convert), valid or not;
   - *tree queries* (ADR-0007).
   Offsets are tracked in editor positions (UTF-16 code units, one per line break); line and
   column in code points (ENT-Issue) are resolved only for reported issues, in one sorted
   pass, so the hot loop does no per-character bookkeeping beyond the state machine.
2. **MOD-Worker — one dedicated module worker** owns all heavy work:
   - a **document mirror** (`@codemirror/state` `Text`), kept in sync by applying each editor
     change set with its version number; tool results computed in the worker are *adopted* as
     the next mirror version without sending the text back;
   - a **job scheduler**: one job at a time; every job carries the document version; newer
     edits supersede queued validation; validation is debounced (immediate below 1 MB,
     ~150–300 ms idle in larger tiers);
   - **cooperative cancellation**: long loops run in time slices (~30 ms or ~4 MB) and yield to
     the worker's event loop, so `cancel` and `edit` messages are processed between slices
     (cancel latency ≤ one slice);
   - **file reading**: the `File` handle is posted to the worker, which streams and decodes it
     with a fatal UTF-8 decoder that keeps a leading byte-order mark (RULE-13, RULE-03),
     validates while reading, and forwards decoded chunks to the main thread;
   - **export**: builds a `Blob` (UTF-8, document line ending) from the mirror for copy and
     download, off the main thread.
3. **Protocol**: a small typed message protocol (discriminated unions, version + job id on
   every message), hand-written — no RPC library. Results for a stale version are dropped.
   Large payloads move as transferable `ArrayBuffer`s or `Blob`s; text chunks move as strings
   of bounded size.
4. **Hard cancel fallback**: if a job ignores cancel for > 1 s (bug), the worker is terminated
   and restarted, re-seeding the mirror from the editor in chunks.

## Alternatives considered
- **`JSON.parse` + `JSON.stringify`** — fastest native path, but lossy (numbers, duplicate
  keys), no error codes or positions per RULE-04 — violates INV-01 and PRN-03.
- **Existing lossless parsers** (`json-bigint`, `lossless-json`, `jsonc-parser`, `@lezer/json`)
  — none gives RULE-04 codes/positions and RULE-05 warnings exactly; most are recursive or
  build object trees (memory ×10 at 100 MB); `jsonc-parser` is lenient by design. Our grammar
  is small; owning it is lower risk than adapting.
- **WebAssembly tokenizer** (e.g. Rust/simdjson-style) — faster, but adds a toolchain, a
  string↔bytes boundary copy for every chunk, and a second language; NFR-03 needs only
  ~10 MB/s and the spike target is ≥ 50 MB/s in plain JS. Revisit only if SP-formatter fails.
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
  mandatory, and the core is benchmarked in isolation (SP-formatter).
- Memory: the mirror duplicates the document (≈ 1× text size plus per-line overhead); the
  budget in `architecture.md` accounts for it; SP-pipeline verifies peak < 1.5 GB.
- Validation of a 100 MB document after an edit takes ~1–2 s; the status shows
  COPY-status.checking meanwhile (F-005.R7, INV-05). Incremental re-validation is an M-3
  optimisation.

<!-- Accepted ADRs are immutable. Write a new ADR to change a decision. -->
