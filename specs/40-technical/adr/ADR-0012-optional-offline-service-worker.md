---
id: ADR-0012
title: Offline support via a cache-only service worker that never fetches on its own (D-014)
status: proposed
date: 2026-10-13
supersedes: []
---

## Context
The portal's catalog lists this tool as offline-capable (it is fully client-side), and the
portal is itself installable and offline-capable. The tool's specs do not require offline use
in M-1, and NFR-01 forbids any network request after the initial load (all of the tool's own
code and assets fetched). A conventional precaching service worker (e.g. Workbox
`injectManifest`, as the portal uses) downloads its precache list on install — requests
**after** load, and periodic update checks — which would break NFR-01 as measured ("network
log shows zero requests after load"). The page CSP has `connect-src 'none'`; a service
worker's own `fetch` is governed by the CSP of the worker script's response.

## Decision
**In scope for M-1 (D-014, F-011).**
- A hand-written service worker (~60 lines, no dependency) with **cache-on-fetch only**:
  - it never calls `fetch` on its own initiative: no precache, no install-time downloads, no
    periodic update checks;
  - it intercepts only same-origin `GET` requests the page itself makes during load;
    hashed `/assets/*` → cache first (immutable), the HTML document → network first with the
    cached copy as offline fallback;
  - old asset entries are pruned on `activate` against the current HTML's asset list.
- All startup chunks (including the worker and the tree chunk) are requested during load, so
  one complete visit makes the tool work offline; nothing is fetched later.
- The service worker script gets its own `_headers` block with `connect-src 'self'` (only it
  needs to re-issue the page's own requests); the page keeps `connect-src 'none'`.
- Registration happens after first render; an update is picked up on the next navigation
  (network-first HTML), without prompts or reloads.
- It works in both contexts: tool and portal are same-site, so the cache is shared between
  embedded and standalone use (portal decision record 0001).

## Alternatives considered
- **No offline support** (base build) — simplest and NFR-01 is trivially true; the portal's
  "offline-capable" flag would then be wrong for this tool.
- **Workbox precaching** (portal's approach) — robust, but install-time downloads and update
  checks happen after load (NFR-01 violation) and need `connect-src 'self'` broadly.
- **Application cache / bundle as single HTML file** — obsolete / defeats caching and CSP
  hashing.

## Consequences
- **Needs user decision** and a spec addition (an offline requirement/NFR) before building;
  the M-1 architecture does not depend on it.
- NFR-01's test must then also assert that the service worker issues no requests after load.
- One more artifact to test across three engines (SP-iframe covers registration inside the
  portal's sandboxed frame: `allow-same-origin` is present, so registration is permitted).

<!-- Accepted ADRs are immutable. Write a new ADR to change a decision. -->
