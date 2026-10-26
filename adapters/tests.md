# Tests adapter

How tests consume the specs (ADR-0010). Every acceptance criterion needs a test whose **title
starts with its ID**; `python3 tools/spec_lint.py --coverage tests` lists criteria without one.

## Naming convention
- Title = `<spec ID> <behaviour in plain words>`. Use the dotted form exactly as in the spec:
  `F-002.AC1 beautifies a minified object with 2-space indent`.
  The linter also accepts the compact form `F002_AC1`, but new tests use the dotted form.
- Rules, invariants and NFRs use their IDs the same way: `RULE-04 trailing comma reported at
  line 2 column 8`, `INV-01 minify(beautify(x)) keeps every token`, `NFR-01 no requests after load`.
- One criterion per test where practical; a test covering several lists each ID:
  `F-001.AC2 F-001.AC3 opens a dropped file and replaces the document`.
- Parametrised variants append the parameter in parentheses: `… (light)`, `… (webkit)` is
  added by Playwright automatically.
- Harness checks that verify no spec item start with `smoke:`.
- In code under test, cite what it implements: `// Implements: F-003.R2`.

## Layout
| Folder | Runner | What |
|---|---|---|
| `tests/unit/` | Vitest (Node) | MOD-Core, MOD-Copy, MOD-Host message checks, MOD-Tree row model, generated code |
| `tests/property/` | Vitest + fast-check | INV-01 round trips, robustness, chunk-boundary independence |
| `tests/conformance/` | Vitest | NFR-08 against JSONTestSuite (skipped when the corpus is absent) |
| `tests/e2e/` | Playwright | flows and features in Chromium and WebKit, axe audits |
| `tests/support/` | — | shared helpers (corpus loader, Node API typings) |
| `tests/fixtures/` | — | fetched or generated fixtures, gitignored |

## Fixtures
- JSONTestSuite (DEP-24) is fetched at a pinned commit by `pnpm fixtures:jsontestsuite` into
  `tests/fixtures/JSONTestSuite/` (gitignored). `y_` → accept, `n_` → reject, `i_` →
  implementation-defined, with the expectation recorded per case when MOD-Core lands.
- Large fixtures (10–100 MB) are generated at test time by a seeded script into
  `tests/fixtures/generated/`, never committed.

## End-to-end setup
- Runs against the production build: `pnpm build`, then `pnpm test:e2e`
  (`--project=chromium|webkit`). `tests/e2e/server.mjs` starts:
  - tool `http://localhost:4400` — `dist/` with `dist/_headers` applied with Cloudflare semantics
    (rules merge, `! Name` detaches); `frame-ancestors` is replaced by the stub host origin;
  - stub host `http://localhost:4401/host.html` — embeds the tool with the portal's frame
    attributes (`sandbox`, `allow="clipboard-write"`, `referrerpolicy`), query `theme`, `w`, `h`,
    records messages in `window.__host.received`, `window.setTheme(value)` posts `taro:theme`;
  - unlisted origin `http://localhost:4402` — same pages, not allow-listed (F-008.AC8);
  - admin `http://localhost:4406` — `/log` (server-side request log for NFR-01), `/reset`.
- `tests/e2e/fixtures.ts` `instrument(page)` records CSP violations (`window.__csp`) and the
  theme/background of the first animation frame (`window.__firstFrame`) in every frame.
- Accessibility: `@axe-core/playwright` with tags `wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa`
  on every screen state in both themes; zero violations expected.
- There is no CI (ADR-0015): every suite runs locally, and the full e2e suite on Chromium and
  WebKit runs before every release. Firefox (Gecko) is not automated — Playwright's Firefox does
  not launch on the owner's machine from Claude Code — and is checked by hand on the release
  candidate (NFR-07).

## Performance
- `pnpm check:size` — compressed critical-path gate on every build (NFR-05).
- `pnpm lhci` — Lighthouse CI on `dist/` with NFR-05 throttling (40 ms RTT, 10 Mbit/s):
  initial JS ≤ 250 KB, interactive ≤ 1.5 s, accessibility score 1. Needs a Chrome; set
  `CHROME_PATH` to Playwright's Chromium if none is installed.
- The perf suite (Playwright + generated fixtures, median of 5) runs nightly, not per PR.
