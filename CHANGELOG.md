# Changelog

All notable changes to JSON Formatter. Format: Keep a Changelog; versions follow Semantic Versioning.
Spec-level changes are tracked separately in `specs/60-delivery/changelog.md`.

## [Unreleased]

### Added
- Vietnamese: the tool follows the taro-kit portal's language (`?lang=en-US|vi-VN` and live `taro:language`
  messages), else the browser's preferred languages, else English (F-012). Numbers and sizes are written the
  Vietnamese way (`1.234`, `1,5 MB`); the tree's value kinds and JSON tokens stay in English. Switching keeps the
  document, undo history, selection, view, tree expansion, find and indent style.
- The Vietnamese subsets of Manrope and JetBrains Mono are loaded at startup and cached for offline use.

### Changed
- At narrow widths the status bar, notice bars and the tree header wrap onto another row instead of
  overflowing (the tree header overflowed at 320 px in English too).

## [1.1.0] - 2026-10-20

### Added
- A "Source code" link with the GitHub mark in the status bar, after "Local only", opens the source repository
  (https://github.com/thanh-taro/json-formatter) in a new tab without a referrer (F-009.R3). Narrow screens show
  the mark only. Inside the taro-kit portal it opens once the portal's frame allows new tabs.

### Changed
- Deploys are manual only; the GitHub workflows were removed.
- Local ports: dev server 5180, preview 4180, e2e test servers 4400-4406.
- The open-source notices now include @primer/octicons (MIT), the source of the GitHub mark.

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
