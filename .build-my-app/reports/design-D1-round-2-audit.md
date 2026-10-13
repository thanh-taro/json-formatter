# Design D1 — round 2 audit

Scope: design/canvas/*.dc.html (Main + 9 CMP boards) and canvas.json, against specs, tokens.json, copy.md, style.md, adapters/design.md.
Method: script compared every `.tk-dark/.tk-light` colour var to tokens.json (all match), every `data-copy` ID and text to copy.md (no unknown IDs, no text mismatches except the "1 lines" case below), and the raw px values; then a manual read of every file. Nothing was rendered (no .dc runtime), so layout points are from markup.
Severity: B blocker, M major, m minor (trivial fixes only).

## Round-1 resolution
Resolved: audit #1-5, 7, 9-17, 19-21, 23-26 and critique #1-2, 4-9, 10-12, 15.
- Colours, COPY IDs and hint texts are exact in all 10 files, both themes.
- No shadows or opacity are left. The only `box-shadow` values are inset 2px accent/danger bars (equal to border.width.focus). No 11px or 14px-off-scale text remains.
- Status bar, issue panel, tabs, tree and editor targets are now >= 24px.
- Variants are present for the original six components, both themes.
- Notice, ConfirmDialog and SearchPanel now exist.

Not resolved or only partly resolved:
- #18 Toolbar empty (see R2-1).
- #22 variant names (R2-9).
- #6 busy: controls stay, but layout still shifts (R2-3).
- Critique #1 "Main variant": the empty state is in CMP-Editor only (R2-5).
- Critique #3 coarse: only the Toolbar, StatusBar and SearchPanel have 390 coarse frames (R2-4).
- Critique #14: "Switch to text view" was not added; Clear still follows Download without a separator.
- Audit #14: the Tab-escape key is still not annotated (m).

## Findings
| # | Frame | Finding | Spec ID | Sev |
|---|---|---|---|---|
| R2-1 | CMP-Toolbar / empty document / both | Clear is enabled and the indent selector is not disabled. The spec table says clear, find, format (incl. selector), export and view switch are disabled; only open stays enabled. (Round-1 #18 still open; the spec now fixes the intent.) | CMP-Toolbar empty | M |
| R2-2 | Board heights in canvas.json | Estimated content height is larger than the declared `h` for CMP-Toolbar (~2450 vs 1900), CMP-Notice (~1780 vs 1480), CMP-Editor (~1820 vs 1700) and CMP-StatusBar (~1620 vs 1360). The light-theme frames may be clipped. Verify in a render and raise `h` plus `$preview.height`. TreeView, IssuePanel, SearchPanel and ConfirmDialog fit. | adapters/design.md (both themes count as frames) | M (verify) |
| R2-3 | CMP-Toolbar / busy / both | The indent button loses its chevron (16px + 8px gap), so everything after it shifts left ~24px. This is the reflow round-1 #6 asked to remove. Keep the chevron (disabled). The editor read-only cue is shown nowhere (no Editor busy variant or annotation). | CMP-Toolbar busy | M |
| R2-4 | CMP-Notice, CMP-ConfirmDialog, CMP-TreeView, CMP-IssuePanel, CMP-DropOverlay | No 390 coarse frame. Buttons are 28px, dismiss 24px, tree rows and actions 24px, issue tabs 32px, none at size.touchTarget (44px) on phones. style.md principle 3 and round-1 critique #3 promise 44px. Add a `narrow (390, coarse)` frame, or a coarse annotation with 44px hit areas, at least for Notice and ConfirmDialog (Continue/Cancel). | style.md principle 3, size.touchTarget | M |
| R2-5 | Main (SCR-Formatter) | One state only (default, embedded, theme tweak). Round-1 summary claims an empty Main variant, but none exists. States empty, loading, error, large and confirm, and the narrow viewport, are not drawn. | SCR-Formatter States | M (D2 if screens are deferred; record it) |
| R2-6 | CMP-Toolbar / narrow (390, coarse) / both | View-switch buttons are 42px (`.coarse .seg button`), below 44px (the 2px border is not part of the button). Seg buttons are 26px on desktop (no token; 24-28px, consider 28 = size.control). | size.touchTarget | M |
| R2-7 | CMP-Toolbar / indent selector open / both | The Custom row puts a number `<input>` inside an `<li role="option">`, an interactive child in an option (ARIA invalid). Place the input outside the listbox, or make the option a plain button that reveals the field. | CMP-Toolbar a11y | m |
| R2-8 | CMP-Editor / empty / both | The Open file button is inside `role="textbox"`. Move the empty-state block outside the textbox, or make it an overlay sibling. Also the Tab-escape key is not annotated. | CMP-Editor a11y | m |
| R2-9 | CMP-StatusBar / empty / both | Shows "0 B · 1 lines". The COPY-status.size_lines note requires singular "1 line". | COPY-status.size_lines | m |
| R2-10 | CMP-StatusBar / narrow | Only the valid state is drawn. In invalid, the `.jump` button is 24px (no `.coarse .jump` rule), below 44px. | CMP-StatusBar narrow | m |
| R2-11 | CMP-Notice progress vs CMP-Toolbar busy `.prog` | Same pattern, drawn two ways: Notice has the message, then the track, then Cancel pushed right (8px gaps, full border); Toolbar has message, track, a spacer, then Cancel (12px gaps, no top border). Pick one layout so developers get one component. | CMP-Notice progress bar | m |
| R2-12 | CMP-Notice / toast | The spec says toasts stack up to 2, and bars dismiss with Escape. Neither is shown or annotated. | CMP-Notice behavior | m |
| R2-13 | Variant labels (Toolbar, Editor, StatusBar, IssuePanel, TreeView) | Labels add parentheses to spec row names (`busy (with CMP-Notice…)`, `large tier (with …)`, `focused row (actions + copied toast)`, `warnings (panel at …)`, `narrow (390, coarse)`). adapters/design.md expects `<CMP-ID> / <variant> / <theme>` with the row name. Keep the exact row name; put extras in a separate caption. | adapters/design.md Naming | m |
| R2-14 | CMP-Toolbar narrow menu; CMP-TreeView / unavailable | Clear (danger) still sits directly under Download without a separator. The "Text" button next to COPY-tree.too_large has no explicit label such as "Switch to text view" (spec gap: no COPY). | CMP-Toolbar narrow; CMP-TreeView unavailable | m |
| R2-15 | Raw values with no token | The 100px left padding of the issue overflow line, the 4px progress track, the 8px status dot, the 26/42px seg heights and the 16px (11px-removed) caption lines are sizes with no token. All are small. Either add tokens (size.progress, size.dot) or snap to existing values. | adapters/design.md Tokens | m |

## New artboards, row-by-row (both themes)
- **CMP-Notice**: all variants are present (3 progress, 4 info, 5 error, toast). COPY IDs and texts are exact, tokens are exact, dismiss is labelled by COPY-action.dismiss via aria-labelledby, errors use role=alert, others role=status. Dismiss is 24px, Cancel/Copy 28px. Findings: R2-4, R2-11, R2-12.
- **CMP-ConfirmDialog**: the only spec row (very large content) is present in both themes. role=dialog, aria-modal, name from the message, Cancel has the focus ring and Continue is the filled button, scrim/lineStrong/radius.md are right. Findings: R2-4 (28px buttons, no coarse frame).
- **CMP-SearchPanel**: all 6 rows are present in both themes (closed, open/empty, matches, counting, no match, narrow). The field is labelled by COPY-search.placeholder, the count is a polite status, the toggle uses aria-pressed, prev/next are disabled when there are no matches, and narrow is 44px with a 16px field. The count text is sample data. No findings beyond R2-2 (board height looks fine). The "Aa" toggle text has no COPY ID (glyph only; the accessible name is COPY-search.match_case). Field focus offset is 1px while all other focus rings use 2px (m, trivial).

## UI quality notes
- Main and the components agree on toolbar, issue panel and status bar markup (the 76px badge column, tabs, 24px badge, 28px status bar). No misalignment found in the markup.
- Contrast pairs used in the new boards (muted/surface, danger/surface, danger/dangerBg, fg/selection, onAccent/accent) are all in tokens.json `contrast.pairs`.
- `./support.js` is not in design/canvas (canvas runtime); confirm that the host supplies it.

## Verdict
No blockers. Fix R2-1 to R2-6 before D1 is signed off; the minors are quick edits.
