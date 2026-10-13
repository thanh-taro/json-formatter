---
id: ADR-0009
title: Static hosting on the portal's platform with a strict, header-delivered CSP
status: proposed
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
  `wrangler` from a GitHub Actions publish workflow that runs only when all checks pass;
  host-side Git auto-deploy off. Free tier.
- **Headers** (generated `_headers`, applies to every path including the worker script):
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
- **No service worker in the base build.** The portal catalogs the tool as offline-capable;
  an optional, NFR-01-compatible service worker is proposed separately in ADR-0012 (its
  script gets its own header block). The base decision does not depend on it.
- **Fonts and icons self-hosted**; no third-party origin appears anywhere.
- `trusted-types` enforcement (`require-trusted-types-for 'script'`) is evaluated in
  SP-iframe and added if the editor engine and UI library work under it.
- A post-deploy smoke test checks the headers and that a scripted session makes zero
  requests after load (NFR-01) and that an unlisted origin cannot frame the tool (F-008.AC8).

## Alternatives considered
- **GitHub Pages** — no custom headers: no `frame-ancestors`, CSP only via meta; fails NFR-09.
- **Cloudflare Pages** — equivalent `_headers` support; the portal standardised on Workers
  static assets, so we follow.
- **Netlify / Vercel free tiers** — header support, fine fallbacks; second vendor to manage.
- **CSP via meta tag** — cannot express `frame-ancestors`; header-only is simpler.
- **Service worker for instant warm loads** — HTTP immutable caching already meets the 0.5 s
  cached target (NFR-05); offline use is the only reason for one (ADR-0012, optional).

## Consequences
- Requires the `tarokit.app` domain and the Cloudflare account the portal also needs (user
  phase-6 decisions shared with the portal).
- `style-src 'self'` without `'unsafe-inline'` relies on the editor injecting styles through
  constructable stylesheets; SP-iframe checks for CSP violations on all three engines.
- Build output must not depend on runtime `fetch` (module-preload polyfill off, ADR-0003).

<!-- Accepted ADRs are immutable. Write a new ADR to change a decision. -->
