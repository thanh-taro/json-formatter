---
id: ADR-0009
title: Static hosting on the portal's platform with a strict, header-delivered CSP
status: accepted
date: 2026-10-13
supersedes: []
---

## Context
NFR-01 demands zero network requests after load and a content policy that forbids outgoing
connections; NFR-09 demands that only configured host origins can embed the tool, which can
only be enforced by the `frame-ancestors` directive **in a response header** (it is ignored
in a meta tag). NFR-05 needs fast cold and warm loads. The portal (repository `taro-kit`)
already chose Cloudflare Workers static assets, deployed by `wrangler` from GitHub Actions,
with a generated `_headers` file and a hardened zone (no injected analytics, no Rocket Loader,
no email obfuscation, no cookies), and tools on subdomains of `tarokit.app` that send
`frame-ancestors https://tarokit.app` and **not** `X-Frame-Options`.

## Decision
- **Host**: Cloudflare Workers static-assets project (assets only, no Worker script) at
  `https://json-formatter.tarokit.app`, in the portal's DNS zone (inherits its zone hygiene). Deployed by
  `wrangler` by hand from the owner's machine, after every local check passes; no CI publish
  workflow and host-side Git auto-deploy off, so nothing deploys automatically. Free tier.
- **Headers** (generated `_headers`; the page policy below applies to every path, including
  the module worker under `/assets/`, except `/sw.js` — see the service-worker exception):
  - `Content-Security-Policy: default-src 'none'; script-src 'self' 'sha256-<boot script>';
    style-src 'self'; img-src 'self' data:; font-src 'self'; worker-src 'self';
    connect-src 'none'; manifest-src 'none'; frame-src 'none'; object-src 'none';
    base-uri 'none'; form-action 'none'; frame-ancestors <HOST_ORIGINS or 'none'>`
  - `Permissions-Policy: clipboard-write=(self), camera=(), microphone=(), geolocation=(),
    clipboard-read=(), payment=(), usb=()`
  - `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`,
    `Cross-Origin-Opener-Policy: same-origin`. No `X-Frame-Options`. No COEP.
  - Caching: hashed files under `/assets/` → `public, max-age=31536000, immutable`; HTML →
    `no-cache`. Brotli/gzip by the host.
- **`/sw.js` header exception** (offline worker, ADR-0012, D-014): its `_headers` rule starts
  with `! Content-Security-Policy` to detach the page policy, then sets its own CSP
  (`default-src 'none'; connect-src 'self'`) and `Cache-Control: public, max-age=86400`.
  Cloudflare joins duplicate headers, so without the `!` line both policies apply, the
  worker's own `fetch` is blocked and — measured — the second visit fails to load even
  online until the worker script is replaced. A header test per path guards this.
- **CSP notes** (SP-iframe, identical in all three engines):
  - *Styles*: `style-src 'self'` blocks `<style>` elements and `style=""` attributes but
    allows constructable stylesheets (`adoptedStyleSheets`) and CSSOM property writes. All
    runtime styling goes through those: CodeMirror is mounted in a shadow root so `style-mod`
    adopts its stylesheets (ADR-0004; 0 violations measured); the UI sets dynamic values via
    `element.style.x =` or CSS custom properties, never `style` attributes in markup strings.
  - *Workers*: `worker-src 'self'` blocks `blob:` workers; every worker is a same-origin file
    (`new Worker(url, { type: "module" })`). A module worker gets the CSP of its own response
    (the page policy from `/assets/*`, so `connect-src 'none'` applies inside it too).
  - *No WebAssembly*: `script-src` has no `'wasm-unsafe-eval'`, so WASM compilation is
    blocked; ADR-0005 needs none. Adding WASM later requires a new ADR.
  - *Trusted Types*: feasible in all three engines, but `new Worker(url)` becomes a sink
    (needs a `trustedTypes` policy for the worker URL) and `innerHTML` with strings is
    blocked. Enforcement (`require-trusted-types-for 'script'`) is added once the build
    shows Preact and CodeMirror run clean under it; not required for M-1.
- **Fonts and icons self-hosted**; no third-party origin appears anywhere.
- A post-deploy smoke test checks the headers per path (including `/sw.js`), that a scripted
  session makes zero requests after load other than the browser's own service-worker
  install/update fetches allowed by NFR-01 (D-021), and that an unlisted origin cannot frame
  the tool (F-008.AC8). It also confirms Cloudflare's `_headers` merge semantics, which
  SP-iframe only emulated.

## Alternatives considered
- **GitHub Pages** — no custom headers: no `frame-ancestors`, CSP only via meta; fails NFR-09.
- **Cloudflare Pages** — equivalent `_headers` support; the portal standardised on Workers
  static assets, so we follow.
- **Netlify / Vercel free tiers** — header support, fine fallbacks; second vendor to manage.
- **CSP via meta tag** — cannot express `frame-ancestors`; header-only is simpler.
- **Service worker for instant warm loads** — HTTP immutable caching already meets the 0.5 s
  cached target (NFR-05); offline use (F-011) is the only reason for one (ADR-0012).
- **Per-response nonces / `'unsafe-inline'` styles** — a static host cannot mint nonces;
  `'unsafe-inline'` is unnecessary once the editor uses constructable stylesheets.

## Consequences
- Requires the `tarokit.app` domain and the Cloudflare account the portal also needs (user
  phase-6 decisions shared with the portal).
- `style-src 'self'` without `'unsafe-inline'` relies on the editor injecting styles through
  constructable stylesheets, which `style-mod` only does inside a shadow root (ADR-0004);
  e2e tests assert zero `securitypolicyviolation` events on all three engines (SP-iframe and
  SP-editor measured 0).
- Libraries that create `blob:` workers or inject `<style>` elements (e.g. Monaco's defaults)
  are incompatible without configuration; the dependency review checks for this.
- Build output must not depend on runtime `fetch` (module-preload polyfill off, ADR-0003).

## Evidence
- SP-iframe report: `.build-my-app/reports/spike-iframe.md` (CSP probes, `_headers` merge
  emulation and the `/sw.js` `inherit` failure; `spikes/iframe/tool/_headers`).
- SP-editor report (shadow-root mount, 0 violations): `.build-my-app/reports/spike-editor.md`.

<!-- Accepted ADRs are immutable. Write a new ADR to change a decision. -->
