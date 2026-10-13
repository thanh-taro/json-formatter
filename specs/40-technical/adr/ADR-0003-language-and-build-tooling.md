---
id: ADR-0003
title: Language and build tooling — TypeScript, Vite, pnpm
status: accepted
date: 2026-10-13
supersedes: []
---

## Context
We need a static build (HTML, hashed JS/CSS chunks, a module worker) that is deployable to any
static host, with code splitting (lazy tree chunk), worker bundling, a fast dev loop, and
output compatible with a strict CSP (ADR-0009: no inline script except one hashed boot script,
no `fetch` for module preloading). Node 24 and pnpm 11 are available.

## Decision
- **Language**: TypeScript in `strict` mode, ES2022+ target (latest two versions of the three
  engines, NFR-07), ES modules everywhere, including the worker (`type: "module"`).
  Use the **TypeScript 6.0** line (JavaScript-based compiler), as the portal does, because
  typescript-eslint 8.x supports TypeScript < 6.1; move to TypeScript 7 together with the
  portal once lint tooling supports it.
- **Build/dev server**: **Vite 8** (MIT; bundles with Rolldown) with the Preact preset.
  Worker created with `new Worker(new URL(..., import.meta.url), { type: "module" })`, which
  Vite bundles as a separate hashed chunk. `build.modulePreload.polyfill` disabled (the
  polyfill uses `fetch`, blocked by `connect-src 'none'`; all target engines support
  `modulepreload` natively). Source maps are generated but not deployed.
- **Package manager**: pnpm 11 with a committed lockfile; Node 24 LTS for tooling (same as
  the portal).
- **Lint/format**: ESLint 10 + typescript-eslint 8 + eslint-plugin-jsx-a11y + Prettier 3
  (all MIT), matching the portal's configuration. One custom lint rule
  set forbids network APIs (`fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`,
  `navigator.sendBeacon`, `importScripts` of remote URLs) in application code — a design-time
  guard for INV-02 alongside the CSP.
- **Build-time generation** (small scripts, no dependency): copy strings from
  `specs/30-experience/copy.md` and CSS variables from `specs/30-experience/tokens.json` (see
  ADR-0011); `_headers` file with the CSP, deploy-time origin allow-list and boot-script hash
  (ADR-0009).
- **Size gate**: a build script measures compressed sizes of the critical path and fails on
  budget overrun (budgets in `architecture.md`).

## Alternatives considered
- **Astro** (the portal's build) — see ADR-0002; a meta-framework adds nothing for one screen.
  Both use Vite underneath, so plugins and conventions carry over.
- **esbuild alone** — no MPL transitive dependency and very fast, but no dev server with HMR,
  manual HTML/asset hashing and worker handling.
- **Rsbuild / webpack** — capable, heavier configuration; no advantage for a single-page tool.
- **Parcel** — zero-config but less predictable worker/CSP output; smaller community today.
- **TypeScript 7 only** — faster, but type-aware lint rules would be unavailable today.
- **Biome instead of ESLint + Prettier** — one fast tool, but no custom-rule ecosystem for the
  network-API ban; ESLint is the boring choice.

## Consequences
- Vite 8 transitively installs `lightningcss` (MPL-2.0, build-only exception of ADR-0001).
- Worker and main bundles share the pure core module (MOD-Core) as an ES module; code that
  touches the DOM must never be imported from the worker entry (enforced by lint import rules).
- The `_headers` generation step makes the deploy configuration reproducible and reviewable.

<!-- Accepted ADRs are immutable. Write a new ADR to change a decision. -->
