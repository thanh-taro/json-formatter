# Release checklist: JSON Formatter v1.0.0 (M-1)

Channel: Cloudflare Workers static assets, deployed by GitHub Actions (ADR-0009; same platform as the
portal, portal ADR-0007). Address: https://json-formatter.tarokit.app (D-009). Portal origin that may
frame the tool: https://tarokit.app (`HOST_ORIGINS`). Prepared 2026-10-14.

**Owner key.** Claude = done by files in the repo (committed on `main`). USER = account, signing, payment,
secret or submission step that Claude never performs; each has exact steps below. Nothing has been pushed,
deployed or published, and there is no git remote yet.

## 0. Status at a glance

| # | Item | Owner | Status |
|---|---|---|---|
| 1 | Deploy workflow `.github/workflows/deploy.yml` | Claude | done, **never run on GitHub** (first run is step D) |
| 2 | `wrangler.jsonc` + `public/.assetsignore` (no `*.map`, no `.vite/` uploaded; `/sw.js` header exception from generated `_headers`) | Claude | done, verified with `wrangler dev` |
| 3 | wrangler 4.149.0 as pinned devDependency (DEP-33), registry updated | Claude | done |
| 4 | `pnpm smoke:prod <url>` (QA-026) wired as last deploy step | Claude | done, passes on local `wrangler dev` |
| 5 | Version 1.0.0, `CHANGELOG.md`, release notes | Claude | done |
| 6 | Privacy and terms text (README) | Claude | drafted, **needs review by the owner** |
| 7 | Portal catalog unhide change | Claude prepares, USER applies | section G |
| 8 | GitHub repo, push | USER | section A |
| 9 | Cloudflare account, zone, DNS, token, secrets | USER | sections B, C |
| 10 | First deploy, smoke, manual QA | USER | sections D, E, F |
| 11 | Unhide in portal, tag v1.0.0 | USER | sections G, H |

## 1. Deploy assets (exact sizes, build of 2026-10-14, `HOST_ORIGINS=https://tarokit.app`)

A static web app has no store icons or screenshots. What ships is `dist/`; these 10 files are uploaded
(660,430 bytes in total; Cloudflare limits are 20,000 files and 25 MiB per file).

| File | Bytes | Gzip bytes | Note |
|---|---:|---:|---|
| `/index.html` | 1,139 | 562 | `Cache-Control: no-cache` |
| `/assets/index-Cf0-BsJf.js` | 430,811 | 138,284 | main bundle, immutable |
| `/assets/index-UbcRPOw5.js` | 72,351 | 23,465 | worker, immutable |
| `/assets/tree-CtkHfttQ.js` | 21,224 | 7,850 | lazy tree view, immutable |
| `/assets/index-CYw35GhS.css` | 27,563 | 4,981 | |
| `/assets/tree-Ch7cAHRK.css` | 7,314 | 1,556 | |
| `/assets/manrope-latin-wght-normal-DHIcAJRg.woff2` | 24,836 | n/a | self-hosted font |
| `/assets/jetbrains-mono-latin-wght-normal-B9CIFXIH.woff2` | 40,404 | n/a | self-hosted font |
| `/sw.js` | 2,821 | 1,292 | offline worker, own CSP, `max-age=86400` |
| `/third-party-notices.txt` | 31,967 | | linked from the privacy details |

Used by wrangler, not uploaded: `_headers` (1,456 bytes, applied as response headers), `.assetsignore` (254).
Built but excluded from the upload: 4 source maps (`index-Cf0-BsJf.js.map` 1,977,688; `index-UbcRPOw5.js.map` 382,847;
`tree-CtkHfttQ.js.map` 89,964; `sw.js.map` 17,131) and `.vite/manifest.json`. Critical path 176.9 KB of the 250 KB budget
(`pnpm check:size`). Hash names change with every code change; recompute with `ls -l dist dist/assets`.
Not shipped (not needed for this channel): favicon, social preview image, web app manifest (CSP `manifest-src 'none'`).
Optional polish: a favicon would stop the browser's 404 for `/favicon.ico`; adding one needs a new asset (register it, DEP policy).

## 2. Metadata drafts (portal catalog and repository)

Source: `content/tools/json-formatter.yaml` in taro-kit (existing, hidden), specs F-001..F-011, `qa/privacy-declaration.md`.

