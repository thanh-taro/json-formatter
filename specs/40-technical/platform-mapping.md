# Platform mapping

How the neutral wording of the specs maps to browser platform features. Targets: latest two
versions of Chromium-based, Gecko-based and WebKit-based desktop browsers (NFR-07), embedded
in the portal's iframe and standalone. "Spike" marks behaviour SP-iframe must confirm.

## Getting content in
| Spec wording | Platform mapping | Notes / fallback |
|---|---|---|
| Type or paste text (F-001.R1) | Editor `contenteditable` input; `paste` event intercepted when clipboard text > 1 MB and routed through the chunked builder | UTF-8 size of pasted text computed by a counting loop over the string (no copy); > 100 MB → COPY-confirm.very_large (F-001.AC11) |
| Drop a file (F-001.R2) | `dragenter`/`dragover`/`drop` on the document; overlay only when `dataTransfer.types` contains `Files`; `dataTransfer.items[i].webkitGetAsEntry()` to detect folders (supported by all three engines); first file only | Text drags inside the editor are left to the editor; non-file drops outside → COPY-error.not_a_file |
| Choose a file (F-001.R3) | Hidden `<input type="file">` (no `accept` filter, so `.txt`/`.log` work) | File System Access (`showOpenFilePicker`) **not used**: Chromium-only and refused in cross-origin frames. The portal's "file-pick" permission is declarative only |
| Read as UTF-8, reject invalid (RULE-13) | In the worker: `file.stream()` piped through `new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })` with `stream: true` | `ignoreBOM: true` keeps the byte-order mark as the first character (RULE-03); a decode `TypeError` → COPY-error.encoding |
| File size / tier (RULE-02) | `File.size` (exact UTF-8 bytes) before reading | |
| Device cannot hold it (F-001.R9) | `RangeError` / allocation failures caught in the worker; worker `error` event as last resort | `navigator.deviceMemory` (Chromium only) not used as a gate |

## Getting content out
| Spec wording | Platform mapping | Notes / fallback |
|---|---|---|
| Copy to clipboard (F-007.R1, F-006.R4/R5) | `navigator.clipboard.write([new ClipboardItem({ "text/plain": promisedBlob })])` created synchronously in the click handler; short strings via `navigator.clipboard.writeText` | Embedded: Chromium needs `allow="clipboard-write"` on the frame (portal grants it); Gecko and WebKit gate by user gesture, not Permissions-Policy. Rejection (`NotAllowedError`) → select all + COPY-error.clipboard (F-007.R3) or read-only selected field (F-006.R9). Large Blob support per engine: spike |
| Download (F-007.R2, RULE-10) | Worker-built `Blob` (`type: application/json`), `URL.createObjectURL`, temporary `<a download="name">` click, revoke after a delay | Embedded: needs sandbox token `allow-downloads` (portal grants it). No reliable "blocked" event in any engine (open issue O-3 in `architecture.md`); `showSaveFilePicker` not used (Chromium-only, refused in cross-origin frames) |
| No network for downloads (F-007.R4) | Object URLs are local; CSP `connect-src 'none'` | e2e asserts zero requests |

## Host integration
| Spec wording | Platform mapping | Notes |
|---|---|---|
| Initial theme in the tool's address (RULE-16) | `URLSearchParams(location.search).get("theme")` read by an inline, CSP-hashed classic script in `<head>` that sets `<html data-theme>` | Before first paint (F-008.AC1) |
| Later settings messages | `window.addEventListener("message")`; accept only `event.origin ∈ allow-list` and `event.source === window.parent`; payload `{ type: "taro:theme", value }` | Unknown values ignored |
| Ready signal | `window.parent.postMessage({ type: "taro:ready" }, origin)` with origin from `document.referrer` if allow-listed, else each allowed origin | Never `"*"`; never content |
| Allowed host origins / who may embed (NFR-09) | Response header `Content-Security-Policy: frame-ancestors https://tarokit.app` (empty list → `'none'`) | Header only (ignored in meta); no `X-Frame-Options` |
| Device light/dark preference (F-008.R2) | `matchMedia("(prefers-color-scheme: dark)")` + `change` listener; CSS `prefers-color-scheme` block; `color-scheme` property | |
| Embedded vs standalone | `window.top !== window.self` (in try/catch) | |
| Fill the host's area (F-008.R3) | `html, body, #app { height: 100% }`, internal scroll containers only; editor and tree observe their own size (`ResizeObserver`) | No sizing messages |

## Privacy & policy
| Spec wording | Platform mapping |
|---|---|
| Content policy forbids outgoing connections (NFR-01) | Header CSP: `default-src 'none'; script-src 'self' 'sha256-…'; style-src 'self'; img-src 'self' data:; font-src 'self'; worker-src 'self'; connect-src 'none'; manifest-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors …` (ADR-0009) |
| No analytics, nothing persisted | No storage APIs used (`localStorage`, IndexedDB, cookies, Cache Storage) — lint rule; optional offline worker (ADR-0012) caches only the tool's own files |
| Other headers | `Permissions-Policy` (clipboard-write self; camera, microphone, geolocation, clipboard-read off), `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Opener-Policy: same-origin` |

## Responsiveness & rendering
| Spec wording | Platform mapping |
|---|---|
| Never block; progress; cancel (NFR-02) | Dedicated module `Worker` (`type: "module"`); time-sliced loops yielding through a `MessageChannel` tick; main-thread slices yield via `scheduler.yield()` where available (Chromium), else a `MessageChannel` tick; progress UI throttled to animation frames |
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
