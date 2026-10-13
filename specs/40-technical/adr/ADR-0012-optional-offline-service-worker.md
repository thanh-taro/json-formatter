---
id: ADR-0012
title: Offline support via a hand-written service worker seeded from the HTTP cache (D-014)
status: proposed
date: 2026-10-13
supersedes: []
---

## Context
F-011 (D-014) requires that, after one complete visit with a connection, every M-1 feature
works offline, embedded or standalone, and that a new version is used from the next opening
without reloading an open session. NFR-01 forbids network requests of the tool's own after
the initial load; as amended by D-021 it allows the browser's own install and update-check
fetches of the tool's own files for the offline cache (they never carry user content). A
conventional precaching service worker (e.g. Workbox `injectManifest`, as the portal uses)
downloads its precache list on install and checks for updates, and needs `connect-src 'self'`
broadly. The page CSP has `connect-src 'none'`; a service worker's own `fetch` is governed by
the CSP of the worker script's response.

SP-iframe tested four variants on three engines with a server-side request log:
- *cache-on-fetch only* (the first draft of this ADR): offline fails after the first visit,
  because that visit is not controlled by the worker, so nothing is cached;
- *seed*: after first render the page posts its loaded URLs and the worker stores
  `fetch(url, { cache: "force-cache" })` — offline after one visit, served from the HTTP cache
  with **0** network requests in Chromium and Firefox (even for the `no-cache` HTML);
- *seedcached*: *seed* plus `updateViaCache: "all"` and `Cache-Control: max-age=86400` on
  `/sw.js` — 0 requests after load on every visit in Chromium and Firefox;
- *inherit* (`/sw.js` served with the page CSP joined in): seeding fails and the second visit
  does not load even online.
WebKit ignores `updateViaCache` and its worker `fetch` does not use the page's HTTP cache: it
makes ~4 seeding requests on the first visit and checks `/sw.js` about 1 s after every load.
No service-worker design avoids this; D-021 accepts it.

## Decision
- A hand-written service worker `/sw.js` (~80 lines, no dependency, not hashed so its URL is
  stable) implementing the **seedcached** design:
  - **Registration** after first render: `navigator.serviceWorker.register("/sw.js",
    { updateViaCache: "all" })`, guarded (skipped if the API is unavailable or registration
    throws, e.g. storage partitioning — the tool then simply works online only).
  - **Seeding**: once the worker is ready, the page posts the list of its own loaded
    same-origin URLs (the document and every `/assets/*` file from
    `performance.getEntriesByType("resource")` plus the module graph's known chunks, including
    the worker and tree chunks); the worker stores each with
    `fetch(url, { cache: "force-cache" })` into one versioned Cache Storage entry set.
  - **Runtime**: intercepts only same-origin `GET`s. HTML document → network first, cached
    copy as offline fallback; hashed `/assets/*` → cache first (immutable).
  - **Never fetches on its own initiative** otherwise: no install-time precache, no periodic
    checks, no background sync.
  - **Pruning**: on each navigation, after seeding, asset entries not referenced by the
    current HTML are deleted (not in `activate`, so an open older session keeps its assets).
  - **Updates**: a new version arrives through the network-first HTML on the next online
    opening; a changed `/sw.js` follows the default lifecycle (no `skipWaiting` /
    `clients.claim` forcing), and the page never reloads itself, so no open session is
    reloaded (F-011.R3). All chunks, including the worker and tree chunks, are requested
    during load so that the seed list is complete.
- **Headers** (ADR-0009): the `/sw.js` rule starts with `! Content-Security-Policy`, then
  `Content-Security-Policy: default-src 'none'; connect-src 'self'` and
  `Cache-Control: public, max-age=86400`. The page keeps `connect-src 'none'`.
- **Engines**: Chromium and Gecko meet NFR-01 literally (0 requests after load). WebKit makes
  the browser's own seeding and update-check requests for the tool's own files; this is the
  D-021 exception to NFR-01, and the worker is not disabled on WebKit.
- It works in both contexts: tool and portal are same-site and the portal frame has
  `allow-same-origin`, so registration is permitted in the frame and the cache is shared
  between embedded and standalone use (portal decision record 0001).

## Alternatives considered
- **Cache-on-fetch only** (first draft) — measured: not offline after one visit (F-011.R1
  fails); after a second visit WebKit still re-downloads assets.
- **Skip the worker on WebKit** — keeps NFR-01 literal everywhere, but Safari users get no
  offline support; rejected by D-021.
- **No offline support in M-1** — simplest; contradicts D-014 and the portal's
  "offline-capable" catalog flag.
- **Workbox precaching** (portal's approach) — robust, but install-time downloads and update
  checks happen after load on every engine and need `connect-src 'self'` broadly.
- **Application cache / bundle as single HTML file** — obsolete / defeats caching and CSP
  hashing.

## Consequences
- The NFR-01 test is measured with a **server-side request log** (not only the browser's
  network events) and allows exactly the D-021 exception: requests for the tool's own files
  made by the service worker or the browser's worker-update check. Offline is emulated by
  refusing connections at the server: Playwright's WebKit `setOffline` also blocks the
  worker's cache responses and gives a false failure.
- The platform-mapping rule "no storage APIs" gains one exception: Cache Storage, written only
  by `/sw.js` and only with the tool's own files (PRN-01: never document content).
- MOD-Build emits `/sw.js` outside the hashed assets and its `_headers` block; a header test
  per path guards the `!` detach.
- Seeding and `force-cache` behaviour are browser-cache dependent; if the HTTP cache was
  evicted, seeding fetches from the network during the page's first moments (still the
  browser fetching the tool's own files).
- Open: real Safari pass and confirmation of Cloudflare's `_headers` merge on the first real
  deploy (post-deploy smoke test).

## Evidence
- SP-iframe report: `.build-my-app/reports/spike-iframe.md` (section "Service worker /
  offline"; tests in `spikes/iframe/`, misleading WebKit `setOffline` run in
  `results/webkit-sw-setOffline-run.ndjson`).

<!-- Accepted ADRs are immutable. Write a new ADR to change a decision. -->
