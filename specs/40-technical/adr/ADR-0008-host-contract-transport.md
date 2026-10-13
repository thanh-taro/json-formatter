---
id: ADR-0008
title: Host contract — address parameter, origin-checked messages, system fallback
status: proposed
date: 2026-10-13
supersedes: []
---

## Context
RULE-16 and F-008 define the host contract: the initial theme arrives in the tool's address,
later theme changes arrive as settings messages, the tool sends exactly one message (ready)
and never any content (INV-02), and one deploy-time list of allowed host origins decides both
who may embed the tool and whose messages are accepted (NFR-09). Without a host theme the tool
follows the device preference (F-008.R2, edge cases).

Facts from the portal (repository `taro-kit`):
- The portal is at `https://tarokit.app`; tools are on subdomains, this one at
  `https://json-formatter.tarokit.app` (portal decision record 0001) — same site, different
  origin.
- The frame is `sandbox="allow-scripts allow-same-origin allow-forms"` plus per-tool grants
  from the portal's catalog (this tool: clipboard-write → `allow="clipboard-write"`,
  downloads → `allow-downloads`, file-pick → declarative only), and
  `referrerpolicy="strict-origin"` (portal decision record 0009).
- The portal's theme feature currently lists "passing the theme to tools" as out of scope; the
  user decided (2026-10-13, D-008) that the portal will be changed by a separate change request
  (`.build-my-app/reports/portal-change-request-theme.md`) to append `theme=light|dark` to the
  embedded tool address, post `{ type: "taro:theme", value: "light" | "dark" }` with the
  tool's exact origin as target whenever its theme changes, and answer the tool's ready
  message with the current theme. RULE-16 stays as specified; the device preference is the
  fallback when no parameter is present.

## Decision
1. **Theme resolution**, highest priority first, re-evaluated on every input:
   1. the latest valid settings message from an allowed origin;
   2. the `theme` query parameter (`light` | `dark`) of the tool's address;
   3. the device preference (`prefers-color-scheme`, followed live).
   Unknown values are ignored (keep the current theme). The tool therefore works unchanged
   whether or not the portal ever passes a theme.
2. **No flash** (F-008.AC1): a tiny classic inline script in `<head>` (allowed by its CSP
   hash, ADR-0009) reads the query parameter and the device preference and sets
   `data-theme` on `<html>` before first paint. CSS also carries a `prefers-color-scheme`
   block so the correct theme shows even before that script runs.
3. **Messages** (plain objects; the `taro:` prefix namespaces the portal contract):
   - inbound settings: `{ type: "taro:theme", value: "light" | "dark" }`; unknown types and
     values are ignored (room for future settings); accepted only if `event.origin` is in the
     allow-list **and** `event.source` is `window.parent`; anything else is ignored silently
     (F-008.AC5);
   - outbound ready: `{ type: "taro:ready" }`, sent once after the first render, only when
     embedded (the portal replies with the current theme, covering a change during load),
     with an explicit target origin, never `*`: the allowed origin matching
     `document.referrer` (the portal frames with `referrerpolicy="strict-origin"`), otherwise
     once to each allowed origin (non-matching targets are dropped by the browser).
   - MOD-Host is the only module allowed to call `postMessage` to the parent; a lint rule
     enforces it, and an e2e test asserts the parent receives exactly one message (F-008.AC6).
4. **Allow-list**: one deploy-time setting (`HOST_ORIGINS`, space-separated, e.g.
   `https://tarokit.app` in production; local origins for the e2e stub host) generates both
   the `frame-ancestors` header (ADR-0009) and a compiled-in constant. Empty → `frame-ancestors 'none'`, no message listener, standalone
   only (RULE-16).
5. **Embedded vs standalone**: `window.top !== window.self` (guarded). When embedded, the
   tool's own header is hidden (F-008 UX note). Sizing needs no messages: the layout fills the
   viewport (`100%` height, internal scrolling only, F-008.AC4).

## Alternatives considered
- **MessageChannel handshake** (host transfers a port) — stronger pairing, but more host-side
  code for the portal and still needs the origin check on the first message.
- **Theme via shared storage** (same site) — the tool would read the portal's stored choice
  directly, but couples it to the portal's storage format and is unavailable in partitioned
  contexts; contradicts "the host passes the theme" (RULE-16).
- **`postMessage(…, "*")` for ready** — simplest; leaks nothing (no content), but would
  announce the tool to any embedder; explicit targets cost nothing.
- **Sizing messages** (tool reports content height) — not needed; the host gives a fixed area.

## Consequences
- Works with a portal that does not yet send a theme (device preference) and, without
  redeploying the tool, once the portal change request ships.
- The message shape is shared with the portal change request; a contract test in our e2e
  suite (stub host) and one in the portal's suite keep both sides aligned.
- SP-iframe verifies the frame attributes, referrer value and message behaviour on all three
  engines.

<!-- Accepted ADRs are immutable. Write a new ADR to change a decision. -->