| Field | Value |
|---|---|
| Name | JSON Formatter |
| Address | https://json-formatter.tarokit.app/ |
| Summary (catalog, as committed, 95 chars) | Format, minify and validate JSON with exact error positions — nothing leaves your browser. |
| Privacy blurb (<= 160 chars) | Runs entirely in your browser. Your JSON is never uploaded, logged, or stored; no analytics, no cookies. Works offline after one visit. |
| Category / tags | developer / json, formatter, validator |
| Open mode | embedded (also works standalone) |
| Permissions | clipboard-write, downloads, file-pick |
| Offline | true |
| Long description (draft) | A private, lossless JSON formatter for developers. Paste or open JSON, beautify, minify or re-indent it without changing a single value, see the first error with its line, column and a fix hint, explore it as a tree, find text, and copy or download the result. Nothing leaves your browser; it works offline after one visit. |
| Page title | JSON Formatter (already in `index.html`) |
| Version | 1.0.0 |
| Release notes | `.build-my-app/reports/release-notes-v1.0.0.md` |

Privacy declaration for the catalog (from `qa/privacy-declaration.md` section 1): data not collected;
`collects-data: false`, `analytics: false`, `third-party-requests: false`, `offline-capable: true`,
`permissions: [clipboard-write]`, storage: offline cache of app files only. Conditions to re-check before
each release: dependency changes (network, storage, telemetry), and that production headers are served as
generated (the smoke test confirms this).

## 3. Policies (all drafts: needs review by the owner)

- **Privacy note**: in `README.md`, section "Privacy" (from `qa/privacy-declaration.md` section 2). Needs review
  by the owner: add a contact for privacy questions if you want one; confirm the wording is acceptable where you operate.
- **Terms of service: not needed.** This is a free personal tool: no accounts, no payments, no user data
  stored. The README "Terms" section says this and states "as is, without warranty". Needs review by the
  owner: this is not legal advice, so confirm for your jurisdiction.
- **Licence of the source**: `package.json` says `UNLICENSED` (all rights reserved). Needs review by the owner
  before making the repository public: pick a licence or keep it private.
- **Cookie banner / consent**: not needed, the tool sets no cookies and stores nothing (verified by the smoke test: no `Set-Cookie`).
- Third-party licences: `/third-party-notices.txt` (generated, 18 shipped packages, all approved).

## 4. Versioning
`package.json` is 1.0.0. Semantic versioning: patch for fixes, minor for features (M-2 will be 1.1.0), major for breaking changes
to the host contract. Release tag format `vMAJOR.MINOR.PATCH`; the Deploy workflow refuses a tag that does not equal
`v` + the `package.json` version or that is not on `main`. Bump `package.json`, `CHANGELOG.md` and the release notes together.

## 5. What Claude verified locally (2026-10-14)
Build with `HOST_ORIGINS=https://tarokit.app`; `pnpm gen:check`, `spec_lint` (0 errors), typecheck, lint, 397 unit/property/conformance tests,
`check:licenses` (wrangler installed; passes), `check:size` (176.9 of 250 KB), Chromium e2e (218 passed, 0 failed);
`wrangler deploy --dry-run` compiles the config; `wrangler dev` (real workerd) served `dist/`: `.map`, `_headers`,
`.assetsignore` and `.vite/manifest.json` answer 404, `/sw.js` carries only its own CSP and `max-age=86400`, every other path the page CSP,
HSTS, Permissions-Policy, nosniff; `pnpm smoke:prod http://127.0.0.1:8799` passed all 10 checks (HSTS is not asserted over http);
the same script against plain `pnpm preview` (no headers, maps present) fails as it should. Not verified (needs your accounts):
the workflow on GitHub, Cloudflare authentication, custom-domain creation, Cloudflare's real header merge, the real HTTPS site.

## A. GitHub repository and first push (USER)
1. Decide visibility. Private is the safe default (the source is `UNLICENSED`; `.build-my-app/` holds internal reports).
   Private repos get 2,000 free Actions minutes per month; the deploy workflow's check job (all CI checks, Chromium e2e only) takes roughly 10 to 15 minutes, plus the deploy job.
2. Create an empty repository (no README, no licence, no .gitignore): GitHub, New repository, name `json-formatter`, owner of your choice.
   Or with the CLI after `gh auth login`: `gh repo create <OWNER>/json-formatter --private` (do not use `--source` or `--push`).
