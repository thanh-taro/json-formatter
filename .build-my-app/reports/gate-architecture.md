# Gate G3 — Architecture & spikes

| Check | Result | Evidence |
|---|---|---|
| Empty app shell builds and runs | pass | `pnpm build` (10.9 KB gzip JS); shell.png / shell-light.png |
| CI green | pass locally | gen:check, typecheck, lint+prettier, unit 7/7, build, spec_lint 0/0, license check; e2e Chromium/WebKit 4/4 (Firefox launch blocked on this Mac). Workflow not run on GitHub yet (nothing pushed). |
| All spikes closed with ADRs | pass | SP-formatter, SP-editor, SP-iframe, SP-pipeline, SP-tree — all ADAPT; amendments + Evidence in ADR-0004…0009, 0012 |
| Every dependency approved | pass | 35 approved, DEP-36/37/38 removed (license-audit-1.md); DEP-14 owner's own work (D-026) |
| User approves stack + money/legal | pass | D-027 (stack), D-026 (token reuse) |

Known limits accepted: NFR-04 memory best effort on WebKit/Gecko (D-024); WebKit scroll and >120 MB copy (D-025); colouring lag 2–10 MB (D-022).
