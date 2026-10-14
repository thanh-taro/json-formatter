# Changelog

All notable changes to JSON Formatter. Format: Keep a Changelog; versions follow Semantic Versioning.
Spec-level changes are tracked separately in `specs/60-delivery/changelog.md`.

## [Unreleased]

### Fixed
- The toolbar no longer flashes on every action: while an operation runs, controls keep their normal look
  (they are ignored and marked `aria-disabled`); the progress bar after 0.5 s is the only busy signal (D-031).
- A notice about an action's result, such as "No indentation found to change", now goes away when the next
  action starts or the document changes (D-032).
- Re-indent no longer moves focus into the editor, so the editor's focus ring no longer appears around it.

## [1.0.0] - 2026-10-14

First release (milestone M-1). User-facing notes: `.build-my-app/reports/release-notes-v1.0.0.md`.

### Added
- Load a document by paste, drop or file picker, with size tiers up to and beyond 100 MB, progress and cancel (F-001).
- Lossless Beautify, Minify and Re-indent, each undoable in one step (F-002, F-003, F-004).
- Continuous strict validation with first error, hint, location and jump-to-issue, plus warnings (F-005).
- Read-only tree view with copy path, copy value and reveal in text (F-006).
- Copy and download (F-007), find in text (F-010), light and dark themes and portal embedding (F-008).
- Visible privacy statement and open-source notices (F-009); offline use after one visit (F-011).
- Deployment: Cloudflare static assets via GitHub Actions (`.github/workflows/deploy.yml`, `wrangler.jsonc`),
  hidden source maps excluded from the upload, and the post-deploy `pnpm smoke:prod <url>` check.

### Known limits
- QA-025: fast scrollbar drags on a 100 MB document can drop frames in Chromium (accepted).
- Safari/WebKit: heavier scrolling and memory on 100 MB documents (D-025).
