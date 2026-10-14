# Gate G5 — QA & hardening (M-1)

| Check | Result | Evidence |
|---|---|---|
| Traceability matrix, automated items | pass | traceability.md: every M-1 AC → tests → pass (F-007.AC6 deprecated); vitest 397/397; e2e Chromium + WebKit 401 passed, 57 skipped by design, 0 failed, 0 flaky |
| Flows | pass | FLOW-01..03 e2e on both engines |
| Visual vs designs | pass (2 cosmetic minors) | qa/visual/round2/compare — N-1 narrow Text/Tree pill shape, N-2 narrow editor focus ring not in boards |
| NFRs | pass / known limits | perf.md: NFR-03 0.4–1.1 s at 100 MB; NFR-05 0.6 s cold / 0.07 s cached; NFR-04 Chromium 0.65–0.86 GB after GC; WebKit scroll + memory known limits (D-024/D-025) |
| Accessibility | pass (automated) | axe 0 violations, 28+ states, both themes/engines; 44 px touch; 320 px reflow; forced colors (Chromium) |
| Security & privacy | pass, no blockers | security.md; translate="no" fixed; privacy-declaration.md: "Data not collected" |
| Licenses | pass | dist/ scan: 18 shipped packages, all approved; notices complete |
| Bug loop | converged | bugs.md rounds 1–2: all fixed except QA-025 (accepted) and QA-026 (deploy → phase 6) |

## Manual checks (user sign-off) — traceability.md "Manual" 1–9
Locally now: (2) VoiceOver pass, (3) clipboard > 5 s, (4) real phone on the local network, (7) Windows high contrast in real Edge, (8) memory in Safari/Firefox, and the Safari/Firefox parts of (1) on `pnpm preview`.
After first deploy (phase 6): (1) on the production URL, (5) embedding in the real portal (needs taro-kit F-012.R5/R6), (6) notices link inside the portal frame, (9) header smoke test.
