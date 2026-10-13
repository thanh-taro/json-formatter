---
id: MOD-Build
title: Build and deploy configuration — codegen, headers, gates
status: draft
depends_on: []
---

## Responsibility
Build-time scripts and configuration (no runtime code): generate MOD-Copy from `copy.md` and
CSS variables from `tokens.json` (Style Dictionary, ADR-0011) and fail when generated files
are stale; generate `_headers` (CSP with the boot-script hash, `frame-ancestors` from the
`HOST_ORIGINS` deploy setting, Permissions-Policy, caching) and the compiled-in allow-list
constant from the same setting (ADR-0008, ADR-0009), including the `/sw.js` rule that
detaches the page CSP with `! Content-Security-Policy` and sets its own CSP and
`Cache-Control: max-age=86400`, and emits `/sw.js` at a stable, unhashed path (ADR-0012); enforce the size budgets of
`architecture.md` on compressed output; run the license audit and `dist/` scan and emit
`third-party-notices.txt` (ADR-0001); the deploy workflow and post-deploy smoke test
(headers present per path, zero requests after load apart from the D-021 exception,
unlisted origin refused).

## Not responsible for
- Application behaviour.

## Public surface
- `pnpm build` (with `HOST_ORIGINS`), `pnpm check:size`, `pnpm check:licenses`,
  `pnpm gen` (copy, tokens), CI workflows.

## Implements
F-008.R4 (embedding allow-list header), F-009 guarantee support; RULE-16 (deploy-time list);
NFR-01 (CSP), NFR-05 (budget gate), NFR-09 (frame-ancestors).
