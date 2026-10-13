# Gate G4 — Implementation (M-1)

| Check | Result | Evidence |
|---|---|---|
| All M-1 features shipped | pass | F-001…F-011 `shipped` (specs/20-features/_index.md) |
| CI green | pass locally | gen:check, typecheck, lint, 384 unit/property/conformance tests, build, check:size (critical path 173.9 / 250 KB), check:licenses (652 packages allowed), spec_lint 0/0; e2e Chromium + WebKit 342 passed, 14 skipped (engine/memory-tier skips), 0 failed. GitHub workflow not run yet (nothing pushed). Firefox cannot launch on this machine. |
| AC coverage 100% | pass | `spec_lint --coverage tests`: 0 M-1 ACs without a test (F-007.AC6 deprecated, D-023) |
| NFR-03 throughput | pass | `pnpm bench`: 10 MB validate/beautify/minify 76–344 ms; 100 MB 1.2–2.0 s (targets 1 s / 10 s) |

Every feature went through code review (+ security review for F-001, F-008, F-011) until no blockers/majors remained.

## Open items carried to QA (phase 5)
- Firefox: not run on this machine — needs a run elsewhere (CI or another Mac).
- Real Safari pass, real-clipboard copy > 5 s and WebKit clipboard (manual).
- NFR-04 memory and WebKit scroll at 100 MB (known limits D-024/D-025) — record numbers.
- F-006 minors: expansion restore with duplicate keys after an earlier insert; one renamed key can exhaust the 200-block restore budget.
- Screen-reader pass, 200% zoom, forced colors (from G2).
