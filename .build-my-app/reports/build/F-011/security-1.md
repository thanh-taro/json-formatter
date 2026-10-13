# F-011 security/privacy review 1

Scope: `git diff main...worktree-agent-af4ed274c018e9771` (service worker, ADR-0012). Line numbers below refer to the worktree `.claude/worktrees/agent-af4ed274c018e9771`.
Verdict: **no blockers, 1 major, 4 minor, 2 info.**

## Major

### M1. The worker's seed validation has no scheme or path allow-list, so `blob:` URLs (document content) can be cached
- **Where:** `src/host/offline-policy.ts:66-79` (`seedTargets`), used at `src/host/sw.ts:103-124`.
- **What's wrong:** the doc comment (line 57) says "same-origin, http(s)", but the code checks only `u.origin === origin` and `pathname !== '/sw.js'`.
  - `new URL('blob:https://json-formatter.tarokit.app/<uuid>').origin` is the tool origin, so a blob URL passes. Verified in Node.
  - F-007 creates exactly such blob URLs from document content (`src/io/index.ts:203`).
  - `cacheKey` turns the blob URL into `https://json-formatter.tarokit.apphttps//json-formatter.tarokit.app/<uuid>`. That key is a valid http(s) URL, so `cache.put` accepts it.
  - A blob fetch returns a `basic`, `ok` response, so `usable()` lets it through.
  - `prunable` (lines 88-91) only removes `/assets/*` keys, and `install` (`sw.ts:43-56`) copies every entry into each new build's cache. So the entry would never be deleted.
- **Exploit/impact:** Document content would be written to disk and kept indefinitely, against PRN-01 and NFR-01 ("never persists document content"). Two things can trigger it:
  - any same-origin script (XSS, or a later page-side bug) that posts `{type:'seed', urls:[blobUrl]}`;
  - a regression in the page-side `seedList` filter.

  Today the page filter (`src/host/offline.ts:28-36`, `isAsset`) blocks this. The worker is meant to be the second line of defence and isn't. Any other same-origin path that returns 200 can also be stored forever this way (cache stuffing).
- **Fix:** In `seedTargets`:
  1. Require `u.protocol === 'https:' || u.protocol === 'http:'`.
  2. Require `u.pathname === '/' || u.pathname === '/index.html' || isAssetPath(u.pathname)`, and reject asset paths that contain `..` or a second `//`.

  Then:
  - add unit tests for `blob:`, `filesystem:`, `data:`, `/random` and `/assets/`;
  - make `prunable` also drop any key that is not on the allow-list (`new URL(k).origin !== ORIGIN` or the path is not allowed).

## Minor

### m1. Page caching accepts any navigated path
- **Where:** `src/host/offline-policy.ts:44`, `src/host/sw.ts:72-82`.
- **What's wrong:** any same-origin navigation that returns 200 is stored under its own path, and page keys are never pruned.
- **Impact:** a cross-site link to `json-formatter.tarokit.app/<anything>` adds a cache entry whenever the host returns 200 for that path (for example if SPA fallback is ever enabled). The result is unbounded growth and stale HTML at odd paths. Content is only the tool's own HTML, so this is not a privacy issue.
- **Fix:** return `'page'` only for `/` and `/index.html`; let other navigations pass through uncached. Alternatively, store every navigation under the single key `ORIGIN + '/'`.

### m2. `install` carries over every old entry without filtering
- **Where:** `src/host/sw.ts:43-56`.
- **What's wrong:** everything from every `json-formatter-*` cache is copied, so a wrong entry (M1, m1) outlives every update.
- **Fix:** copy only allow-listed keys, using the same predicate as M1.

### m3. No kill switch or recovery runbook for a defective `/sw.js`
- **Where:** `public/_headers:14-18`, `src/host/offline.ts:44`, ADR-0012.
- **What's wrong:** with `Cache-Control: public, max-age=86400` and `updateViaCache: 'all'`, a broken or vulnerable worker can stay in control for up to about 24 h (the browser's update-check cap). An offline user keeps the last cached build until their next online opening. That is inherent to the design and acceptable, but there is no documented way to recover.
- **Fix:**
  - Document a kill-switch `sw.js` that deletes `json-formatter-*` caches and calls `self.registration.unregister()`.
  - Document the option of serving `Clear-Site-Data: "cache", "storage"` on `/`.
  - Put both in the deploy runbook and the post-deploy smoke test.

  The 86400 value itself is fine: it is the ADR's measured NFR-01 trade-off.

