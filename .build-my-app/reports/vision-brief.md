# Vision brief — JSON Formatter (taro-kit tools)

Status: approved 2026-10-13 (D-001…D-004)
Inputs: [market-research.md](market-research.md), product-strategist review.

## Problem
Developers regularly need to read, fix, and reshape JSON payloads (API responses, logs, configs).
Today they paste them into ad-heavy online formatters that may upload data — in Nov 2025 two
popular formatters leaked 80k+ saved payloads with credentials — or that silently change the
data (big IDs rounded, keys reordered), choke on large files, or give vague errors.

## Who
PER-01 (assumed): developers using the taro-kit tools portal — you and a small team. Adoption
test: "do I reach for this instead of VS Code / jq / a random website?"

## Pitch
**A private, lossless JSON formatter: paste anything, get it formatted or pinpoint what's
broken — nothing leaves your browser and nothing about your data changes except whitespace.**

## Differentiators
1. **Lossless** — formatting only changes whitespace: big numbers exact, number spelling
   (`1.0`, `1e3`) kept, key order kept, duplicate keys preserved and flagged.
2. **Verifiably client-only** — no network requests after load, no analytics, no save/share
   links; stated visibly in the UI.
3. **Precise, helpful errors** — line:column, jump to error, specific hints (trailing comma,
   comment, single quotes, unquoted key…).

Requirements, not differentiators: fast on large inputs (no frozen UI), fits the portal look.

## Non-goals (for now)
Server of any kind, accounts, history, share links, analytics, JSON Schema, editing in the
tree, format conversion (YAML/CSV), diff, query (JSONPath/jq) — the last three are candidates
for M-4+.

## Platform
Web app at its own URL, embedded by the existing React portal in an iframe. Must also work
standalone. Portal ↔ tool: theme (light/dark) and sizing via a small message contract.

## Business & legal
No monetization, no paid services. Client-only means no data-processing obligations. Only
MIT/Apache/BSD-style dependencies (no GPL copying). Clipboard and download inside the iframe
need the portal to grant `clipboard-write` / `allow-downloads` — a portal-side change.

## Milestones (proposed)
- **M-1 — Core value**: paste / drop / open file; beautify (2, 4, tab, custom N) and minify,
  lossless; convert tabs↔spaces / change indent; validate with line:column, jump-to-error and
  hints; copy & download; status (size, lines, valid/invalid); theme sync; works in iframe.
  Basic read-only tree view (expand/collapse, copy path/value). Single editor, formatting in place
  with undo (D-002).
- **M-2 — Explore & fix**: tree search and expand-to-level; lenient parse with one-click auto-fix (comments, trailing commas, single quotes);
  sort keys (opt-in, explicit); escape/unescape string.
- **M-3 — Scale & polish**: beyond-100 MB hardening, remembered preferences, keyboard shortcuts.
- **M-4+ candidates**: diff, JSONPath/jq query, JSON↔YAML/CSV.

## Quality targets (proposed)
Smooth at 10 MB (format < 1 s, UI never blocked), fully working at 100 MB, best-effort above
(D-003; spikes set the real ceiling and degraded modes, e.g. plain text without highlighting). WCAG 2.2 AA. Works in latest Chrome, Firefox, Safari.

## Risks
1. Not used over VS Code/jq → keep M-1 small; dogfood on real payloads.
2. Large files freeze editor/tree → spikes before stack choice.
3. Iframe friction (clipboard, downloads, theme flash) → stub host page from day 1.

## Spike candidates (for architecture)
Editor engine on 100 MB in an iframe · lossless token formatter in a worker (≥ 50 MB/s,
JSONTestSuite) · tree from token offsets · iframe clipboard/drop/download/theme across browsers.
