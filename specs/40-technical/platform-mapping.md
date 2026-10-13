# Platform mapping

How the neutral wording of the specs maps to browser platform features. Targets: latest two
versions of Chromium-based, Gecko-based and WebKit-based desktop browsers (NFR-07), embedded
in the portal's iframe and standalone. Behaviour was confirmed by SP-iframe and SP-editor
(`.build-my-app/reports/spike-iframe.md`, `spike-editor.md`) on Chromium, Gecko and WebKit
unless noted; "manual" marks checks left for the real-Safari pass.

## Getting content in
| Spec wording | Platform mapping | Notes / fallback |
|---|---|---|
| Type or paste text (F-001.R1) | Editor `contenteditable` input; `paste` event intercepted when clipboard text > 1 MB and routed through the chunked builder | UTF-8 size of pasted text computed by a counting loop over the string (no copy); > 100 MB → COPY-confirm.very_large (F-001.AC11) |
| Drop a file (F-001.R2) | `dragenter`/`dragover`/`drop` on the document; overlay only when `dataTransfer.types` contains `Files`; `dataTransfer.items[i].webkitGetAsEntry()` to detect folders (supported by all three engines); first file only | Text drags inside the editor are left to the editor; non-file drops outside → COPY-error.not_a_file. Handler verified in the sandboxed frame on all engines; real OS folder drag: manual |
| Choose a file (F-001.R3) | Hidden `<input type="file">` (no `accept` filter, so `.txt`/`.log` work) | File System Access (`showOpenFilePicker`) **not used**: Chromium-only and refused in cross-origin frames. The portal's "file-pick" permission is declarative only |
| Read as UTF-8, reject invalid (RULE-13) | In the worker: `file.stream()` piped through `new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })` with `stream: true` | `ignoreBOM: true` keeps the byte-order mark as the first character (RULE-03); a decode `TypeError` → COPY-error.encoding |
| File size / tier (RULE-02) | `File.size` (exact UTF-8 bytes) before reading | |
| Device cannot hold it (F-001.R9) | `RangeError` / allocation failures caught in the worker; worker `error` event as last resort | `navigator.deviceMemory` (Chromium only) not used as a gate |

## Getting content out
| Spec wording | Platform mapping | Notes / fallback |
|---|---|---|
| Copy to clipboard (F-007.R1, F-006.R4/R5) | `navigator.clipboard.write([new ClipboardItem({ "text/plain": promisedBlob })])` created synchronously in the click handler; short strings via `navigator.clipboard.writeText` | Embedded: Chromium needs `allow="clipboard-write"` on the frame (portal grants it) and decides the permission by the top-level origin; Gecko ignores that attribute and never refuses; WebKit gates by user gesture (manual check). Rejection (`NotAllowedError`) → select all + COPY-error.clipboard (F-007.R3) or read-only selected field (F-006.R9); tests force the failure because Gecko cannot produce it. 100 MB promised Blob: exact in Chromium (277 ms) and Gecko (341–449 ms); WebKit manual |
| Download (F-007.R2, RULE-10) | Worker-built `Blob` (`type: application/json`), `URL.createObjectURL`, temporary `<a download="name">` click, revoke after a delay | Embedded: needs sandbox token `allow-downloads` (portal grants it). Without it all three engines block silently (no exception or event), so there is no "blocked" path (F-007.R5 deprecated, D-023); `showSaveFilePicker` not used (Chromium-only, refused in cross-origin frames) |
| No network for downloads (F-007.R4) | Object URLs are local; CSP `connect-src 'none'` | e2e asserts zero requests |

## Host integration
| Spec wording | Platform mapping | Notes |
|---|---|---|
| Initial theme in the tool's address (RULE-16) | `URLSearchParams(location.search).get("theme")` read by an inline, CSP-hashed classic script in `<head>` that sets `<html data-theme>` | Before first paint (F-008.AC1) |
| Later settings messages | `window.addEventListener("message")`; accept only `event.origin ∈ allow-list` and `event.source === window.parent`; payload `{ type: "taro:theme", value }` | Unknown values ignored. A sibling frame can reach the tool via `parent.frames`; both checks reject it |
| Ready signal | `window.parent.postMessage({ type: "taro:ready" }, origin)` with origin from `document.referrer` if allow-listed, else each allowed origin | Never `"*"`; never content |
| Allowed host origins / who may embed (NFR-09) | Response header `Content-Security-Policy: frame-ancestors https://tarokit.app` (empty list → `'none'`) | Header only (ignored in meta); no `X-Frame-Options` |
| Device light/dark preference (F-008.R2) | `matchMedia("(prefers-color-scheme: dark)")` + `change` listener; CSS `prefers-color-scheme` block; `color-scheme` property | |
| Embedded vs standalone | `window.top !== window.self` (in try/catch) | |
| Fill the host's area (F-008.R3) | `html, body, #app { height: 100% }`, internal scroll containers only; editor and tree observe their own size (`ResizeObserver`) | No sizing messages |

