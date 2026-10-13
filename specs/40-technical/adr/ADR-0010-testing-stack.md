---
id: ADR-0010
title: Testing — Vitest, fast-check, JSONTestSuite, Playwright on three engines, axe, Lighthouse
status: accepted
date: 2026-10-13
supersedes: []
---

## Context
- Every acceptance criterion needs a test citing its ID (`spec_lint.py --coverage`).
- NFR-08: conformance with a public JSON test suite and token-identical round trips (INV-01).
- RULE-04/05 positions, RULE-07/08/09 layouts, RULE-06 paths, RULE-12 grouping, RULE-15 undo
  are precise, table-like rules — ideal for unit and property tests.
- NFR-02/03/04/05 are measured budgets; NFR-06 needs automated audit + manual screen reader;
  NFR-07 needs Chromium, Gecko and WebKit, embedded and standalone; NFR-01/NFR-09 need network
  and header assertions with a second origin acting as host.
- The portal (repository `taro-kit`, decision record 0006) already uses Vitest 5, Playwright on
  three engines with a second-origin fixture server, `@axe-core/playwright`, Lighthouse CI
  and a request-recording privacy test. Reusing the same stack keeps one way of working.

## Decision
- **Unit (Vitest 5, Node)** for MOD-Core (tokenizer, validator, formatter, re-indent, path
  formatting, line/column resolution), MOD-Editor state logic (history field, document
  builder), MOD-Tree row model and grouping, MOD-Host message validation, MOD-Copy formatting.
  Test names carry IDs: `F005_AC2 trailing comma at line 2 column 8`.
- **Property-based (fast-check, MIT)** for INV-01 and robustness: random JSON with random
  insignificant whitespace, number spellings, escapes, duplicate keys and deep nesting →
  token sequence of beautify/minify output equals the input's; minify(beautify(x)) =
  minify(x); beautify is idempotent; re-indent changes only leading indentation; validator
  never throws and agrees with `JSON.parse` on validity (differential oracle, except BOM and
  depth > 10,000 which are specified differently); chunk-boundary independence (same result
  for any chunking of the input).
- **Conformance**: JSONTestSuite (MIT) test files vendored at a pinned commit as fixtures:
  all `y_` accepted, all `n_` rejected; each `i_` case has a recorded expectation derived from
  our rules (e.g. invalid UTF-8 → rejected on load per RULE-13; huge numbers → valid with
  `unsafe-number`; lone surrogate escapes → valid).
- **Worker/integration in real browsers**: Vitest browser mode with the Playwright provider for
  the worker protocol (cancellation, version superseding, chunked transfer, Blob export).
- **End-to-end (Playwright)** on `chromium`, `firefox`, `webkit` projects plus a 480 px
  project, against the production build served by `vite preview` with the generated headers.
  A **stub host page** on a second local origin embeds the tool with the portal's real frame
  attributes; a third origin (not allow-listed) checks refusal. One spec per flow (FLOW-01,
  FLOW-02, FLOW-03) and per-feature specs for the remaining criteria. A request recorder
  fails the run on any request after load (NFR-01) and asserts the messages seen by the host
  (F-008.AC6).
- **Accessibility**: `@axe-core/playwright` (MPL-2.0, dev-only exception of ADR-0001) on every
  screen state in both themes; keyboard-only e2e paths; manual screen-reader pass per release.
- **Performance**:
  - Vitest bench for MOD-Core throughput on generated fixtures (10/50/100 MB);
  - a Playwright Chromium perf suite with generated fixtures (formatted, minified,
    wide-array, deep, long-string, CRLF, non-ASCII) measuring operation durations via
    `performance.measure`, frame gaps via a `requestAnimationFrame` probe and long-animation-
    frame entries, input latency, and memory via the DevTools protocol; run nightly and before
    release (too slow for every PR); median of 5 runs must pass;
  - **Lighthouse CI** for NFR-05 with throttling matched to it (10 Mbit/s, 40 ms RTT, cold and
    warm), plus a build-time compressed-size check as a fast PR gate.
- **Static checks**: TypeScript strict, ESLint (+ jsx-a11y, network-API ban, import
  boundaries between modules), Prettier, `python3 tools/spec_lint.py`, license audit.

## Alternatives considered
- **Jest** — slower with ESM/Vite; Vitest shares the build config.
- **Cypress** — weaker WebKit/Gecko story; NFR-07 needs all three engines in one runner.
- **Hand-written conformance cases only** — misses the community's edge cases; JSONTestSuite
  is the de facto public suite named by NFR-08.
- **Running perf suites on every PR** — flaky on shared CI runners; budgets are lab measures.

## Consequences
- Playwright's WebKit is not Safari: clipboard, download and drop behaviour on real Safari
  is checked by hand (SP-iframe, release checklist).
- Large fixtures are generated at test time by a seeded script, never committed.
- `spec_lint.py --coverage tests/` reports any acceptance criterion without a test.

<!-- Accepted ADRs are immutable. Write a new ADR to change a decision. -->