### m4. Doc comment does not match the code, and tests don't cover hostile seed input
- **Where:** `src/host/offline-policy.ts:57`, `tests/unit/host-offline.test.ts:60-70`.
- **What's wrong:** the comment claims an http(s) check that the code doesn't do, and there are no negative tests for hostile seed input.
- **Fix:** covered by M1. Add the tests.

## Info (no action required)
- **i1. Offline HTML keeps old headers.** HTML served offline carries the CSP and `frame-ancestors` from the time it was cached. If `HOST_ORIGINS` is narrowed later, an offline session uses the older list until the next online opening. Low impact, because the framing is still checked against the stored header.
- **i2. Seeding runs after the `load` event** (`offline.ts:72-74`, after `fonts.ready`). In Chromium and Gecko it is served from the HTTP cache (0 requests). On WebKit it makes network requests for the tool's own files only. This is the D-021 exception, as specified.

## Verified OK
- **Origin and method restrictions:** `routeOf` (`offline-policy.ts:40-46`) ignores non-GET and cross-origin requests. Subresource requests from non-asset paths, and `/sw.js` itself, are not intercepted. POST, blob and data requests are never routed.
- **Network response poisoning:** `usable()` (`sw.ts:39`) rejects opaque, redirected and non-2xx responses.
- **Message origin:** `sw.ts:104` checks `event.origin === ORIGIN`. Only same-origin clients can reach a service worker anyway. The portal (`tarokit.app`) and other origins cannot post seed or prune messages, cannot trigger `caches.delete`, and cannot read Cache Storage. `activate` deletes only this origin's `json-formatter-*` caches.
- **Scope:** the tool has its own origin (`json-formatter.tarokit.app`), and the worker's scope is `/`, so it cannot control portal pages. `Service-Worker-Allowed` is correctly absent (the script is at the root, default scope).
- **CSP for /sw.js:** `! Content-Security-Policy` detaches the page policy, and the replacement is `default-src 'none'; connect-src 'self'`. `script-src` falls back to `'none'`, so `eval`, `new Function` and `importScripts` are blocked. The built `dist/sw.js` (2.1 KB) is a classic script with no `eval`, `importScripts`, imports or `sourceMappingURL`, and the build fails if `import`/`export` appear (`scripts/lib/offline.mjs:50-52`). `*.map` files are excluded from deploy (`dist/.assetsignore`). The `/*` headers (nosniff, HSTS, COOP, Referrer-Policy) still apply to `/sw.js`. The page keeps `connect-src 'none'`.
- **Update path:** HTML is `no-cache` and the worker serves it network-first. There is no `skipWaiting`/`clients.claim` and the page never reloads itself (F-011.R3). Old caches are deleted on activate, and old assets are pruned per navigation.
- **NFR-01:** the worker makes no fetches of its own initiative: no precache, no timers, no background or periodic sync. Its fetches are forwarded navigations, asset cache misses, and force-cache seeding of files the page already loaded. Document content is never in URLs (the only query parameter is `?theme=`, and the hash is stripped).
- **Embedded (`sandbox allow-scripts allow-same-origin`):** the worker controls only clients on the tool's origin. The cache is shared with standalone use because the two are same-site (intended, ADR-0012). Cached responses keep `frame-ancestors`, so an unlisted framer is still refused offline. No cross-site data path was found.
- **Secrets, logging, SDKs:** there are no secrets, no logging of personal data and no third-party SDKs in the diff. The ESLint exception (`eslint.config.js`) allows `fetch` and `caches` only in `src/host/sw.ts`. The e2e admin toggles (`/offline`, `/publish`) are test-only and bound to `localhost`.
- **Transport:** service workers require a secure context, and HSTS is set.

## Store privacy declarations (data collected)
- **None collected or transmitted:** no analytics, identifiers, cookies or third-party SDKs.
- **Stored on the device:** Cache Storage holds only the tool's own static files (HTML, JS, CSS, fonts), so it can work offline. It is never sent anywhere and contains no user content (once M1 is fixed, the worker enforces this itself too).
- **Network:** besides the initial load, WebKit makes the browser's own fetches and update checks of the tool's files (D-021). These carry no user data.
