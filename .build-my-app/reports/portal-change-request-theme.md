# Change request for the taro-kit portal — pass the theme to embedded tools

Requested by: JSON Formatter (json-formatter.tarokit.app), decision D-008 (2026-10-13).
Apply in the taro-kit project with `/build-my-app:change` (it goes through its spec first).

## Why
Embedded tools should match the portal's theme without a flash of the wrong theme. Today taro-kit
F-012 lists "passing the theme to tools" as out of scope, so a tool can only follow the device
setting and mismatches whenever the user overrides the theme in portal settings.

## Proposed spec change (taro-kit)
- F-012 Scope: move "passing the theme to tools" from Out to In.
- New F-012 requirement: *When showing an embedded tool, the portal tells it the theme currently
  shown (light or dark) when it opens it, and again whenever the shown theme changes.*
- New AC: *Given the dark theme is showing, when an embedded tool opens, then its address carries
  the dark theme.* / *Given an embedded tool is showing, when the user toggles the theme, then the
  tool receives the new theme without reloading.*
- Privacy note (taro-kit PRN-01 independence): only `light`/`dark` is shared — no personal data.

## Contract (matches JSON Formatter RULE-16)
1. **Initial theme**: MOD-ToolHost appends `theme=light|dark` as a query parameter to the iframe
   `src` (resolved value — never `system`).
2. **Changes**: on theme change, the portal calls
   `frame.contentWindow.postMessage({ type: "taro:theme", value: "light" | "dark" }, toolOrigin)`
   with the tool's exact origin as target.
3. **Ready handshake**: a tool may post `{ type: "taro:ready" }` to the parent once loaded; the
   portal answers with the current theme message (covers a theme change during load). The portal
   must check `event.origin === toolOrigin` and ignore anything else.
4. Tools that don't understand the parameter or messages simply ignore them.

## Catalog entry for this tool (for taro-kit content)
- url: `https://json-formatter.tarokit.app`, open mode: embedded
- permissions (taro-kit RULE-10): `clipboard-write`, `downloads`, `file-pick`
- offline-capable: yes (fully client-side)
