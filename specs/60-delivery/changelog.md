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
- QA fixes group A: added COPY-privacy.notices (link to the open-source notices from the privacy details, F-009 UX notes; QA-021).
- Release preparation (v1.0.0): DEP-33 wrangler installed as a pinned dev dependency (needs a `sharp` override and `allowBuilds` esbuild/workerd = false so ADR-0001 still passes); DEP-34 gains actions/upload-artifact and actions/download-artifact (pinned SHAs). Deploy workflow, `wrangler.jsonc`, `public/.assetsignore` (no source maps uploaded) and `pnpm smoke:prod` (QA-026) added to MOD-Build's surface.
- Change request after v1.0.0 deploy (user-reported bugs): CMP-Toolbar busy state and the CMP-Notice progress bar no longer style actions as disabled — they are ignored while busy and the progress bar is the only visible busy signal (D-031, fixes the toolbar flash on every action); architecture busy policy updated. CMP-Notice: outcome bars (COPY-notice.no_indent, COPY-notice.multiple_files, error bars) are removed when the next tool action starts or the document changes (D-032). Re-indent no longer moves focus into the editor (code bug, matches F-002/F-003).

## 2026-10-20
- Deploys are manual only (owner request): GitHub workflows `ci.yml` and `deploy.yml` removed; ADR-0009 now says the owner publishes by hand from their machine after local checks; MOD-Build no longer lists CI workflows; DEP-34 (GitHub Actions) removed; DEP-33 wrangler runs locally only.
- Change request (owner, D-033): F-009 R3/AC3/AC4 — an always-visible, icon-only link to the source repository in CMP-StatusBar (after the privacy statement), opening in a new tab without a referrer; COPY-privacy.source_label added; glossary terms "Source repository" and "Source link"; SCR-Formatter, CMP-StatusBar, platform-mapping, MOD-App, MOD-Copy updated; architecture A3 records the portal change request for popup sandbox tokens.
- Change request (owner, D-034): the source link uses the GitHub mark (Octicons `mark-github`, DEP-40, MIT) instead of a generic code icon; its transitive object-assign registered as unbundled (DEP-41).
- Change request (owner, D-035): the source link shows COPY-privacy.source ("Source code") after the GitHub mark; at narrow widths it shortens to the mark, like the privacy statement. CMP-StatusBar narrow variant updated.
- Released in v1.1.0 (2026-10-20, Cloudflare version ac565763): F-009 R3 source link (D-033..D-035) shipped; F-009 back to `shipped`.

## 2026-10-26
- Change request (owner): the tool follows the portal's language. The host passes
  `?lang=en-US|vi-VN` and re-sends `{ type: "taro:language", value }` on every switch (portal
  tool contract, portal ADR-0012); RULE-16 extended; new RULE-19 (matching, precedence, fallback
  to the browser's languages, then en-US). New F-012; copy.md gains a vi-VN column (JSON
  terms, value kinds, the product name and download file names stay as written). Counts and
  sizes use the active language's number format; the en-US singular rule applies only in en-US.
  ADR-0014; MOD-Host, MOD-Copy, MOD-Editor, MOD-Tree, MOD-App, architecture (font
  budget 80 → 90 KB), platform mapping, SCR-Formatter, glossary ("Language"), roadmap updated;
  DEP-12/DEP-13 add their Vietnamese subsets (same packages, same license). F-008 scope points
  to F-012. spec_lint's Notes check reads the last column.
- Spec review converged in 2 rounds (offline seeding keeps `theme`/`lang` query and waits for
  the startup font loads; notices keep raw values; value kinds marked English). Owner approved
  scope (D-036) and the vi-VN toolbar verbs Làm đẹp / Nén / Thụt lề lại (D-037); F-012 ready,
  ADR-0014 accepted.
- F-012 build: AC15 example corrected to a large-tier document (15,000,000 bytes → `15,0 MB`;
  COPY-notice.large only shows above 10 MB, RULE-02). CMP-TreeView, CMP-StatusBar and CMP-Notice
  gain a narrow/wrap variant (the tree header already overflowed at 320 px in English).
- F-012 code review: added COPY-editor.selection_deleted and COPY-editor.control_character (the
  editor's built-in phrases, previously English in every language); MOD-Host depends on MOD-Copy.
