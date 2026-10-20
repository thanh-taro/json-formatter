# Dependencies & assets

Policy: ADR-0001 (same allow-lists and exceptions as the portal's licensing policy). Every
direct dependency, every transitive **runtime** dependency, and every asset pack is registered
here before it enters the lockfile. Versions as published on the registry on 2026-10-13.

Kinds: **runtime** = shipped to the browser (main bundle or worker); **asset** = shipped
non-code file; **unbundled** = production transitive installed with a runtime package but
removed by tree-shaking (registered so the license audit covers it; the `dist/` scan fails if it
ever ships, and it is not listed in the notices); **build** / **dev** / **ci** = never shipped. Status: `candidate` → `approved`
→ `removed`.

## Runtime (shipped)
| ID | Name | Version range | License | Kind | Purpose | Status | Decided by |
|---|---|---|---|---|---|---|---|
| **DEP-01** | preact | ~10.29 (10.x, like the portal) | MIT | runtime | UI shell rendering | approved | ADR-0002 |
| **DEP-02** | @preact/signals | ^2.11 | MIT | runtime | App state, fine-grained status updates | approved | ADR-0002 |
| **DEP-03** | @preact/signals-core | transitive of DEP-02 (^1.14) | MIT | runtime | Signals runtime | approved | ADR-0002 |
| **DEP-04** | @codemirror/state | ^6.7 | MIT | runtime (main + worker) | Document `Text`, change sets, editor state; change-set decoding for the worker's compact mirror | approved | ADR-0004, ADR-0005 |
| **DEP-05** | @codemirror/view | ^6.43 | MIT | runtime | Virtualized editor view, decorations, line gaps for long lines | approved | ADR-0004 |
| **DEP-06** | @codemirror/commands | ^6.11 | MIT | runtime | Standard editing keymaps (its history extension is not used) | approved | ADR-0004 |
| **DEP-07** | @codemirror/language | ^6.13 | MIT | runtime | Highlighting and bracket matching (normal tier only) | approved | ADR-0004 |
| **DEP-08** | @codemirror/lang-json | ^6.0.2 | MIT | runtime | JSON syntax tree for highlighting (normal tier only) | approved | ADR-0004 |
| **DEP-09** | @lezer/common, @lezer/lr, @lezer/highlight, @lezer/json | transitive (^1.x) | MIT | runtime | Incremental parser used by DEP-07/DEP-08 | approved | ADR-0004 |
| **DEP-10** | style-mod, w3c-keyname, @marijn/find-cluster-break | transitive | MIT | runtime (find-cluster-break also in the worker) | Editor internals (constructable stylesheets, key names, grapheme clusters) | approved | ADR-0004 |
| **DEP-39** | crelt, @codemirror/streamparser | transitive of DEP-05 / DEP-07 | MIT | unbundled | Installed with CodeMirror; no code path the tool uses imports them, so they are not in `dist/` | approved | ADR-0004 |

## Assets (shipped)
| ID | Name | Version range | License | Kind | Purpose | Status | Decided by |
|---|---|---|---|---|---|---|---|
| **DEP-11** | lucide-static | ^1.55 | ISC | asset | Icons, only used SVGs inlined at build (same set as the portal) | approved | ADR-0011 |
| **DEP-12** | @fontsource-variable/manrope | ^5 | OFL-1.1 | asset | UI face, self-hosted Latin subset (portal style) | approved | ADR-0011 |
| **DEP-13** | @fontsource-variable/jetbrains-mono | ^5 | OFL-1.1 | asset | Editor/tree mono face, self-hosted Latin subset | approved | ADR-0011 |
| **DEP-14** | Portal design tokens ("Night Market", `tokens.json`) | copy pinned to a portal commit | Owner's own work | asset (source) | Colours, spacing, radii, motion shared with the portal | approved (owner's own work, reused with permission, D-026) | ADR-0011 |

