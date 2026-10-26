---
id: MOD-Host
title: Host integration — theme, language, allowed origins, ready signal, offline worker
status: draft
depends_on: [MOD-Copy]
---

## Responsibility
Everything about the relationship with an embedding page (ADR-0008): the inline boot script
that applies the initial theme before first paint (address parameter `theme`, else device
preference) and sets the page language (address parameter `lang`, else the browser's
languages, else en-US — RULE-19, ADR-0014); the runtime theme controller (precedence: latest valid host message, address
parameter, device preference followed live; unknown values ignored); the message listener
that accepts `{ type: "taro:theme", value }` and `{ type: "taro:language", value }` only from
allow-listed origins and from `window.parent`, forwarding accepted languages to MOD-Copy; the single outbound `{ type: "taro:ready" }` message with an explicit target
origin; embedded/standalone detection (hides the tool's own header when embedded). The
compiled-in allow-list comes from the same deploy-time setting as the `frame-ancestors`
header (MOD-Build). It is the only module permitted to call `postMessage` on the parent
(enforced by lint). The `event.source` check is required, not redundant: SP-iframe showed a
sibling frame can reach the tool through `parent.frames`.

Also owns the tool's relationship with its own origin for offline use (ADR-0012, F-011): the
hand-written service worker script (`/sw.js`: HTML network-first with offline fallback,
hashed assets cache-first, seeding from the HTTP cache with `force-cache`, pruning per
navigation, no fetches on its own initiative) and its registration after first render with
`updateViaCache: "all"`, followed by posting the list of loaded same-origin URLs once the
worker is ready and the startup font loads (`fontsReady`, from MOD-App) have settled; the
page address in that list keeps a query made only of `theme` and/or `lang` exactly as loaded
(ADR-0014 §8). Registration failures are silent (online-only).

## Not responsible for
- Frame-ancestor enforcement (a response header, MOD-Build / ADR-0009).
- Styling of themes (tokens, ADR-0011); it only sets `data-theme`.
- The `/sw.js` response headers and its unhashed output path (MOD-Build).

## Public surface
- `theme` signal (`light` | `dark`) and `isEmbedded` flag.
- Pure language resolution (RULE-19): `matchLanguage(value)`, `resolveLanguage({ message,
  address, browser })`, `acceptLanguageMessage(...)`; sets `<html lang>` on every change.
- `startHost({ allowedOrigins })` — installs listener, sends ready once after first render.
- Boot script (classic, inline, CSP-hashed) — no exports.
- `startOffline({ fontsReady })` — registers `/sw.js` and sends the seed list after
  `fontsReady` (a promise; rejection counts as settled) has settled; no-op without
  service-worker support.
- `sw.ts` entry (built to `/sw.js`) — message `{ type: "seed", urls }` from the page only.

## Implements
F-008.R1, F-008.R2, F-008.R4 (message side), F-008.R5, F-008.R6 (standalone path);
F-011.R1, F-011.R2, F-011.R3; F-012.R1 (page language), F-012.R2, F-012.R3, F-012.R4, F-012.R7 (font loads before the
seed list);
RULE-16, RULE-19; INV-02 (never sends content); NFR-01 (D-021
exception only), NFR-09 (message-origin side), NFR-07 (embedded and standalone).

## Notes
- The offline worker matches cached pages ignoring the query string (`ignoreSearch`), because the portal opens the tool with `?theme=` and `?lang=` (portal ADR-0011, ADR-0012; ADR-0014).
