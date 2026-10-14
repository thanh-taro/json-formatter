# Portal embedding check: theme hand-off (2026-10-14)

Manual item 5 (traceability.md), local part. Covers F-008.R1/R2/R4/R5 on this side and taro-kit F-012.R5/R6 on the portal side.

## Setup
- **Portal:** the taro-kit production build (`taro-kit/dist`, built with its F-003/F-012 wave 2, commit 40b1ac5 or later). Its `/t/sample-dev/` tool view was retargeted at `https://json-formatter.tarokit.app`: the tool URL, the meta CSP `frame-src` and the island props. Its `_headers` `clipboard-write` was set to what the portal emits once the tool is visible.
- **Tool:** this repo's production build (`dist/`, `HOST_ORIGINS=https://tarokit.app`) with its generated `_headers`.
- **Serving:** both are served on their real https origins via Playwright request routing. Service workers are blocked so routing sees every request. The portal starts in dark (device dark, theme `system`).
- **Script:** `portal-embedding-check.mjs` (paths are absolute to this Mac). Run it with `node .build-my-app/reports/qa/portal-embedding-check.mjs`.

## Result: 20/20 passed (Chromium and WebKit, 10 checks each)
| Check | Spec | Chromium | WebKit |
|---|---|---|---|
| Frame `src` is `https://json-formatter.tarokit.app/?theme=dark` | F-012.AC5, F-008.R2 | pass | pass |
| Tool loads in the portal frame (no frame-ancestors or CSP refusal) | F-008, ADR-0008 | pass | pass |
| Tool shows dark | F-008.R2 | pass | pass |
| `taro:ready` answered with `{type:'taro:theme', value:'dark'}` from `https://tarokit.app` | F-012.AC7, F-008.R5 | pass | pass |
| Portal toggle to light: tool shows light | F-012.AC6, F-008.R1 | pass | pass |
| …without reloading (window marker kept) | F-012.AC6 | pass | pass |
| Toggle back to dark: tool follows | F-012.AC6 | pass | pass |
| Only `taro:theme` messages reach the tool | F-012.R5, INV-02 | pass | pass |
| Beautify works inside the frame | FLOW-01 (smoke) | pass | pass |
| No CSP or framing errors in the console | NFR-09 | pass | pass |

An earlier run showed two WebKit console errors, "Refused to apply a stylesheet…", one in each frame. Their only cause is Playwright's screenshot step, which injects a style into every frame. With the screenshot turned off, both frames are clean. Neither app is affected.

## Still open (manual item 5, live)
- On the deployed sites, after the tool is visible in the portal (release checklist G): toggle the portal theme, resize, run FLOW-01, and confirm Copy works. Copy in the portal needs the portal's Permissions-Policy, which delegates `clipboard-write` only to visible tools.
- Safari and Firefox on real devices (manual item 1).