3. Every commit carries the author email `adamnguyen.itdn@gmail.com` (history rewritten on 2026-10-14, before the first push; the repository's `user.email` is set to it). In a public repository that email becomes public.
4. In the project folder:
   ```
   cd /Users/er_lap_mam3_016/Documents/personals/taro-kit-tools/developer-tools/json-formatter
   git status            # must be clean on main
   git remote add origin git@github.com:<OWNER>/json-formatter.git
   git push -u origin main
   ```
5. Repository, Settings, Actions, General: Actions enabled; "Workflow permissions" = read repository contents; optionally "Require actions to be pinned to a full-length commit SHA".
6. Settings, Branches: protect `main` (require the `CI / check` status, block force pushes). This is what makes "tag on main" meaningful.
7. Open the Actions tab and wait for the first `CI` run on `main`. It must be green before you continue. It is the first time the checks run outside this machine (Linux, `.nvmrc` Node 24). If it fails, send the log to Claude.

## B. Cloudflare account, zone and project (USER)
1. Account: sign in at https://dash.cloudflare.com (create an account if you have none; the Free plan is enough; no payment method is needed). Enable two-factor authentication.
2. Domain: confirm you own `tarokit.app` (portal decision: apex and tool subdomains live in one Cloudflare DNS zone, portal ADR-0007) and that it is on this account:
   Websites, `tarokit.app`, status "Active". If it is not registered or not on Cloudflare yet, that is a payment and DNS step that only you can do (Domain Registration, Register, or add the site and change the nameservers at the registrar). Confirm before proceeding: the Claude agents could not verify ownership.
3. Zone hygiene (portal ADR-0007, needed for NFR-05, the smoke test checks the effect): in the `tarokit.app` zone turn off Web Analytics auto-injection (Analytics and Logs, Web Analytics), Email Address Obfuscation (Scrape Shield), Rocket Loader and any HTML-rewriting Speed features (Speed, Optimization), Zaraz, Bot Fight Mode (Security, Bots). Do not enable HSTS in the dashboard (SSL/TLS, Edge Certificates): the tool sends its own `Strict-Transport-Security` header, and two would be joined.
4. No project to create by hand: the first `wrangler deploy` creates the Worker `json-formatter` (assets only) and attaches the custom domain `json-formatter.tarokit.app` (declared in `wrangler.jsonc` `routes`), creating its DNS record and certificate automatically. Make sure no DNS record named `json-formatter` exists in the zone (DNS, Records), otherwise delete it first, or the domain attach fails.
5. Keep Cloudflare's own Git integration off (do not connect the repository in Workers and Pages): the GitHub workflow gates publishing (ADR-0009).
6. Copy your Account ID: dash.cloudflare.com, Workers and Pages, right sidebar "Account ID" (also the long hex string in the dashboard URL after the domain).
7. If you do not use `tarokit.app` for the tool, edit the `routes` pattern in `wrangler.jsonc`, the `SITE_URL` in `deploy.yml`, and `HOST_ORIGINS`/`SMOKE_FRAME_ANCESTORS`, and tell Claude to redo the checks.

## C. API token and GitHub secrets (USER)
1. Cloudflare, My Profile, API Tokens, Create Token, "Create Custom Token". Name it `github-json-formatter-deploy`.
2. Permissions (least privilege, expected set for a Workers static-assets deploy with a custom domain):
   - Account, Workers Scripts, Edit
   - Zone, Workers Routes, Edit
   - Zone, DNS, Edit (wrangler writes the custom-domain DNS record)
   - Zone, Zone, Read
3. Account Resources: Include, your account only. Zone Resources: Include, Specific zone, `tarokit.app` only.
4. Set an expiry (for example 12 months) and put a reminder in your calendar. Leave client IP filtering off (GitHub runner addresses change).
5. Create it and copy the token once. Never paste it into chat, a file or a commit.
6. If the first deploy (step D) fails with an authentication error naming a missing permission (Cloudflare error 10000 or "Authentication error"), add exactly that permission in the token settings, re-run, and tell Claude so this checklist can be corrected. The list above could not be tested here.
7. GitHub, repository, Settings, Environments, New environment `production`. Recommended: tick "Required reviewers" and add yourself, so each deploy (manual or tag) waits for your approval. Under "Environment secrets" add:
   - `CLOUDFLARE_API_TOKEN` = the token
   - `CLOUDFLARE_ACCOUNT_ID` = the Account ID from B6
   Or with the CLI (prompts for the value): `gh secret set CLOUDFLARE_API_TOKEN --env production` and `gh secret set CLOUDFLARE_ACCOUNT_ID --env production`.
   The workflow only exposes them to the single "Deploy dist/ with wrangler" step of the `deploy` job; the `check` job that runs project code has no secrets.

## D. First deploy (USER)
Do this before tagging, so a pipeline problem does not use up a tag.
1. GitHub, Actions, "Deploy", Run workflow, branch `main`, leave "sw_kill" unchecked, Run.
2. The `check` job runs every CI check and builds with `HOST_ORIGINS=https://tarokit.app`. Then the `deploy` job waits for your approval (if you set reviewers): open the run, "Review deployments", tick `production`, Approve and deploy.
3. The deploy step prints the uploaded file count (expect 10 new files) and the custom domain. The last step, "Post-deploy smoke test", must end with `smoke: all 10 checks passed for https://json-formatter.tarokit.app`.
4. DNS and certificate for a new custom domain can take a few minutes. If the smoke test fails only because the host does not answer yet, wait and re-run the workflow (or run step E locally).
5. If the run fails, do not retry blindly: copy the failing step's log to Claude. Known candidates: a token permission (C6), an existing DNS record (B4), a registry or install problem on Linux.

## E. Post-deploy smoke test (QA-026) (USER)
```
cd /Users/er_lap_mam3_016/Documents/personals/taro-kit-tools/developer-tools/json-formatter
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm smoke:prod https://json-formatter.tarokit.app
```
It asserts, in order: `GET /` 200 with `Cache-Control: no-cache`; CSP `connect-src 'none'`, `default-src 'none'`, `frame-ancestors https://tarokit.app`, script-src `'self'` + boot hash only; no `X-Frame-Options`; HSTS at least one year; Permissions-Policy (`clipboard-write=(self)`, clipboard-read, camera, microphone, geolocation denied); nosniff; no-referrer; COOP; no `Set-Cookie`;
a hashed `/assets/` file is immutable; `/sw.js` carries only `default-src 'none'; connect-src 'self'` and `max-age=86400` (this proves Cloudflare honoured the `! Content-Security-Policy` line); no `.map`, `.vite/manifest.json`, `_headers`, `.assetsignore`; `/third-party-notices.txt` is served as text; unknown paths are 404; in headless Chromium the page loads, Beautify works, no cross-origin request, no CSP violation, and no request after load except the browser's own `/sw.js` update check (D-021). Exit code 0 means pass, 1 a failed assertion (the text says which), 2 bad usage.
This is manual item 9 below. Not covered by the script and still manual: that an unlisted origin cannot frame the tool (F-008.AC8; follows from `frame-ancestors`), and the zone hygiene of B3 beyond cookies and third-party requests. Also check once by hand: `curl -sI https://json-formatter.tarokit.app/ | grep -i -E 'strict-transport|content-security'`.

## F. Manual QA checks deferred from G5 (USER)
Copied verbatim from `.build-my-app/reports/traceability.md`, "Manual checks for the user (exact steps)". Sign each off here by writing the date and result next to it.

1. Real Safari (macOS, iOS) and real Firefox: open the production URL; run FLOW-01 (paste `{"a":1,"b":[1,2]}`, Beautify, Copy, Download), FLOW-02 (type `{"a":1,}`, click the error, fix it), FLOW-03 (paste 250-element array, Tree, expand, Copy path, Show in text). In Safari also press Tab through the page (find buttons, "Local only" reachable? then Option+Tab) — a11y.md M-A4/M5. Playwright Firefox cannot launch here.
2. VoiceOver (macOS Safari, then iOS): follow a11y.md M5-M11 (toolbar, More actions menu, find count "1 of N", tree announcements, error status).
3. Clipboard longer than 5 s: paste or open a ~100 MB file, press Copy, confirm the "copying" progress and that the result pastes complete (F-007.AC8 uses a stubbed clipboard).
4. Real phone (iOS Safari, Android Chrome) at 390/360/320 px: tap More actions, every item; Find with the on-screen keyboard; check 44 px targets, pinch-zoom to 200%, no horizontal page scroll.
5. Embedding in the real portal. taro-kit implemented F-012.R5/R6 (its commit 40b1ac5), and the theme hand-off passed locally on 2026-10-14 in Chromium and WebKit (`.build-my-app/reports/qa/portal-embedding.md`). What is left on the live sites: load the tool in the portal iframe, toggle the portal theme (the tool follows without reloading), resize, run FLOW-01, and confirm no CSP or frame-ancestors errors in the console.
6. Notices link inside the portal frame: privacy details > "Open-source notices" opens in a new tab via target=_blank; a portal iframe sandbox without allow-popups blocks it. Verify there; if blocked, decide between adding allow-popups in the portal or an in-frame notices view.
7. Windows High Contrast / forced colors (real Edge): Text/Tree pressed, tabs, match case, tree selected row distinguishable (Chromium emulation passes).
8. Real memory on 100 MB+ documents in Firefox/Safari; headed Chromium Performance trace for fast scrollbar drags (QA-025).
9. Deploy: header smoke test after first deploy (QA-026).

Which of them can run when (verbatim from `.build-my-app/reports/gate-qa.md`):

Locally now: (2) VoiceOver pass, (3) clipboard > 5 s, (4) real phone on the local network, (7) Windows high contrast in real Edge, (8) memory in Safari/Firefox, and the Safari/Firefox parts of (1) on `pnpm preview`.
After first deploy (phase 6): (1) on the production URL, (5) embedding in the real portal (needs taro-kit F-012.R5/R6), (6) notices link inside the portal frame, (9) header smoke test.


Order that works: 9 right after the first deploy (step E), then 1, 6 (portal part) and 5 once the portal embeds the tool, and 2, 3, 4, 7, 8 on any device at any time (use the production URL, or `pnpm preview` for local-only ones). Items 5 and 6 need the tool to be visible in the portal (section G); the portal side of F-012.R5/R6 is already implemented.

## G. Portal catalog: unhide the tool (USER applies; Claude did not edit taro-kit)
Repository: `~/Documents/personals/taro-kit` (read-only to the Claude agents; the entry was committed hidden in 6ad0cf9).
Do this only after steps D and E pass, because the portal's catalog check (F-014) verifies that visible tools are reachable and allow the portal to frame them, and stops the publish otherwise.
Exact change to `content/tools/json-formatter.yaml`:
```diff
--- a/content/tools/json-formatter.yaml
+++ b/content/tools/json-formatter.yaml
@@ -1,6 +1,5 @@
 # yaml-language-server: $schema=../schemas/tool.json
-# JSON Formatter (taro-kit-tools/developer-tools/json-formatter). Hidden until it is deployed,
-# so the catalog embed check (F-014) does not fail on an address that doesn't answer yet.
+# JSON Formatter (taro-kit-tools/developer-tools/json-formatter). Live since v1.0.0.
 id: json-formatter
 kind: tool
 name: JSON Formatter
@@ -13,4 +12,3 @@
 offline: true
 tags: [json, formatter, validator]
 added: 2026-10-13
-hidden: true
```
Steps: edit the file in the taro-kit repo, run its checks (`pnpm build` runs content validation; the catalog check workflow `.github/workflows/catalog-check.yml`), commit, and publish the portal through the portal's own release process.
Notes:
- The portal's `frame-src` is derived from visible embedded tools, so unhiding also lets the portal frame `https://json-formatter.tarokit.app`.
- taro-kit currently has only `ci.yml` and `catalog-check.yml` (no publish workflow yet). Unhiding goes live only when the portal itself is deployed, which is also a user-owned Cloudflare step (portal ADR-0007).
- **taro-kit F-012.R5/R6 (theme hand-off): implemented and checked locally.** taro-kit implemented it in commit 40b1ac5, using the same contract as this tool: `?theme=light|dark` in the frame address, `taro:ready` answered with `taro:theme`, exact origins only. A local cross-origin check passed 20/20 in Chromium and WebKit: the real portal build framed this tool's production build, both on their real https origins through request routing (`.build-my-app/reports/qa/portal-embedding.md`). Live confirmation is manual item 5, after section G. The portal's Permissions-Policy delegates `clipboard-write` to the tool only once the tool is visible (`hidden: false`), so Copy inside the portal works only after section G is deployed.
- The portal sandbox (`allow-scripts allow-same-origin allow-forms`) has no `allow-popups`: the "Open-source notices" link may be blocked inside the frame (manual item 6). The notices are always available at https://json-formatter.tarokit.app/third-party-notices.txt.

## H. Tag v1.0.0 and release (USER)
1. Pre-flight: the same commit is on `origin/main`, CI is green, step D/E passed, `package.json` is 1.0.0, `git status` is clean.
2. ```
   git checkout main && git pull
   git tag -a v1.0.0 -m "JSON Formatter 1.0.0"
   git push origin v1.0.0
   ```
   The push starts the Deploy workflow for the tag (it deploys the same build again; the workflow refuses a tag that is off `main` or does not match `package.json`). Approve the deployment and confirm the smoke test passes.
3. Optional, GitHub, Releases, Draft a new release from tag `v1.0.0`: paste the part of `.build-my-app/reports/release-notes-v1.0.0.md` above the line "Internal appendix".
4. Announce only after the portal entry is unhidden and manual items 1 and 9 pass.

## I. Rollback (USER; all of these are safe to run at any time)
1. **Quick: hide it in the portal.** Restore `hidden: true` in `content/tools/json-formatter.yaml` (reverse of section G) and publish the portal. The tool stays reachable by address but is no longer listed.
2. **Redeploy the previous version.** GitHub, Actions, "Deploy", Run workflow, "Use workflow from": choose the previous tag (for example `v1.0.0` once a later one is live), Run, approve. The workflow at that tag rebuilds and redeploys that exact source, then smoke-tests it.
   Alternatively in Cloudflare: Workers and Pages, `json-formatter`, Deployments (Versions), pick the earlier version, "Rollback". Use the dashboard when GitHub is the problem; the next workflow run would deploy the newer source again.
   For the very first release there is no earlier version: use rollback 1 and, if the page itself is harmful, rollback 3.
3. **Offline kill switch (`SW_KILL=1`), when browsers keep running a broken cached copy (ADR-0012, MOD-Build).** GitHub, Actions, "Deploy", Run workflow, branch `main` (or the fixed commit), tick `sw_kill`, Run, approve. The `check` job still runs all checks on the normal build, then rebuilds with `SW_KILL=1`: `/sw.js` becomes a worker that takes over at each browser's next update check (at most about 24 hours, because `/sw.js` is cached for 86,400 s), deletes the tool's `json-formatter-*` caches, and unregisters itself; pages of that build register no worker. Local equivalent: `SW_KILL=1 pnpm build` then `pnpm exec wrangler deploy` with your own token.
   For immediate recovery you can additionally send `Clear-Site-Data: "cache", "storage"` on `/` (needs a change to the generated `_headers`; ask Claude).
   Afterwards fix the defect and deploy a normal build (run the workflow again without `sw_kill`, or tag a patch release such as v1.0.1 after bumping `package.json`).
   Note: the smoke test against a kill-switch deploy still passes; it prints "SW_KILL build deployed (recovery mode)".
4. **Credential problems.** If the Cloudflare token leaks: Cloudflare, My Profile, API Tokens, Roll or Delete the token, update the `production` environment secret. If a deploy is wrong but the site works, just redeploy (rollback 2).

## J. Open items and risks
- `deploy.yml` has not run on GitHub; first run is the real test (a failing first run costs nothing: nothing is published until `wrangler deploy` succeeds).
- Token permission set (C2) is from Cloudflare's documented model for Workers and custom domains but untested here.
- QA-025 accepted (frame drops on very fast scrollbar drags at 100 MB, Chromium); Firefox never ran in the automated suite (could not launch on the build machine): manual item 1 covers it.
- The CI workflow runs Chromium only; the three-engine suite (`pnpm test:e2e`) is run locally.
- wrangler needs two pnpm overrides to satisfy ADR-0001 (`sharp` removed, `allowBuilds` esbuild and workerd false, in `pnpm-workspace.yaml`); re-check `pnpm check:licenses` whenever wrangler is upgraded.
- Wrangler 4.149.0 was the newest version allowed by `minimumReleaseAge` (3 days) on 2026-10-14; `^4` in DEP-33.
- GitHub disables scheduled workflows in public repos after 60 days of inactivity (portal risk); this repo has none.
- Privacy and terms texts need review by the owner (section 3).
