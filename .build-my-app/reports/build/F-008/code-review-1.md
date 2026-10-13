# Code review 1 — F-008 (host integration) + F-009 (privacy statement)

Branch `worktree-agent-a5c16138f07299daa` vs `main`. Specs: F-008, F-009, RULE-16, NFR-09, ADR-0008, ADR-0009, MOD-Host, MOD-App.

**Verdict: no blockers. 1 major, 6 minor.** Most of it is correct. Theme precedence is message > address > device and is re-resolved on every input. Messages are accepted only when the origin is on the allow-list AND `source === window.parent`. There is one ready signal, guarded by `started`, with explicit targets and never `*`. With an empty allow-list there is no listener. The boot script sets the theme before first paint and the CSS has a `prefers-color-scheme` fallback. The popover is the native one, so Escape and light dismiss work and focus goes back to the badge. Strings come from COPY via `t()` and styling uses tokens. Only MOD-Host posts to the parent.

## Major

### M1 — F-008.AC8 e2e test can pass without testing anything and uses a fixed wait
`tests/e2e/host.spec.ts:754-763`: `page.waitForTimeout(1500)` runs, then the test checks whether the tool rendered. If the tool iframe has not finished loading after 1.5 s (a slow CI engine, or WebKit under load), `rendered` is `false` and the test passes. That happens even if `frame-ancestors` were missing. It also breaks the "no fixed waits" rule.
**Fix:** wait on something definite. Before `goto`, add an init-script listener for the iframe `load` event (it fires for blocked frames too), or poll the admin `/log` until the tool document request from the unlisted page has been served. Then assert that the frame has no `[data-screen]` and that the host received nothing from the tool. A positive control on the allowed origin with the same page shape already exists in other tests.

## Minor

### m1 — No test that a device change leaves a host or address theme alone
`src/host/theme.ts:46-54` is correct, but only the pure `resolveTheme` is unit-tested. In e2e, "device followed live" is only tested with `theme=none` (`host.spec.ts:665`). No test covers embedded `theme=dark` + `emulateMedia({colorScheme:'light'})`, where the tool must stay dark. That is the precedence behaviour most likely to regress (for example, if someone brings back the old `setTheme` on media change).
**Fix:** add that e2e case (address wins). Also add a variant after a `setTheme('light')` message (message wins over device).

### m2 — F-008.AC6 uses a fixed 1 s sleep
`tests/e2e/host.spec.ts:738`: `setTimeout(r, 1000)`. A negative assertion needs some settle time, but a sleep is both slow and arbitrary.
**Fix:** after the interactions, have the host post a final `taro:theme` and poll until the tool's `data-theme` reflects it. That proves the message round-trip has settled, so assert `fromTool` right after.

### m3 — AC6 and AC7 only cover what is built so far
`host.spec.ts:723-752`: "every M-1 feature" is currently theme, resize, privacy, and "Open file" enabled. That is fine while F-008 is `building`. F-008 must not move to `done` until these two tests cover load, beautify, minify, tree, copy, download and find.
**Fix:** track this as a follow-up in state, or add a TODO tied to F-001…F-010. AC2's "without losing the document" is currently shown only by a window marker. Once the editor exists, add typed content and check it survives the theme change.

### m4 — Dead attributes
`src/host/boot.js:11,14` still sets `data-theme-source`, but nothing reads it any more (`theme.ts` no longer checks it). `src/host/index.ts:37` sets `data-embedded`, but no CSS or code uses it. The tool has no header to hide yet.
**Fix:** drop `data-theme-source` from the boot script; this also changes its CSP hash, which is regenerated. Either remove `data-embedded` or keep it with a comment naming its future consumer.

### m5 — Hand-built `aria-expanded` state duplicates what the browser does
`src/app/components/StatusBar.tsx:28-35,44-46`: the `toggle` listener, `useState` and `aria-expanded`/`aria-controls` repeat what a `popovertarget` invoker already exposes to assistive tech in all three engines. The only other use is the `[aria-expanded='true']` style.
**Fix:** delete the effect and state, and style with `.tk-statusbar__privacy:has(+ * + .tk-privacy:popover-open)` (or reorder siblings). The tests can assert `dialog` visibility instead of the attribute. This is optional, but it removes the only stateful code in this component.

### m6 — statusbar.css redefines the shell grid
`src/app/styles/statusbar.css:7-12` sets `.tk-formatter { grid-template-rows: … }` under `pointer: coarse`, a second copy of the shell layout from `shell.css:5`. If a row is added to the shell later (notice bar, issue panel), the two copies drift apart on touch devices.
**Fix:** make `shell.css` use `var(--tk-statusbar-height)` for the last row, and keep only the custom-property override in statusbar.css.

### m7 — e2e server rewrites the production JS bundle instead of building with the e2e origins
`tests/e2e/server.mjs:55-63,102`: string literals for the deployed origins are regex-replaced inside the served `.js`. This depends on minifier output (a different quote style or a split literal would silently skip the rewrite, and then every embedded test fails confusingly). ADR-0008 §4 instead foresees setting `HOST_ORIGINS` to local origins for the e2e stub host.
**Fix:** acceptable as-is if keeping one production artifact matters. If so, have the server fail at startup when no literal was replaced (assert the replacement count is > 0). Otherwise, build the e2e artifact with `HOST_ORIGINS=http://localhost:4174`.

## Checked, no finding
- ready: sent after the first render (rAF + task), once, targeting the referrer origin if it is allow-listed, otherwise each allowed origin. Unit tests cover the referrer, unlisted, empty and garbage cases.
- AC5: unit tests cover origin lookalikes, `null`, a non-parent source and an empty list. e2e has a real sibling frame on an unlisted origin posting via `parent.frames`, with proof that the message arrived.
- AC1: first-frame instrumentation on a light device with `theme=dark`, with zero CSP violations.
- AC4: four sizes including 360 px, checking no root scroll and that the shell exactly fills the area.
- F-009 AC1/AC2 and the narrow edge case: the badge, the dialog's accessible name and text, all dismissal paths (close, Escape with focus return, re-toggle, light dismiss), axe in both themes, and an icon-only name at 390 px.
- Lint: `no-restricted-syntax` on `parent.postMessage` outside `src/host/**` (already on main).
- DEP-11 (lucide-static) is approved; its notice was added; only the 2 SVGs used are inlined.
