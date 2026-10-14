# Changelog

Spec changes to items in `building` or `shipped` status are recorded here.

## 2026-10-13
- Initial M-1 spec set (draft).
- Spec review rounds 1–2 applied (see .build-my-app/reports/spec-review-round-*.md); decisions D-001…D-007.
- User approved gate G1 and delegated the status change: F-001…F-009, SCR-Formatter, CMP-*, FLOW-01…03 set to `ready`.
- NFR-07: minimum width lowered from 480 px to 360 px so the tool works in the portal's phone layout (D-012).
- Architecture clarifications accepted (D-015): RULE-17 mixed line endings normalised; RULE-02 + F-002.R7/AC10 confirmation for beautify results over 100 MB; F-007.R5/AC6 limited to detectable download blocks.
- Added F-010 Find text in the document (D-013), F-011 Work offline (D-014), CMP-SearchPanel, RULE-18, find copy — status draft.
- D1 design review: added CMP-Notice, CMP-ConfirmDialog; copy for issue/tree labels, cursor, valid-with-warnings; editor empty/all-selected/warning variants; status bar narrow; tokens toolbar 40, statusbar 28, panelHeader 32, treeRow 24 (4 px grid).
- Spec review of post-G1 items: NFR-01 covers offline-cache registration/update check at page open; F-011.AC3 aligned; F-004.R7/AC8 confirmation for re-indent over 100 MB; F-010 ACs tightened (cursor, 100 MB, toolbar, case, overlap, recount).
- User delegated status change: F-010, F-011, CMP-SearchPanel, CMP-Notice, CMP-ConfirmDialog set to `ready`.
- D1 round 2: accessible-name copy (COPY-label.toolbar/view/issues/tree), singular-form notes, Clear disabled on empty document.
- D2 design review: tree actions move to a selected-row header bar (D-018); editor soft-wraps under 600 px and jump scrolls horizontally (D-019); tree checking progress/cancel; too-large switch; confirm title; file-error recovery action.
- D2 round 2: narrow status bar keeps size/lines via COPY-status.size_lines_short (F-005.R6).
- Spike decisions: NFR-01 allows the browser's own offline-cache install/update fetches of the tool's own files (D-021, SP-iframe WebKit); NFR-02 exception for colouring 2–10 MB (D-022, SP-editor); F-007.R5/AC6 deprecated — sandbox download blocks are undetectable (D-023, SP-iframe).
- SP-tree clarifications: RULE-06 paths use decoded names, minimally re-escaped; RULE-12 grouped root expands only its first group.
- SP-pipeline decisions: NFR-04 memory measured after GC on the Chromium-based engine, best effort elsewhere (D-024); WebKit scroll and >120 MB copy limits accepted (D-025).
- Gate G3: ADR-0001…0012 accepted; registry entries approved (D-026 for portal tokens; DEP-36/37/38 removed).
- F-009 shipped; F-008 merged as building (AC6/AC7 re-run once all M-1 features land). ADR-0013 HSTS.
- F-001 build: added COPY-progress.inserting and COPY-progress.restoring (spec gap from implementation).
- NFR-01 clarified: browser may page large in-memory data (undo snapshots) to its own temporary files (D-028).
- F-001 build: added COPY-error.unreadable and COPY-error.failed.
- F-001 shipped (3 review rounds; security + code review converged).
- F-005 build clarifications: RULE-04 (control characters in strings, lone slash, BOM-only), RULE-05 duplicate keys compared decoded; location numbers grouped.
- F-005 shipped (3 review rounds).
- RULE-09 clarified: leading-space count includes spaces on lines that also contain tabs (F-004 build).
- RULE-02 clarified: no second very-large confirmation when the document is already over 100 MB (F-002 build).
- F-002, F-003 shipped. Test infra: E2E_PORT_BASE makes e2e ports configurable for parallel worktrees.
- F-010 edge case: after an edit the recount highlights the next match without moving the selection.
- F-004 shipped. Property/conformance suites get a 60 s per-test timeout (load-sensitive).
- F-010 shipped. F-006 edge cases settled (cancel → text view, undo in tree focus, expansion kept by path across versions).
- F-011 shipped (3 review rounds incl. security; single fixed cache, worker-side allow-list, kill switch SW_KILL=1).
 - F-007, F-008 shipped: F-007.AC3 runs a real minify; F-008.AC6/AC7 exercise a full M-1 session embedded and standalone. Open: NFR-01 vs lazy MOD-Tree chunk on a first WebKit visit (expected-fail test, needs a decision).
- F-006 shipped. All M-1 features shipped. Lazy chunks preloaded during page load to keep NFR-01 on first WebKit visits.
- NFR-07 minimum width lowered to 320 px for WCAG reflow (QA a11y).

## 2026-10-14
- QA-022/QA-023 (license and security minors): registry DEP-10 split — crelt and
  @codemirror/streamparser move to new DEP-39 (kind `unbundled`, not in dist/ or the notices);
  DEP-22 removed (never installed; worker protocol tested in Node and Playwright e2e, ADR-0010's
  Vitest browser mode not used); DEP-33 noted as not installed until the publish workflow lands;
  duplicate lucide-static devDependency removed. `pnpm check:licenses` now also scans dist/
  (ADR-0001 rule 6). Headers: Permissions-Policy denies every unused powerful feature, keeps
  `clipboard-write=(self)`. pnpm `trustPolicy: no-downgrade` (semver 5.7.2/6.3.1 reviewed
  exceptions), `blockExoticSubdeps`, `strictDepBuilds`; CI checkout without persisted
  credentials; JSONTestSuite tarball SHA-256 pinned. Trusted Types not enforced (see MOD-Build).
