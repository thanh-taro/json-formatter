# Spike SP-iframe: embedding, clipboard, drop, download, theme, CSP, offline (2026-10-13)

Branch `spike/iframe`. Code: `spikes/iframe/` (throw-away). Time used: about 3 h of the 1-day box.
Gates: ADR-0008, ADR-0009, ADR-0012 (and F-007, F-008, F-011, NFR-01, NFR-09).

**Decision: ADAPT.** ADR-0008 can be accepted as written. ADR-0009 can be accepted with four
notes. ADR-0012 needs changes before it is accepted (seeding and update checks). F-007 R5/AC6
needs a spec change. Every pass criterion was met in Playwright on all three engines except two:
- **WebKit with a service worker**: a request for the worker script follows each load.
- **Downloads blocked by the sandbox**: no engine lets the page detect this. That is documented
  under O-3 and confirmed here.

The real-Safari pass and the WebKit clipboard checks are still to be done by hand (see Not covered).

## Setup
- Reference machine: Apple M3, 16 GB, macOS 27.0.1, Node 24.19.0, Playwright 1.62.1.
- **Chromium** 151.0.7922.34 (Playwright headless shell).
- **Firefox** 157.0.1: the stock browser, driven over WebDriver BiDi (`channel: 'moz-firefox'`). See "Surprises" for why.
- **WebKit** 26.5 (Playwright build 2336).
- `server.mjs` serves five local origins:
  - **Tool** `http://localhost:4200`: sends the ADR-0009 headers generated as a Cloudflare-syntax `_headers` file, with Cloudflare merge semantics emulated: duplicate headers are joined with `, `, and `! Name` removes one.
  - **Stub portal** `http://localhost:4100`.
  - **Unlisted same-site origin** `http://localhost:4300`.
  - **Unlisted cross-site origin** `http://127.0.0.1:4301`.
  - **Admin port** `:4999`. It holds a request log for the tool origin, keyed by time, and a switch that refuses the tool origin's connections to emulate "no connection".
- Localhost ports are same-site but cross-origin, which is exactly how the portal and the tool relate in production (`tarokit.app` and `json-formatter.tarokit.app`).
- The stub portal frames the tool exactly as the portal does:
  `sandbox="allow-scripts allow-same-origin allow-forms allow-downloads" allow="clipboard-write" referrerpolicy="strict-origin"`.
  It has three variants: `nodl` (without `allow-downloads`), `noclip` (without `allow`) and `none`.
  It replies to `taro:ready` with the current theme, as the portal change request specifies.
- The CSP is ADR-0009's verbatim, with `frame-ancestors http://localhost:4100` and a hashed inline boot script.
  One extra inline script hash covers the spike's rAF paint probe. That probe is instrumentation only.

Run it with `cd spikes/iframe && pnpm install && SERVER_ONLY=1 npx playwright test && node summarize.mjs`.
Final run: **67 passed, 2 skipped (WebKit clipboard), 0 failed**, in 4.4 min (`spikes/iframe/results/run.log`).

## Result matrix (final run)

