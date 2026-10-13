# JSON Formatter (taro-kit tools)

A private, lossless JSON formatter for developers, embedded via iframe in the taro-kit tools
portal: format, validate with precise errors, and explore as a tree — nothing leaves the browser.

Specs are the source of truth: start with `specs/README.md`. Architecture:
`specs/40-technical/architecture.md`.

## Develop
Requirements: Node 24 (`.nvmrc`), pnpm 11 (`corepack enable` picks the version from
`package.json`), Python 3 for the spec tools.

| Command | What it does |
|---|---|
| `pnpm install` | Install dependencies (lockfile committed; lifecycle scripts blocked) |
| `pnpm dev` | Regenerate code, then start the dev server at http://localhost:5173 (no CSP in dev) |
| `pnpm gen` / `pnpm gen:check` | Regenerate tokens, copy, notices and `_headers` / fail if stale (`adapters/codegen.md`) |
| `pnpm build` | Codegen, typecheck, production build into `dist/` |
| `pnpm preview` | Serve `dist/` (without the production headers) |
| `pnpm typecheck` | TypeScript, app and e2e projects |
| `pnpm lint` / `pnpm format` | ESLint + Prettier check / write |
| `pnpm test` | Vitest: unit, property and conformance tests |
| `pnpm fixtures:jsontestsuite` | Fetch the JSONTestSuite corpus into `tests/fixtures/` (gitignored) |
| `pnpm test:e2e` | Playwright on Chromium, Firefox and WebKit against `dist/` (run `pnpm build` first) |
| `pnpm test:e2e:smoke` | Playwright on Chromium only |
| `pnpm check:size` | Compressed critical-path budget (NFR-05) |
| `pnpm check:licenses` | License audit against the ADR-0001 allow-lists |
| `pnpm lhci` | Lighthouse CI with NFR-05 throttling (needs Chrome or `CHROME_PATH`) |
| `python3 tools/spec_lint.py` | Spec lint; add `--coverage tests` for criteria without tests |

First run of the browser tests: `pnpm exec playwright install chromium firefox webkit`.
Test naming and the e2e setup are described in `adapters/tests.md`.

Deploying for other host origins: `HOST_ORIGINS="https://a.example https://b.example" pnpm build`
(sets `frame-ancestors` and the compiled-in message allow-list).
