# Design plan — JSON Formatter (Workbench, Claude Design canvas)

Inventory: 1 screen (SCR-Formatter: 5 states in the spec + tree/checking/busy variants from
features), 6 components (~22 variants), 3 flows. × 2 themes → ~70 frames counting theme tweaks.
Split into 4 design phases; each runs make → design audit → UI critique → fix (max 3 rounds).

## D1 — Components (both themes)
| Artboard | Variants |
|---|---|
| CMP-Toolbar | default · empty document · busy · narrow (overflow menu) · indent selector open |
| CMP-Editor | normal tier · large tier (reduced colouring) · error marker · warning marker · current line |
| CMP-StatusBar | valid · invalid · checking · empty · privacy popover open |
| CMP-IssuePanel | error · warnings (with overflow line) · collapsed |
| CMP-TreeView | default · group rows · focused row (actions) · invalid · checking · unavailable |
| CMP-DropOverlay | hidden · active |

## D2 — FLOW-01 happy path (embedded viewport)
`FLOW-01 / step 1..4`: empty → pasted (valid + unsafe-number warning) → beautified → copied toast.

## D3 — Error and tree (embedded viewport)
- FLOW-02: invalid document with error panel → jumped to error → fixed (valid).
- FLOW-03: tree default → expanded with group rows → row actions → "Show in text" selection.

## D4 — Edge states, dialogs, narrow
- Loading with progress + cancel; busy (formatting) with read-only editor.
- Very-large confirmation; large-tier notice; undo-trimmed notice.
- Errors: encoding, too large, not-a-file, clipboard blocked (text + tree fallback field), download blocked.
- Tree too large / checking.
- Narrow 390 × 760: empty, default, error and tree states.

Phone widths: supported down to 360 px (D-012, NFR-07 updated).