| Check | Chromium 151 | Firefox 157 | WebKit 26.5 | Pass? |
|---|---|---|---|---|
| `?theme=dark`, device light, **boot script**: light frames seen | 0 (screencast: 8 host frames, then 35 dark; 44 screenshot samples; 73 rAF frames all dark) | 0 (165 screenshot samples: host, then dark; rAF: 17 frames before CSS applies, then 73 dark) | 0 (240 rAF frames dark from the first, at t=326 ms) | yes |
| Same, **negative control** (no boot script) | flash: 36 light screencast frames; light until 1508 ms | flash: 148 light samples; light until 1521 ms | flash: 240 light rAF frames | probe is sensitive |
| Standalone, device dark → dark, no message sent | dark, `embedded=false`, nothing sent; follows a live device switch | light device pinned by pref → light (no emulation over BiDi) | dark; follows a live switch | yes |
| `taro:theme` from parent + allowed origin applied without reload | yes | yes | yes | yes |
| Ignored: value `blue`, unknown type, string payload, unlisted sibling frame (`:4300` via `parent.frames['tool']`), wrong `targetOrigin` | all ignored; the sibling's message reached the listener and was rejected (`fromParent=false`, origin not allowed); the wrong-target message was dropped by the browser | same | same | yes |
| Outbound messages over a whole session (theme ×2, file input, copy, download, resize, 3 s idle) | exactly 1: `{type:"taro:ready"}` | 1 | 1 | yes |
| `document.referrer` / ready target | `http://localhost:4100/` / `[http://localhost:4100]` | same | same | yes |
| Requests to the tool origin after load (same session) | 0 | 0 | 0 | yes |
| CSP violations, normal use (with and without Trusted Types enforcement) | 0 | 0 | 0 | yes |
| Resize 360×400, 800×500, 1280×800, 320×240: document scroll size equals client size, inner area scrolls, header hidden | yes | yes | yes | yes |
| Copy small, `allow="clipboard-write"` | ok, 14 ms; host paste equals the document | ok, 1 ms; paste equal | not run (see Not covered) | yes (2/3) |
| Copy 100 MB, `ClipboardItem` with a promised Blob | ok, 277 ms; read-back length 104,857,662 (exact) | ok, 341–449 ms | not run | yes (2/3) |
| Copy 100 MB, `writeText` | ok, 134 ms; read-back exact | ok, 355–571 ms | not run | n/a |
| Copy **without** `clipboard-write` | `NotAllowedError` (permissions policy) within 1 ms → COPY-error.clipboard shown, whole document selected (0..len, focused) | **copy still works**: Firefox does not apply this permissions-policy feature | not run | fallback ok where it can happen |
| Download with `allow-downloads` | `orders.json`, exact content, 0 requests | same | same | yes |
| Download **without** `allow-downloads` | blocked silently: no exception, no event, nothing in the page console | blocked silently | blocked; browser console only: "Not allowed to download due to sandboxing" | undetectable (O-3 confirmed) |
| `showSaveFilePicker` in the frame | `SecurityError: Cross origin sub frames aren't allowed to show a file picker` | n/a (no API) | n/a | n/a (not used) |
| File input (`setInputFiles`, 2 files) in the sandboxed frame | names, sizes and bytes correct | same | same | yes |
| Drop, synthetic `DataTransfer` (2 files; text) | files and text received | same (+ `webkitGetAsEntry` entries) | same (+ entries) | yes (handler) |
| Drop, **trusted** browser-level (CDP `Input.dispatchDragEvent`) | 1 file, 2 files and text received with `isTrusted=true`, entry `isDir=false`; folder: no event (CDP cannot carry a directory) | n/a | n/a | yes, except folder (manual) |
| Framed by unlisted same-site origin | refused (`chrome-error://`, console: `frame-ancestors`); tool script never ran; 0 messages | refused (`about:neterror?e=cspBlocked`) | refused ("does not appear in the frame-ancestors directive") | yes |
| Framed by unlisted cross-site origin | refused | refused | refused | yes |
| Nested: allowed host → unlisted → tool | refused | refused | refused | yes |

In every refusal case the tool's document was still requested once (`dest=iframe`). The browser
blocks it after reading the header. That is expected and carries no user content.

### CSP probes (`?probe=1`, informational, identical in all three engines)

| Probe | Result under the ADR-0009 CSP | Under + `require-trusted-types-for 'script'` |
|---|---|---|
| `fetch` / XHR to own origin (`connect-src 'none'`) | blocked, violation reported | blocked |
| `eval`, `new Function` | blocked | blocked |
| `WebAssembly.compile` | **blocked** (`script-src` lacks `'wasm-unsafe-eval'`) | blocked |
| Constructable stylesheet (`adoptedStyleSheets`) | **allowed** | allowed |
| `<style>` element / `style=""` attribute | **blocked** / **blocked** | blocked |
| CSSOM `el.style.x = …` | allowed | allowed |
| `new Worker('/assets/worker.js', {type:'module'})` | allowed | **blocked** (needs a TrustedScriptURL policy) |
| `new Worker(blob:)` | **blocked** (`worker-src 'self'`) | blocked |
| `fetch` inside the module worker | blocked: the worker gets the `/assets/*` CSP, which is the page policy | blocked |
| `innerHTML = string` | allowed | **blocked** |
| `data:` image | allowed | allowed |

### Service worker / offline (ADR-0012, F-011)

Offline was emulated by refusing all connections to the tool origin while the portal page stays
loaded. The tool frame is then re-navigated to a new URL, and a reload only counts if the new
document becomes ready.

