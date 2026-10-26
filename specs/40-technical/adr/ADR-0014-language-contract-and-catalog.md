---
id: ADR-0014
title: Language contract and localized string catalog
status: accepted
date: 2026-10-26
supersedes: []
---

## Context
The portal now passes the user's language to embedded tools (portal tool contract, "Language
hand-off"; portal ADR-0012): the frame address carries `?lang=en-US` or `?lang=vi-VN` next to
`theme`, the answer to `taro:ready` carries `{ type: "taro:language", value }` next to
`taro:theme`, and every switch re-sends `taro:language` (F-012, RULE-16, RULE-19). The tool must
show the right language from first display, follow live switches without losing any work, keep
the single source of strings (ADR-0011) and the size budget (NFR-05), and render Vietnamese in
its own typefaces. ADR-0008 (host contract) and ADR-0011 (copy generation, fonts) stay in force;
this ADR extends both. The sibling Text Case Converter made the same change (its ADR-0013); this
follows it, plus what is specific to this tool: imperative views (CodeMirror editor, MOD-Tree)
and notice bars that today hold rendered text.

## Decision
1. **Address.** The inline, CSP-hashed boot script reads `lang` with `theme`, resolves the
   language per RULE-19 (address → `navigator.languages` → `en-US`) and sets `<html lang>` before
   first paint. The app resolves the same way at start (one shared pure function in MOD-Host,
   mirrored in the classic boot script and covered by the same unit cases), so the first render
   is already in the right language. Strings are rendered only by the app, so there is no flash.
2. **Live switch.** `{ type: "taro:language", value }` is accepted under the exact ADR-0008 rules
   (allow-listed `event.origin`, `event.source === window.parent`); unsupported values are
   ignored; the latest accepted message wins over the address. Repeated identical values are
   no-ops. No new outbound message; the ready signal is unchanged.
3. **Catalog.** `copy.md` holds one text column per language (`en-US`, `vi-VN`) before Notes;
   `scripts/gen-copy.mjs` generates one typed catalog with both languages and fails the build if
   a non-deprecated string lacks a language or its placeholders differ between languages
   (F-012.AC12). Both languages ship in the main bundle (~4 KB compressed) — no lazy loading, no
   i18n library.
4. **Active language.** MOD-Copy holds the active language as a signal; `t()` reads it. Preact
   components re-render on a switch with their state intact. Text that outlives a render is kept
   as data, not text: notice bars, toasts and the confirm dialog store a COPY ID plus raw
   parameters (sizes in bytes, counts as numbers) and are formatted and rendered when shown. Imperative views relabel in place on a switch without being
   rebuilt: the editor's accessible name sits in a CodeMirror compartment that is reconfigured
   (document, selection and history untouched); MOD-Tree exposes `relabel()`, which rewrites its
   static labels and re-renders visible rows from the existing row model (expansion and scroll
   kept). The live region is not re-announced on a switch.
5. **Formatting.** Counts, line and column numbers use `Intl.NumberFormat(activeLanguage)`;
   sizes keep their units and rounding (ADR-0011) and use the active language's decimal mark.
   Plurals: the en-US singular rule (`1 line`) applies only in en-US; vi-VN has no plural forms.
   Nothing derived from the document is localized (INV-01, F-012.R5).
6. **English terms in a vi-VN page.** The tree's value kinds (`object`, `array`, …), rendered as
   their own elements, carry `lang="en"`. Hints are translated as whole sentences: prose nouns
   are translated (chuỗi, mảng, đối tượng) and only literal JSON tokens (`true`, `false`, `null`,
   escape sequences, `NaN`, …) stay as written, without separate language marking (NFR-06).
7. **Fonts.** Add the `vietnamese` subsets of the already-approved Manrope (DEP-12) and
   JetBrains Mono (DEP-13 — positions, counts and the find count are in the mono face) as extra
   `@font-face` rules with their `unicode-range`. Both are requested at startup in every language
   (`document.fonts.load`), as part of the initial load, so the offline worker's seed list caches
   them (ADR-0012) and no font request ever follows the load, depends on what the user types, or
   on a live switch (NFR-01). Budget: fonts ≤ 90 KB (measured ~81 KB).
8. **Offline.** Cached pages already match ignoring the query (ADR-0012). Seeding keeps the
   page address exactly as loaded when its query is made only of `theme` and/or `lang` (each at
   most once, with a valid value), so the seed is served from the HTTP cache and the first
   embedded visit makes no extra page request (NFR-01); any other query is still dropped.
   `startOffline()` posts the seed list only after the startup font loads (§7) have settled, so
   the Vietnamese subsets are always in it (F-012.AC13).

## Alternatives considered
- **An i18n library (i18next, FormatJS)** — far more weight than 2 languages × ~115 strings need.
- **A build per language** — doubles deploys and cannot switch live (F-012.AC3).
- **Address only** — cannot follow a live portal switch.
- **Reload on switch** — simplest, but loses the document and undo history (F-012.R2).
- **Rebuild the editor and tree on a switch** — simpler than relabeling, but loses selection,
  history, scroll and expansion or needs them saved and restored.

## Consequences
- One more inbound message type; the outbound contract is unchanged (INV-02).
- The boot script's CSP hash changes (regenerated by `scripts/gen-headers.mjs`).
- ~16 KB more fonts on first visit in every language; font budget raised from 80 to 90 KB.
- Translations are spec changes in `copy.md`, reviewed by the owner.
- Adding a language later = one column in copy.md + one entry in RULE-19's list.

<!-- Accepted ADRs are immutable. Write a new ADR to change a decision. -->
