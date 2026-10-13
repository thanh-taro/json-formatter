---
id: MOD-Host
title: Host integration — theme, allowed origins, ready signal
status: draft
depends_on: []
---

## Responsibility
Everything about the relationship with an embedding page (ADR-0008): the inline boot script
that applies the initial theme before first paint (address parameter `theme`, else device
preference); the runtime theme controller (precedence: latest valid host message, address
parameter, device preference followed live; unknown values ignored); the message listener
that accepts `{ type: "taro:theme", value }` only from allow-listed origins and from
`window.parent`; the single outbound `{ type: "taro:ready" }` message with an explicit target
origin; embedded/standalone detection (hides the tool's own header when embedded). The
compiled-in allow-list comes from the same deploy-time setting as the `frame-ancestors`
header (MOD-Build). It is the only module permitted to call `postMessage` on the parent
(enforced by lint).

## Not responsible for
- Frame-ancestor enforcement (a response header, MOD-Build / ADR-0009).
- Styling of themes (tokens, ADR-0011); it only sets `data-theme`.

## Public surface
- `theme` signal (`light` | `dark`) and `isEmbedded` flag.
- `startHost({ allowedOrigins })` — installs listener, sends ready once after first render.
- Boot script (classic, inline, CSP-hashed) — no exports.

## Implements
F-008.R1, F-008.R2, F-008.R4 (message side), F-008.R5, F-008.R6 (standalone path);
RULE-16; INV-02 (never sends content); NFR-09 (message-origin side), NFR-07 (embedded and
standalone).
