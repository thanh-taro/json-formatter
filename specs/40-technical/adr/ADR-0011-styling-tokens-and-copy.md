---
id: ADR-0011
title: Plain CSS with the portal's design tokens, self-hosted fonts and icons, generated copy
status: accepted
date: 2026-10-13
supersedes: []
---

## Context
PRN-05: the tool must look native inside the portal. The portal's "Night Market" style
(dark-first, light equal) lives in its `specs/30-experience/tokens.json` (W3C DTCG) and
`style.md`, compiled by Style Dictionary into CSS custom properties with
`[data-theme="dark"]` overrides and a `prefers-color-scheme` block (portal decision record
0003); its fonts (Unbounded, Manrope, JetBrains Mono, OFL-1.1) are self-hosted and its icons
(Lucide, ISC) are inlined at build. "One fact, one place" also applies to UI text: copy lives
in `specs/30-experience/copy.md`. NFR-05 limits what we download; the CSP (ADR-0009) forbids
inline styles in markup and any third-party request.

## Decision
- **Tokens**: the tool reuses the portal's token set. The design phase imports it into this
  project's `specs/30-experience/tokens.json` (with a provenance note: source repository and
  commit), so the spec linter and code generation read a local file; a sync script compares it
  with the portal's file and reports drift. **Style Dictionary 5** (Apache-2.0, dev-only)
  compiles it to `tokens.css` exactly like the portal (custom properties under `:root`, theme
  overrides under `[data-theme]`, a `prefers-color-scheme` block) plus a typed `tokens.ts`
  for the editor theme. Generated files are never edited; CI fails if stale.
- **CSS**: plain modern CSS with `@layer` (reset, tokens, base, components), one file per
  component, `light-dark()` / `color-scheme` for native controls, container queries for the
  480 px toolbar overflow (NFR-07). The editor theme is defined with CSS variables, so a
  theme change re-colours without reconfiguring the editor (F-008.AC2).
- **Fonts**: Manrope (UI) and JetBrains Mono (editor, tree, positions), self-hosted variable
  WOFF2 Latin subsets, `font-display: swap`, mono face preloaded; the display face is not
  used (the tool has no header when embedded). Fonts never block interactivity.
- **Icons**: Lucide (ISC) SVGs inlined at build — only the used icons.
- **Copy**: a build script turns `specs/30-experience/copy.md` into a typed module
  (`COPY["action.beautify"]`, placeholder-checked formatters); English only in M-1, no i18n
  library. Hints are looked up by issue code (RULE-04/05) from the same module.

## Alternatives considered
- **A tool-specific style** — breaks PRN-05 and duplicates design work.
- **Reading the portal's tokens file directly across repositories at build** — couples the
  builds and breaks the "specs are the source of truth in this repo" rule; a checked copy with
  drift detection is explicit.
- **Tailwind / CSS-in-JS** — rejected in the portal for the same reasons (second home for
  tokens, runtime CSS conflicts with the CSP).
- **System fonts only** — saves ~60–80 KB but looks different from the portal.

## Consequences
- Visual consistency with the portal at the cost of ~60–80 KB of fonts (outside the
  interactivity critical path; budget in `architecture.md`).
- Token contrast in both themes is checked like in the portal (automated audit, ADR-0010).
- Copy changes are spec changes; the UI cannot drift from `copy.md`.

<!-- Accepted ADRs are immutable. Write a new ADR to change a decision. -->
