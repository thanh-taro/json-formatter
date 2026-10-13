---
id: ADR-0001
title: Dependency and license policy (aligned with the portal's policy)
status: proposed
date: 2026-10-13
supersedes: []
---

## Context
The tool is a personal, zero-budget project that ships JavaScript to every visitor and is
embedded in the taro-kit portal owned by the same person (PER-02). The vision brief rules out
copyleft code in what we ship. Every runtime dependency is also an attack surface for INV-02 /
NFR-01 (a library that phones home breaks the privacy promise) and a cost against the startup
budget of NFR-05.

The portal (repository `taro-kit`, its decision record 0008 "Dependency and asset licensing
policy") already defines a machine-checkable policy with scoped exceptions. Facts that apply
here too:
- Vite 8 (ADR-0003) depends directly on `lightningcss` (MPL-2.0), build-only.
- The standard accessibility engine (`axe-core`, `@axe-core/playwright`) is MPL-2.0, test-only.
- Playwright's browser binaries include Firefox (MPL-2.0) and WebKit (LGPL-2.1), test-only.
- Browserslist data (`caniuse-lite`) is CC-BY-4.0, build-only.

## Decision
Adopt the portal's policy unchanged, so both projects are audited the same way:
1. **Allowed for anything, including shipped code and assets**: MIT, ISC, BSD-2-Clause,
   BSD-3-Clause, 0BSD, Apache-2.0, Unlicense, CC0-1.0, BlueOak-1.0.0, Python-2.0, and OFL-1.1
   for fonts.
2. **Allowed for build/dev/test tools only, used unmodified and never shipped**: MPL-2.0
   (`lightningcss`, `axe-core`, Playwright's Firefox), LGPL-2.1/3.0 prebuilt binaries
   (Playwright's WebKit), CC-BY-4.0 data (`caniuse-lite`, attributed in the notices file).
3. **Never allowed**: GPL, AGPL, SSPL, BUSL or other source-available licenses, CC-BY-NC/ND,
   no license, unknown license.
4. **Registry first**: every direct dependency, every transitive *runtime* dependency, and
   every asset pack (icons, fonts, tokens) is a **DEP-** row in
   `specs/40-technical/dependencies.md` (name, version range, license, kind, purpose, status)
   before it enters the lockfile. Status moves `candidate` → `approved` → (`removed`).
5. **Runtime dependencies must** run fully offline, make no network requests, collect no
   telemetry, work under the CSP of ADR-0009, and be justified against the bundle budget in
   `architecture.md`. Prefer the platform or < ~200 lines of our own code when there is no
   tricky correctness surface (virtual list, message protocol, copy formatting).
6. **Enforcement in CI**: `pnpm licenses list --json` checked against the allow-lists by the
   kind recorded in the registry (build-only packages allow-listed by name); a scan of `dist/`
   fails on third-party code or fonts not registered as runtime; the build emits
   `/third-party-notices.txt` for shipped code and assets.
7. **Supply chain**: the lockfile is committed; pnpm's block on dependency lifecycle scripts
   stays on; `minimumReleaseAge` delays new releases by 3 days; dependency update PRs are
   reviewed, never auto-merged.

## Alternatives considered
- **A stricter, tool-specific policy (MIT/Apache/BSD/ISC everywhere)** — impossible with any
  Vite-based build (lightningcss) and excludes the standard accessibility engine; diverging
  from the portal would also mean two audit scripts.
- **No registry, CI audit only** — loses the "why is this here" record and the review moment.

## Consequences
- One policy and one audit approach across the portal and its tools.
- The runtime dependency set is small and auditable (editor engine, UI library, signals).
- Adding any package is a two-step change (registry row, then lockfile).

<!-- Accepted ADRs are immutable. Write a new ADR to change a decision. -->
