# Build plan — M-1 (11 features)

Pipeline per feature (feature-builder agent): context → tests per AC first → implement within
ADRs/modules → verify (build, all tests, spec lint, run app + screenshots vs designs) →
review loop (code-reviewer + AC coverage + security-auditor where data/files/network) →
commit, status `building` → `shipped` on merge.

Shared modules (MOD-Core, MOD-Worker, MOD-Editor, MOD-App) are touched by many features, so
waves keep parallel work on separate modules and merge one feature at a time, re-running the
full suite after each merge.

| Wave | Features (parallel within a wave) | Main modules | Why this order |
|---|---|---|---|
| 1 | **F-001** Load (editor, worker mirror, chunked commit, size tiers, Blob undo) · **F-008** Host fit · **F-009** Privacy badge | Editor, Worker, IO, App / Host / App | Foundation; F-008/F-009 are independent |
| 2 | **F-005** Validate (tokenizer, issues, status, issue panel) | Core, Worker, App | Everything else depends on validity |
| 3 | **F-002 + F-003** Beautify & Minify (one builder, shared formatter) · **F-004** Re-indent · **F-007** Copy & download · **F-010** Find | Core / Core / IO / Editor | Independent once F-005 lands |
| 4 | **F-006** Tree · **F-011** Offline | Tree / Host, Build | Tree needs validation index; offline needs host + final asset list |

Scale: ~10 feature-builder runs + reviewers; waves 1 and 3 run 3–4 agents in parallel worktrees.
Spike code (branches `spike/*`) may be promoted deliberately, citing the ADR, never merged wholesale.
Gate G4: all 11 features shipped, CI green, AC coverage 100% (or listed manual checks).

## Integration follow-ups (run after the last wave merges)
- F-007.AC7 from the tree view (needs F-006); F-007.AC3 with a real minify (needs F-003).
- F-008.AC6/AC7 full-suite re-run (all M-1 features).
- Real-clipboard copy > 5 s and in WebKit (manual QA if not automatable).
- Parallel worktree e2e runs collide on ports 4173/4179; make the e2e ports configurable per worktree (env), CI unaffected.
- Flaky under full-suite load: F-007.AC2 'beautified downloads as orders.json' (passes 5/5 alone) — investigate in QA.
- Timing assertions in unit tests (editor-column 50 MB < 50 ms) flake under machine load; move to the perf suite or measure CPU time — QA.
