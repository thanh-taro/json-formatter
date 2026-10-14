# License audit 2 (M-1 release readiness), 2026-10-14
Not legal advice; legal review recommended only for the OFL font notice wording and Feather/Lucide attribution (both look standard).

Inputs: ADR-0001, specs/40-technical/dependencies.md, package.json, pnpm-lock.yaml, dist/ (existing build of 2026-10-14 00:14; source maps used to list bundled modules). `pnpm check:licenses`: PASS (652 packages, 20 shipped; all within allow-lists; no GPL/LGPL/AGPL/NC/ND anywhere in the lockfile; MPL-2.0 x5 and CC-BY-4.0 x1 are build-only named exceptions).

| Shipped item | Version | License | Registry | Status | In dist | In notices |
|---|---|---|---|---|---|---|
| preact | 10.29.8 | MIT | DEP-01 | approved | yes | yes |
| @preact/signals / signals-core | 2.11.2 / 1.14.4 | MIT | DEP-02/03 | approved | yes | yes |
| @codemirror/state, view, commands, language, lang-json | 6.7.6, 6.43.14, 6.11.1, 6.13.1, 6.0.2 | MIT | DEP-04..08 | approved | yes | yes |
| @lezer/common, lr, highlight, json | 1.5.3, 1.4.11, 1.2.5, 1.0.3 | MIT | DEP-09 | approved | yes | yes |
| style-mod, w3c-keyname, @marijn/find-cluster-break | 4.1.4, 2.2.8, 1.0.4 | MIT | DEP-10 | approved | yes (in worker too: find-cluster-break) | yes |
| crelt, @codemirror/streamparser | 1.0.7, 6.0.0 | MIT | DEP-10 | approved | not in bundles (installed only) | yes (over-inclusive, harmless) |
| lucide-static icons (inlined SVG, ISC banner kept in JS) | 1.55.0 | ISC (+ Feather MIT for derived icons) | DEP-11 | approved | yes | yes, ISC and Feather MIT text |
| Manrope woff2 | 5.3.0 | OFL-1.1 | DEP-12 | approved | yes | yes, copyright + OFL text |
| JetBrains Mono woff2 | 5.3.0 | OFL-1.1 | DEP-13 | approved | yes | yes, copyright + OFL text |
| Design tokens | pinned | owner's own work | DEP-14 | approved | CSS | n/a |
| Playwright browsers / lightningcss / axe-core / caniuse-lite | - | BSD/MPL/LGPL/CC-BY | DEP-18,19,26,27 | approved (build/test) | NO (dist has only index.html, _headers, sw.js, assets/, notices, .vite manifest, .assetsignore) | caniuse-lite attributed |

Registry: no candidate/personal-only rows; DEP-36..38 are `removed` and absent from package.json. No unregistered or disallowed shipped package. No images or other asset files in dist/.

## Findings
1. MINOR: notices file is served at /third-party-notices.txt (from public/) but nothing in index.html or src links to it (only tests/specs mention it). Attribution is satisfied by the served file plus in-JS ISC banner, but MIT/OFL notices are not discoverable by users. Propose: add an "About / licenses" link in the UI (or in the portal host) to it.
2. MINOR: ADR-0001 rule 6 says CI scans dist/ for unregistered third-party code/fonts; scripts/check-licenses.mjs checks only the installed set. Propose adding a dist scan (source-map module list vs registry runtime rows, and file-type allow-list).
3. MINOR: lucide-static is listed in both dependencies and devDependencies. Remove the devDependencies entry.
4. MINOR: registry rows DEP-22 (@vitest/browser-playwright) and DEP-33 (wrangler) are not direct package.json entries (lockfile has the former transitively; wrangler absent). Mark DEP-33 `candidate`/note "CI-only, not installed" or add when installed; registry claim "every entry approved or removed" otherwise holds.
5. NOTE: registry table says "four upstream projects"; also lists crelt/streamparser, which are not bundled. Optional cleanup so notices list only shipped packages.
6. NOTE: package.json license UNLICENSED/private is fine for a personal app; no personal-only items in release config.

## Verdict
PASS, no blockers. Four minor fixes proposed above; none gate release.
