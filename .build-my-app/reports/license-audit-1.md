# License audit 1 (2026-10-13)

Policy: ADR-0001 (status still `proposed`; approvals below assume it is accepted). Not legal advice; items marked clarify may need legal review. Sources: npm registry `https://registry.npmjs.org/<pkg>/latest` (license field and dependencies), GitHub LICENSE files. Registry not edited.

| DEP | Name | License | Verified source | Verdict |
|---|---|---|---|---|
| 01 | preact | MIT | npm preact (10.29.0 and latest 11.0.1 both MIT, zero deps) | approve |
| 02 | @preact/signals | MIT | npm; only dep is signals-core | approve |
| 03 | @preact/signals-core | MIT | npm 1.14.4, zero deps | approve |
| 04 | @codemirror/state | MIT | npm 6.7.6; dep @marijn/find-cluster-break | approve |
| 05 | @codemirror/view | MIT | npm 6.43.14; deps crelt, style-mod, w3c-keyname, state | approve |
| 06 | @codemirror/commands | MIT | npm 6.11.1; deps state, view, language, lezer/common | approve |
| 07 | @codemirror/language | MIT | npm 6.13.1; deps lezer/*, style-mod, streamparser | approve |
| 08 | @codemirror/lang-json | MIT | npm 6.0.2; deps lezer/json, language | approve |
| 09 | @lezer/common, lr, highlight, json | MIT | npm (1.5.3, 1.4.11, 1.2.5, 1.0.3) | approve |
| 10 | style-mod, crelt, w3c-keyname, @marijn/find-cluster-break, @codemirror/streamparser | MIT | npm; closed transitive set, no other runtime deps found | approve |
| 11 | lucide-static | ISC (+ MIT for Feather-derived icons) | npm ISC; github.com/lucide-icons/lucide/blob/main/LICENSE lists ~120 Feather-derived icons under MIT (Cole Bemis) | clarify: notices file must carry both the ISC and Feather MIT texts if any listed icon is used |
| 12 | @fontsource-variable/manrope | OFL-1.1 | npm; fontsource font-files LICENSE (Manrope Project Authors) | approve; ship OFL text and copyright, do not sell font alone, respect Reserved Font Names if subsetting/renaming |
| 13 | @fontsource-variable/jetbrains-mono | OFL-1.1 | npm; github.com/JetBrains/JetBrainsMono/blob/master/OFL.txt | approve (same OFL obligations) |
| 14 | Portal design tokens | Owner's own work | no external source | clarify: add an explicit licence or ownership note; confirm no third-party palette content |
| 15 | typescript | Apache-2.0 | npm (latest 7.0.2; ~6.0 range exists) | approve |
| 16 | vite | MIT | npm 8.3.4; deps postcss, rolldown, picomatch, tinyglobby, lightningcss | approve |
| 17 | @preact/preset-vite | MIT | npm 2.10.6 | approve |
| 18 | lightningcss | MPL-2.0 | npm 1.33.0; direct vite dep | approve (build-only exception); confirm output not shipped as lightningcss code |
| 19 | caniuse-lite | CC-BY-4.0 | npm 1.0.30001815 | clarify: build-only data is not shipped, so notices attribution may be unnecessary; if kept, state why |
| 20 | style-dictionary | Apache-2.0 | npm 5.6.1 | approve |
| 21 | vitest | MIT | npm 5.0.4 | approve |
| 22 | @vitest/browser-playwright | MIT | npm 5.0.4 | approve |
| 23 | fast-check | MIT | npm 4.10.2 | approve |
| 24 | JSONTestSuite | MIT | github.com/nst/JSONTestSuite/blob/master/LICENSE (c) 2016 Nicolas Seriot | approve; vendored copy must keep LICENSE file; fixtures must not enter dist/ |
| 25 | @playwright/test | Apache-2.0 | npm 1.64.0 | approve |
| 26 | Playwright browsers | BSD / MPL-2.0 / LGPL-2.1 | ADR-0001 facts | clarify: allowed only as unmodified test-only binaries; CI must not cache or upload them into any release artifact or image |
| 27 | @axe-core/playwright, axe-core | MPL-2.0 | npm 4.13.0 / axe-core 4.14.0 | approve (dev-only exception); must never reach dist/ |
| 28 | @lhci/cli | Apache-2.0 | npm 0.15.1 | approve |
| 29 | eslint | MIT | npm 10.12.0 | approve |
| 30 | typescript-eslint | MIT | npm 8.71.2 | approve |
| 31 | eslint-plugin-jsx-a11y | MIT | npm 6.10.2 | approve |
| 32 | prettier | MIT | npm 3.9.10 | approve |
| 33 | wrangler | MIT OR Apache-2.0 | npm 4.149.0 | approve |
| 34 | GitHub Actions (checkout, setup-node, pnpm/action-setup, cache) | MIT | not fetched from repos in this audit | clarify: confirm each repo LICENSE |
| 35 | pnpm | MIT | npm (latest 12.11.2; registry says 11.x) | approve |
| 36 | monaco-editor | MIT | npm 0.57.0; deps marked, dompurify (dompurify is MPL-2.0 OR Apache-2.0, not verified here) | reject: rejected by SP-editor, spike-only |
| 37 | @tanstack/virtual-core | MIT | npm 3.19.2 | reject (removed, unused) |
| 38 | comlink | Apache-2.0 | npm 4.4.2 | reject (removed, unused) |

## Findings
- No GPL/AGPL/LGPL in shipped code. LGPL-2.1 (WebKit) and MPL-2.0 (lightningcss, axe-core, Firefox) appear only in build/dev rows, as policy allows. No NC/ND items found.
- Runtime closure of CodeMirror 6 and Preact matches DEP-01..10 exactly. All MIT.
- Monaco appears in two spike package.json files (.claude/worktrees/agent-aa98.../spikes/editor and agent-a716.../spikes/editor). Keep these out of the product lockfile and release config. No release config exists yet to check for personal-only items; no `personal-only` status is used.
- Status: every row is `candidate`; none is `approved`. ADR-0001 itself is `proposed`.

## Proposed status changes
- Approve after ADR-0001 is accepted: DEP-01..10, 12, 13, 15..18, 20..25, 27..33, 35.
- Hold pending clarification: DEP-11, 14, 19, 26, 34.
- DEP-36 `candidate (spike only)` to `rejected`. Its kind should be dev/spike, not runtime. DEP-37 and DEP-38 stay `removed`.
- Unpinned sources (the license-checked versions are the latest as of today): the registry says preact ~10.29 though latest is 11.0.1; confirm 10.x intent.
- Notes line "four upstream projects" omits the Lucide and Feather MIT notice and the OFL texts. Update accordingly.