## Build, dev, test, CI (never shipped)
| ID | Name | Version range | License | Kind | Purpose | Status | Decided by |
|---|---|---|---|---|---|---|---|
| **DEP-15** | typescript | ~6.0 (pinned until lint tooling supports 7) | Apache-2.0 | dev | Type checking | approved | ADR-0003 |
| **DEP-16** | vite | ^8.3 | MIT | build | Dev server, bundling (Rolldown), worker chunks | approved | ADR-0003 |
| **DEP-17** | @preact/preset-vite | ^2.10 | MIT | build | Preact JSX/HMR for Vite (pulls Babel, MIT) | approved | ADR-0003 |
| **DEP-18** | lightningcss (via vite) | transitive | MPL-2.0 (build-only exception) | build | CSS transforms in Vite 8 | approved | ADR-0001 |
| **DEP-19** | caniuse-lite (via browserslist) | transitive | CC-BY-4.0 (attribution in notices) | build | Browser target data | approved | ADR-0001 |
| **DEP-20** | style-dictionary | ~5.5.5 (5.6 too new on 2026-10-13; bump later) | Apache-2.0 | dev | Compile DTCG tokens to CSS variables (same as portal) | approved | ADR-0011 |
| **DEP-21** | vitest | ^5.0 | MIT | dev | Unit, integration and bench | approved | ADR-0010 |
| **DEP-22** | @vitest/browser-playwright | ^5.0 | MIT | dev | Worker/integration tests in real browsers | removed (not needed: the worker protocol is tested in Node against the worker engine and in real browsers through the Playwright e2e suite; not installed) | ADR-0010 |
| **DEP-23** | fast-check | ^4.10 | MIT | dev | Property-based tests (INV-01, robustness) | approved | ADR-0010 |
| **DEP-24** | JSONTestSuite (nst/JSONTestSuite test files) | pinned commit, vendored | MIT | dev (fixtures) | Conformance corpus for NFR-08 | approved | ADR-0010 |
| **DEP-25** | @playwright/test | ~1.63.0 (1.64 too new on 2026-10-13; bump later) | Apache-2.0 | dev | E2E on three engines, perf and memory measurements | approved | ADR-0010 |
| **DEP-26** | Playwright browser binaries (Chromium, Firefox, WebKit) | via DEP-25 | Chromium BSD; Firefox MPL-2.0; WebKit LGPL-2.1 (test-only exception) | dev | E2E engines | approved | ADR-0001, ADR-0010 |
| **DEP-27** | @axe-core/playwright (pulls axe-core) | ^4.13 | MPL-2.0 (dev-only exception) | dev | Automated accessibility audit | approved | ADR-0001, ADR-0010 |
| **DEP-28** | @lhci/cli | ^0.15 | Apache-2.0 | dev | Startup budgets for NFR-05 | approved | ADR-0010 |
| **DEP-29** | eslint | ^10 | MIT | dev | Linting incl. network-API ban and module boundaries | approved | ADR-0003 |
| **DEP-30** | typescript-eslint | ^8.71 | MIT | dev | TypeScript lint rules | approved | ADR-0003 |
| **DEP-31** | eslint-plugin-jsx-a11y | ^6.10 | MIT | dev | Accessibility lint for TSX (peer range lists eslint ≤ 9; works with 10, re-check on upgrade) | approved | ADR-0003 |
| **DEP-32** | prettier | ^3.9 | MIT | dev | Formatting | approved | ADR-0003 |
| **DEP-33** | wrangler | 4.149.0 (pinned; `^4` range, newest allowed by `minimumReleaseAge`) | MIT OR Apache-2.0 | ci | Deploy static assets (`wrangler deploy`, run by hand locally); needs `overrides: sharp: '-'` (miniflare's local-dev image dependency, LGPL-3.0 libvips, never loaded by a deploy) and `allowBuilds` esbuild/workerd = false in `pnpm-workspace.yaml` | approved, installed (devDependency) | ADR-0009 |
| **DEP-34** | GitHub Actions: actions/checkout, actions/setup-node, pnpm/action-setup, actions/cache, actions/upload-artifact (v7.0.2), actions/download-artifact (v8.0.2) | pinned by commit SHA | MIT | ci | CI and publish workflows | removed (no GitHub workflows: checks and deploys run locally, by hand) | ADR-0009 |
| **DEP-35** | pnpm | 11.x | MIT | dev | Package manager, license report | approved | ADR-0003 |

## Evaluated, not adopted
| ID | Name | Version range | License | Kind | Purpose | Status | Decided by |
|---|---|---|---|---|---|---|---|
| **DEP-36** | monaco-editor | 0.57 | MIT | dev (spike only) | SP-editor comparison only; rejected (ADR-0004), never shipped | removed (rejected) | ADR-0004 |
| **DEP-37** | @tanstack/virtual-core | ^3.19 | MIT | runtime | Alternative virtualizer for the tree | removed (not needed) | ADR-0007 |
| **DEP-38** | comlink | ^4.4 | Apache-2.0 | runtime | Alternative worker RPC | removed (not needed) | ADR-0005 |

## Notes
- Shipped runtime code comes from Preact, signals, CodeMirror, Lezer and the CodeMirror
  helpers of DEP-10, all MIT; `/third-party-notices.txt` lists exactly the shipped packages
  (runtime and asset rows) plus fonts (OFL text) and icons (ISC). `pnpm check:licenses` scans
  the built `dist/` (source maps, license banners, Vite manifest) and fails when the shipped
  set and the notices differ, or when anything ships that is not a runtime/asset row.
- Build-only transitive packages beyond those listed are covered by the CI license audit
  (ADR-0001); only exceptions and shipped code are listed individually.
