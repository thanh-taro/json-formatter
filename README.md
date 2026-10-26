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
| `pnpm dev` | Regenerate code, then start the dev server at http://localhost:5180 (no CSP in dev) |
| `pnpm gen` / `pnpm gen:check` | Regenerate tokens, copy, notices and `_headers` / fail if stale (`adapters/codegen.md`) |
| `pnpm build` | Codegen, typecheck, production build into `dist/` |
| `pnpm preview` | Serve `dist/` (without the production headers) |
| `pnpm typecheck` | TypeScript, app and e2e projects |
| `pnpm lint` / `pnpm format` | ESLint + Prettier check / write |
| `pnpm test` | Vitest: unit, property and conformance tests |
| `pnpm fixtures:jsontestsuite` | Fetch the JSONTestSuite corpus into `tests/fixtures/` (gitignored) |
| `pnpm test:e2e` | Playwright on Chromium and WebKit against `dist/` (run `pnpm build` first) |
| `pnpm test:e2e:smoke` | Playwright on Chromium only |
| `pnpm check:size` | Compressed critical-path budget (NFR-05) |
| `pnpm check:licenses` | License audit against the ADR-0001 allow-lists |
| `pnpm lhci` | Lighthouse CI with NFR-05 throttling (needs Chrome or `CHROME_PATH`) |
| `python3 tools/spec_lint.py` | Spec lint; add `--coverage tests` for criteria without tests |

First run of the browser tests: `pnpm exec playwright install chromium webkit`.
Firefox is not in the automated suite (ADR-0015); it is checked by hand before a release.
Test naming and the e2e setup are described in `adapters/tests.md`.

Deploying for other host origins: `HOST_ORIGINS="https://a.example https://b.example" pnpm build`
(sets `frame-ancestors` and the compiled-in message allow-list).

## Release and deployment
Hosting is Cloudflare Workers static assets at https://json-formatter.tarokit.app (ADR-0009), deployed by hand
from your machine only; there are no CI workflows and nothing deploys automatically. Run every check, build
with `HOST_ORIGINS=https://tarokit.app`, upload `dist/` with `pnpm exec wrangler deploy`, then run the smoke test.
Source maps are built hidden and never uploaded (`public/.assetsignore`). Account, DNS and secret setup is
owner work: see `.build-my-app/reports/release-checklist.md`.

| Command | What it does |
|---|---|
| `pnpm smoke:prod <url>` | Post-deploy check of headers, `/sw.js` exception, no source maps, notices file, and zero requests after load in headless Chromium |
| `pnpm exec wrangler dev --port 8787` | Serve `dist/` locally with the real `_headers` handling; then `pnpm smoke:prod http://127.0.0.1:8787` |
| `SW_KILL=1 pnpm build` | Build the offline kill switch (recovery only, see the checklist) |

## Privacy
**Privacy.** JSON Formatter runs entirely in your browser. Your JSON is never uploaded, logged, or stored,
and the tool sends no analytics. It has no cookies, no accounts and no third-party code. Its content
security policy forbids it from making network connections, so documents you paste, open or drop stay in
the page's memory and are discarded when you close it.

To work offline, the browser keeps a copy of the tool's own program files (never your data). It may
re-check those files when you open the tool. When embedded in the taro-kit portal, the tool only tells the
portal that it is ready and receives the light or dark theme. It never shares your document. Copy writes to
your clipboard only when you press Copy, and downloads are created on your device.

One caveat outside our control: browser extensions and your browser's own features, such as automatic page
translation, can see page content. The tool marks document text as "do not translate". If you handle
secrets, use a browser profile without untrusted extensions.

Source: `.build-my-app/reports/qa/privacy-declaration.md`. *Needs review by the owner before publishing
(the owner is the data controller; contact details for privacy questions are not yet stated here).*

## Terms
No terms of service are provided: this is a free personal tool with no accounts, payments or user data. It
is offered as is, without warranty. *Needs review by the owner*: confirm this is enough for the jurisdiction
you operate in. Third-party licences are in `/third-party-notices.txt`.

## License
Copyright (c) 2026 Thanh Nguyen Tri. The source is published under the
[PolyForm Strict License 1.0.0](LICENSE): you may read it and use it for personal, noncommercial purposes.
You may not use it commercially, redistribute it, or publish modified versions or new works based on it.
For any other use, ask the author.

