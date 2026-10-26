---
id: ADR-0015
title: No code-host workflows; automated e2e on Chromium and WebKit only
status: accepted
date: 2026-10-26
supersedes: []
---

## Context
ADR-0010 runs the end-to-end suite on Chromium, Firefox and WebKit, and its notes assume a CI
run on the code host. The GitHub workflows were already removed on 2026-10-20 (ADR-0009: deploys
by hand only). Playwright's Firefox does not launch on the owner's machine when started from
Claude Code (the process is terminated right after start, sandboxed or not), so the Firefox
project has never produced a result here; the sibling tools only ran it in CI. The owner decided
(2026-10-26) for all three taro-kit tools: no `ci.yml` or `deploy.yml`, deploys only by the owner
or Claude by hand, and Firefox removed from the automated suites.

## Decision
1. The repository has no code-host workflows (no CI, no deploy). Every check — codegen freshness,
   spec lint, typecheck, lint, unit, build, size and license gates, e2e — runs locally before a
   release; deploys follow ADR-0009 (by hand).
2. Playwright projects: `chromium` and `webkit` only (ADR-0010 is amended on this point).
   Firefox-only skips and branches are removed from the tests.
3. NFR-07 still includes Gecko-based browsers: each release candidate gets a manual check in
   Firefox (the release checklist's real-browser pass).

## Alternatives considered
- **Keep a test-only CI workflow for Firefox** — the owner does not want code-host workflows.
- **Drop Gecko from NFR-07** — not requested; Firefox users stay supported.

## Consequences
- Gecko regressions are caught only by the manual release check.
- DEP-26 no longer includes Playwright's Firefox (MPL-2.0); DEP-34 stays removed.

<!-- Accepted ADRs are immutable. Write a new ADR to change a decision. -->
