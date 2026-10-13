---
id: ADR-0002
title: UI framework for the shell — Preact 10 with signals, no meta-framework
status: proposed
date: 2026-10-13
supersedes: []
---

## Context
The tool has one screen (SCR-Formatter). Its heavy parts are not framework-rendered: the text
editor is an imperative editor engine (ADR-0004) and the tree is a custom virtualized list
(ADR-0007). The framework renders only the shell: CMP-Toolbar (with overflow menu at narrow
widths), CMP-StatusBar, CMP-IssuePanel (up to 1,000 items), CMP-DropOverlay, the confirmation
dialog, toasts, the privacy popover, and tree row contents inside the virtual window.

Forces:
- NFR-05: interactive in 1.5 s cold on 10 Mbit/s; the editor engine takes most of the JS
  budget (`architecture.md`).
- The host portal is built with **Preact 10 islands and @preact/signals** (portal decision
  record 0002), not React as first assumed. The tool runs in its own iframe and origin, so no
  runtime is shared, but using the same UI library keeps one mental model, one set of
  accessibility patterns, and lets small presentational pieces (buttons, key caps, toasts)
  be ported between the two code bases.
- Status, validity, progress and cursor position update at high frequency; updates must touch
  only the affected text nodes (NFR-02).
- NFR-06: accessible toolbar, menu, dialog, live regions, tree semantics. Native `<dialog>` and
  the `popover` attribute are available in all target engines (NFR-07).

## Decision
- **Preact 10.29.x** (MIT, ~4.5 KB compressed) with **@preact/signals** (MIT, ~3.7 KB),
  TSX, no `preact/compat`. Pinned to 10.x like the portal; Preact 11 (released 2026-09-30) is
  adopted together with the portal once the Vite preset declares support.
- Signals hold app state (document facts, validity, issues, busy/progress, theme, view); the
  status bar and progress bind to signals directly.
- The editor and tree are mounted into framework-owned containers via refs and driven
  imperatively; the framework never renders inside the editor.
- Accessible primitives (toolbar roving focus, overflow menu, tree keyboard model, live
  regions) are implemented in-house following the WAI-ARIA Authoring Practices.
- **No meta-framework**: a single-page tool is built directly with Vite (ADR-0003).

## Alternatives considered
- **Astro + one Preact island** (the portal's stack) — gives per-page CSP hashing and
  pre-rendering, which matter for a multi-page content site; a single-screen tool needs
  neither (one inline boot script hashed by our own build step), and Astro adds a build layer.
- **React 19** — the originally assumed portal stack; ~45–60 KB compressed for a shell of
  about ten components, and not what the portal actually uses.
- **Solid** — excellent fine-grained reactivity; a second mental model next to the portal.
- **Vanilla TypeScript / lit-html** — smallest, but hand-written DOM updates for dialogs,
  menus and lists cost more code than 8 KB of runtime.
- **Lit (web components)** — shadow DOM complicates token-driven theming and accessible
  labelling; no benefit here.

## Consequences
- Same UI library, state library and conventions as the portal.
- No ready-made accessible component library: toolbar, menu, tree and dialog behaviour need
  our own keyboard e2e tests (ADR-0010).

<!-- Accepted ADRs are immutable. Write a new ADR to change a decision. -->