## Privacy & policy
| Spec wording | Platform mapping |
|---|---|
| Content policy forbids outgoing connections (NFR-01) | Header CSP: `default-src 'none'; script-src 'self' 'sha256-…'; style-src 'self'; img-src 'self' data:; font-src 'self'; worker-src 'self'; connect-src 'none'; manifest-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors …` (ADR-0009). Consequences: no `<style>` elements or `style=""` attributes (constructable stylesheets and CSSOM writes only; editor in a shadow root), no `blob:` workers, no WebAssembly, no `eval` |
| No requests after load, except the browser's own offline-cache fetches (NFR-01, D-021) | Measured with a server-side request log. Chromium and Gecko: 0 requests. WebKit: the service worker's seeding fetches and the browser's `/sw.js` update check (~1 s after each load) — the allowed exception |
| No analytics, nothing persisted | No storage APIs used (`localStorage`, IndexedDB, cookies) — lint rule; the one exception is Cache Storage, written only by `/sw.js` with the tool's own files (ADR-0012) |
| Other headers | `Permissions-Policy` (clipboard-write self; camera, microphone, geolocation, clipboard-read off), `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Opener-Policy: same-origin`; `/sw.js`: `! Content-Security-Policy`, its own CSP (`connect-src 'self'`), `Cache-Control: max-age=86400` |

## Offline (F-011)
| Spec wording | Platform mapping | Notes |
|---|---|---|
| Works offline after one visit (F-011.R1) | `navigator.serviceWorker.register("/sw.js", { updateViaCache: "all" })` after first render; page posts its loaded same-origin URLs; worker stores `fetch(url, { cache: "force-cache" })` in Cache Storage | Served from the HTTP cache (0 requests) in Chromium and Gecko; WebKit re-fetches (~4 requests, D-021). Registration is permitted in the frame (`allow-same-origin`); failure → online-only |
| Checks for a new version only while opening (F-011.R2/R3) | HTML network-first with offline fallback; hashed assets cache-first; prune old assets per navigation; no `skipWaiting`, no reload | Offline tests refuse connections at the server; Playwright WebKit `setOffline` gives false failures |

## Responsiveness & rendering
| Spec wording | Platform mapping |
|---|---|
| Never block; progress; cancel (NFR-02) | Dedicated module `Worker` (`type: "module"`, same-origin file); time-sliced loops (16 ms / 1 MB) yielding through a `MessageChannel` tick; main-thread slices yield via `scheduler.yield()` where available (Chromium), else a `MessageChannel` tick; progress UI throttled to animation frames; 1 s watchdog restarts a worker that dies silently (WebKit) |
| Typing in very long lines (NFR-02) | `beforeinput` (`insertText`, not composing) on lines ≥ 100,000 characters handled by the editor integration, DOM edit prevented | IME composition keeps the browser path |
| Find in virtualized text (F-010) | Own panel and engine over the editor `Text` (browser find cannot see virtualized lines); platform find shortcut (`Mod-F`) bound while the editor has focus | |
| Hide the text view while the tree is shown | `visibility:hidden` + `inert`, never `display:none` (a hidden CodeMirror view renders every line on a full replace) | |
| Move data between threads | Strings for bounded chunks (copied); `Blob` for exports (handle only); transferable `ArrayBuffer`s for typed arrays |
| Frame budget (NFR-04) | Measured by a `requestAnimationFrame` gap probe (all engines) and Long Animation Frames entries (Chromium) |
| Narrow widths (NFR-07) | CSS container queries collapse toolbar groups into a `popover` menu (COPY-action.more) |

## Accessibility (NFR-06)
| Spec wording | Platform mapping |
|---|---|
| Status changes announced | `role="status"` (polite live region) for validity; errors announced once per new error |
| Dialogs and popovers | Native `<dialog>` (very-large confirmation), `popover` attribute (privacy details, overflow menu) — focus management built in |
| Toolbar, tree keyboard models | WAI-ARIA APG patterns: `role="toolbar"` with roving `tabindex`; `role="tree"`/`treeitem` with `aria-level`, `aria-setsize`, `aria-posinset`, `aria-expanded` |
| Leave the editor by keyboard | Tab is not captured by default; documented Escape-then-Tab path (CMP-Editor) |
| Reduced motion | `prefers-reduced-motion` disables non-opacity transitions (portal style) |