| Mode | Chromium | Firefox | WebKit |
|---|---|---|---|
| `1`: ADR-0012 as written (cache-on-fetch only) | offline after visit 1: **fails**; after a 2nd online visit: ok. On visit 2, `/sw.js` is checked 1.5 s after load | fails / ok; `/sw.js` checked 1.1 s after load | fails / ok; on visit 2 the worker **re-downloads** css and js, then `/sw.js` 1.0 s after load |
| `seed`: after first render the page posts its already-loaded URLs; the worker reads them with `fetch(u, {cache:'force-cache'})` | offline after **1** visit: ok; seeding made **0** network requests (served from the HTTP cache, including the `no-cache` HTML); `/sw.js` checked 1.5 s after the next load | ok; 0 requests; `/sw.js` 1.0 s after the next load | ok, but seeding made **4 network requests** (WebKit's worker fetch does not use the page's HTTP cache); `/sw.js` checked about 0.6 s after load |
| `seedcached`: `seed` + `register(…, {updateViaCache:'all'})` + `sw.js` served with `Cache-Control: max-age=86400` | ok after 1 visit; **0 requests after load on every visit** | **same, 0** | ok, but 4 seeding requests and a worker-script check about 1 s after every load (ignores `updateViaCache`) |
| `inherit`: worker script served with the page CSP joined in (what a naive `_headers` produces) | seeding fails (`TypeError`), **visit 2 does not load even online** (the worker's `fetch` is blocked) | seeding fails; online loads bypass the worker; offline fails | seeding fails; visit 2 fails |

The `inherit` failure would remain until the worker script is replaced. That makes
**`! Content-Security-Policy` on the `/sw.js` rule mandatory** under Cloudflare's merge semantics.

## Surprises
1. **Playwright's patched Firefox is killed with SIGTERM at launch on this Mac.** This happened with
   Firefox 142 (Playwright 1.56) and 153 (Playwright 1.62), headed or headless, and even when the
   binary was run by hand. The cause is local, probably macOS 27 or an endpoint policy. Stock
   Firefox 157 over WebDriver BiDi worked. BiDi has two gaps:
   - no `colorScheme` emulation, so the device preference was pinned with the `ui.systemUsesDarkTheme` pref;
   - `page.screenshot` injects a `<style>`, which a strict CSP reports as violations from `… > eval`.

   The tests filter those harness violations and count them separately (0 app violations).
   WebKit screenshots inject the same style, so WebKit uses the rAF probe only.
   **ADR-0010 implication**: CI on Linux is unaffected, but local e2e runs on macOS may need the
   `moz-firefox` BiDi channel.
2. **Chromium permission delegation.** In Chromium, a frame's clipboard permission is decided by the
   top-level (portal) origin. Playwright has to grant `clipboard-write` to the *embedder*; real
   Chrome auto-grants it on a user gesture. The `allow="clipboard-write"` attribute is still
   required: without it Chromium refuses with a permissions-policy error.
3. **Firefox ignores `allow="clipboard-write"`.** Copy works without it, so COPY-error.clipboard
   cannot be triggered in Firefox by the frame attributes.
4. **Download blocking is invisible to the page in all three engines.** There is no exception, no
   event, and the frame stays put. WebKit only logs to its own console.
5. **ADR-0012's "one complete visit makes the tool work offline" is false for cache-on-fetch.** The
   first visit is not controlled by the worker, so nothing gets cached. Reading the page's own
   resources from the HTTP cache with `force-cache` fixes this at zero network cost in Chromium and
   Firefox. This works even for the `no-cache` HTML.
6. **Browsers check the worker script for updates shortly after each navigation (0.6–1.5 s after
   load).** Under NFR-01's literal measure, that check is a "request after load". Chromium and
   Firefox let `updateViaCache:'all'` with a max-age avoid it. WebKit does not.
7. **The iframe is transparent until the tool's CSS applies.** Firefox runs about 17 rAF frames
   with a transparent background, and all engines show the portal background first. That is
   correct (no wrong-theme frame), but it relies on the portal background matching the theme it
   passes.
8. **Trusted Types work in all three engines, but `new Worker(url)` becomes a TT sink.** The worker
   URL needs a policy (`trustedTypes.createPolicy`).

## Recommendations

### ADR-0008: accept as written
- The message contract, origin check, `event.source === window.parent` and the
  ready-to-referrer-origin target all behave the same in every engine.
- The `source` check matters: a sibling frame from an unlisted origin *can* reach the tool's window
  through `parent.frames`. The origin check alone also rejected it.
- Final frame snippet for the portal catalog, verified here:
  ```html
  <iframe src="https://json-formatter.tarokit.app/?theme=dark" title="JSON Formatter"
          sandbox="allow-scripts allow-same-origin allow-forms allow-downloads"
          allow="clipboard-write" referrerpolicy="strict-origin"></iframe>
  ```
  The portal posts `{type:"taro:theme", value}` with target `https://json-formatter.tarokit.app`.
  It answers `taro:ready` only if `event.origin` matches and `event.source === frame.contentWindow`.
  Its page background must match the theme it passes (Surprise 7).

### ADR-0009: accept, adding these notes
1. **Editor styling.** `style-src 'self'` blocks `<style>` elements and `style=""` attributes, but
   allows `adoptedStyleSheets` and CSSOM property writes. The editor engine must inject styles via
   constructable stylesheets. SP-editor must assert zero `style-src-*` violations with the real
   CodeMirror/Monaco.
2. **Workers.** `worker-src 'self'` blocks `blob:` workers, so every worker must be a same-origin
   file. This rules out Monaco's default blob-worker loader unless it is configured. Module workers
   inherit the page CSP from `/assets/*` (`connect-src 'none'`), which is correct.
3. **WebAssembly is blocked.** If ADR-0005 wants WASM, add `'wasm-unsafe-eval'` explicitly with a
   rationale. Otherwise, record "no WASM".
4. **`_headers`.** Any path-specific CSP (`/sw.js`) must start with `! Content-Security-Policy`.
   Without that line Cloudflare joins the two policies and the stricter one wins. Add a header test
   for each path.
5. Trusted Types: feasible. Defer until SP-editor confirms that the editor and Preact work under it.
   It needs a TT policy for the worker URL.

### ADR-0012: adapt, then needs the user's offline decision
Replace "cache-on-fetch only" with the `seedcached` design:
- After first render, the page sends its own loaded same-origin URLs (document and `/assets/*`).
- The worker stores them by reading `fetch(u, {cache:'force-cache'})`.
- At runtime, the HTML is network-first and hashed assets are cache-first.
- `register('/sw.js', {updateViaCache:'all'})`, and `/sw.js` gets `Cache-Control: max-age=86400` plus its own CSP (`connect-src 'self'`) through `!`.
- Old assets are pruned on each navigation rather than in `activate`.
- New versions still arrive on the next online open, through the network-first HTML.

Result: offline after **one** visit and zero requests after load, in Chromium and Firefox.

**WebKit cannot meet NFR-01's literal measure with any service worker.** It re-fetches during
seeding and checks the worker script about 1 s after every load. The user must choose one of:
- (a) amend NFR-01 to exclude the browser's own worker install and update fetches of the tool's
  own files (they carry no user content);
- (b) skip the worker on WebKit;
- (c) drop offline support for M-1.

### Spec notes (not changed here; specs/ untouched)
- **F-007 R5 / AC6**: no engine reports a sandbox download block, so AC6 can never be triggered
  through the frame attributes. Two options:
  - narrow R5 to "if creating the download throws" and test that by injecting a failure;
  - or move AC6 to a documented limitation (O-3).

  The portal grants `allow-downloads`, so this is low risk.
- **F-007 AC4/AC7** can be exercised only in Chromium (and probably WebKit) through the missing
  `clipboard-write` grant. Firefox never fails, so the tests should force the failure.
- **F-008**: all of AC1–AC6 and AC8 are verified on three engines. AC1 is verified with a negative
  control. AC4 is verified down to 320×240.
- **F-011**: R1 ("after one complete visit") is achievable only with seeding (above). R2 depends on
  the NFR-01 decision.
- **NFR-01 test design**: measure with a server-side request log, not only the browser's network
  events. Under Playwright, WebKit's `setOffline` also blocks the worker's cache responses, a false
  "offline broken" result, so emulate offline by refusing connections at the server
  (`results/webkit-sw-setOffline-run.ndjson`).

## Not covered (manual follow-ups)
- **Real Safari pass**: not done. `safaridriver` needs a one-time `sudo safaridriver --enable`.
  Checks to run there:
  - WebKit clipboard: small copy, 100 MB promised `ClipboardItem`, and the failure without `clipboard-write`;
  - real OS drag of a file, several files and a folder;
  - first paint by eye.
- **WebKit clipboard in Playwright was skipped deliberately.** On macOS it may write the user's
  real pasteboard.
- **Folder drop in all engines and real OS file drags in Firefox and WebKit**: the synthetic and
  CDP events cover the handler only.
- **Cloudflare `_headers` merge semantics** were emulated from the documented behaviour. They need
  to be confirmed on the first real deploy (post-deploy header smoke test, ADR-0009).

## Evidence
- `spikes/iframe/tests/iframe.spec.ts`: all checks. `spikes/iframe/tests/helpers.ts`: request log and pixel classifier.
- `spikes/iframe/results/run.log`: final run (67 passed, 2 skipped). `results/report.json`: Playwright JSON.
- `spikes/iframe/results/facts.ndjson`: every observation, per engine. `results/summary.txt` (`node summarize.mjs`): digest used for the tables.
- `spikes/iframe/results/webkit-sw-setOffline-run.ndjson`: the misleading WebKit `setOffline` run.
- `spikes/iframe/tool/_headers`: the generated header file, including the `! Content-Security-Policy` detach for `/sw.js`.
- Console proof of frame-ancestors refusals (from `facts.ndjson`):
  - Chromium: `Framing 'http://localhost:4200/' violates … "frame-ancestors http://localhost:4100"`
  - Firefox: `blocked … (frame-ancestors)`
  - WebKit: `Refused to load … does not appear in the frame-ancestors directive`
