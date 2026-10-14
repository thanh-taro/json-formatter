# Privacy declarations — JSON Formatter (M-1)

Source of truth: PRN-01, INV-02, NFR-01 (+D-021, D-028), F-008.R5, F-009, F-011. Verified by
the QA security audit (`.build-my-app/reports/qa/security.md`, 2026-10-14). Wording reuses
COPY-privacy.details so the UI, catalog and README say the same thing.

## 1. Portal catalog / store-style declaration

**Data collection: Data not collected.**

| Question (App Store / Play Data safety style) | Answer |
|---|---|
| Does the tool collect or share any user data? | **No.** |
| Data types collected (contact info, identifiers, usage data, diagnostics, location, financial, health, user content, browsing history, …) | **None.** |
| Data shared with third parties | **None.** No third-party code, SDKs, fonts or requests. |
| Data linked to the user / used for tracking | **No.** No accounts, cookies, device identifiers or fingerprinting. |
| Analytics, telemetry, crash reporting | **None.** |
| Is data encrypted in transit? | The tool's own files are served over HTTPS only (HSTS). User content never travels, so it is never in transit. |
| Can users request deletion? | Not applicable: nothing is retained. Closing the page discards the document. |
| Storage on the device | Document content is **not** stored. The browser's offline cache holds only the tool's own program files (HTML, JavaScript, styles, fonts), which lets the tool open without a connection. |
| Network use after loading | None of its own. The only exception: the browser may fetch or re-check the tool's own program files for the offline cache. Those requests never contain user content. |
| Communication with the host portal | One "ready" signal with no content. The portal can send the light or dark theme. |
| Permissions requested | Write to clipboard (only when the user presses Copy). The tool never reads the clipboard; pasting uses the browser's normal paste. No camera, microphone, location, notifications or other permissions. |
| Files | Files the user opens or drops are read locally in the browser. Downloads are created on the device and never uploaded. |

Short catalog blurb (≤ 160 chars):
> Runs entirely in your browser. Your JSON is never uploaded, logged, or stored; no analytics, no cookies. Works offline after one visit.

Catalog flags: `collects-data: false`, `analytics: false`, `third-party-requests: false`,
`offline-capable: true`, `permissions: [clipboard-write]`, `storage: offline cache of app files
only`.

## 2. README / release-notes privacy note

> **Privacy.** JSON Formatter runs entirely in your browser. Your JSON is never uploaded,
> logged, or stored, and the tool sends no analytics. It has no cookies, no accounts and no
> third-party code. Its content security policy forbids it from making network connections,
> so documents you paste, open or drop stay in the page's memory and are discarded when you
> close it.
>
> To work offline, the browser keeps a copy of the tool's own program files (never your
> data). It may re-check those files when you open the tool. When embedded in the taro-kit
> portal, the tool only tells the portal that it is ready and receives the light or dark
> theme. It never shares your document. Copy writes to your clipboard only when you press
> Copy, and downloads are created on your device.
>
> One caveat outside our control: browser extensions and your browser's own features, such as
> automatic page translation, can see page content. The tool marks document text as "do not
> translate". If you handle secrets, use a browser profile without untrusted extensions.

Release-note line for M-1:
> Privacy: no data collected. Content never leaves the browser (enforced by `connect-src 'none'`), no analytics or cookies, offline cache holds app files only.

## 3. Conditions for these statements

These statements hold for the audited build. Re-check them before each release:
- **"Does not translate" claim:** QA finding MJ-2 must be fixed (`translate="no"` on the tree
  view) before publishing the README caveat as written. Until then, drop the sentence "The
  tool marks document text as 'do not translate'".
- **"Policy forbids network connections":** depends on the production headers being served as
  generated. QA finding MJ-1 (post-deploy header smoke test) confirms it.
- **Dependency changes:** any new runtime dependency must be re-checked for network, storage
  and telemetry use (ADR-0001, `specs/40-technical/dependencies.md`).
