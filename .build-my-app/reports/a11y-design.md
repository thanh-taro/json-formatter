# Accessibility audit: JSON Formatter designs (phase 2)

Scope: 43 boards in design/canvas/*.dc.html (9 CMP, 12 FLOW, 22 SCR), against NFR-06 (WCAG 2.2 AA), tokens.json, SCR-Formatter and CMP-* accessibility sections.
Method: support.js is not in the folder, so boards were unrolled (theme placeholders substituted, sc-for expanded to dark+light) into scratch copies and rendered in headless Chrome. A DOM probe computed text and icon contrast (alpha-composited over the real ancestor background), interactive target sizes, and overflow. Markup was reviewed for roles and states. Original files untouched. Fonts fell back (no network), so widths are approximate.

## Summary
| Check | Result |
|---|---|
| tokens.json contrast (tools/token_contrast.py) | PASS, 0 failing pairs |
| Contrast checks, rendered boards, 79 board x theme renders (text, icons, disabled, badges, syntax on error/current/selection/warn bg) | PASS, 0 failures below 4.5:1 text / 3:1 icons |
| Target checks: desktop/embedded boards >=24px | PASS (smallest: 24x24 ibtn Close, badge, jump) |
| Target checks: 390 coarse boards >=44px, toolbar fits at 390 and 360 | PASS, 0 undersized, no horizontal overflow |

Extra token pairs not covered by the script, computed by hand:
- Pass: accent on selection, dangerBg, warnBg and surface2 (>=4.9). muted and syntax colors on warnBg/dangerBg/selection (>=5.1). danger on bg (5.68 light).
- Fail: lineStrong on selection is 2.80 dark / 3.07 light, and lineStrong on dangerBg is 2.90 dark. No board was confirmed to put a lineStrong border there (see minor 1).

## Blocker
None.

## Major
1. Tree has no keyboard entry point in markup. Boards: CMP-TreeView, SCR-Formatter_tree_*, FLOW-03 step 3. role="tree" and every treeitem have no tabindex="0" or roving tabindex or aria-activedescendant. The expander buttons are tabindex="-1" and aria-hidden. Criteria: 2.1.1, 4.1.2. Fix: the tree (or the selected row) gets tabindex="0", the others -1 (or aria-activedescendant), and the arrow-key model is annotated. Also add aria-selected on all rows in multi-row boards (only the selected row has it) and aria-setsize/aria-posinset, because group rows [0..99] otherwise lose position context.
2. Focus indicator designed for only two control types. The focus style exists only as .btn.focus and .field.focus. No board shows focus on the seg Text/Tree buttons, tabs, ibtn (close, find prev/next, expand), .tog Aa, issue row, tree row, badge, jump, menuitem/option, or the editor. Criteria: 2.4.7, 2.4.11/2.4.13. The accent ring itself passes (>=4.9 vs every surface). Fix: one global :focus-visible rule (2px accent, 2px offset; inset on rows and seg segments clipped by overflow:hidden) and show it in the CMP boards for each type.
3. Editor error state is not exposed to AT in the screens. Only CMP-Editor has aria-invalid. SCR error and FLOW error boards (SCR-Formatter_error_narrow, FLOW-03 step 2/3) do not, and there is no aria-errormessage/aria-describedby tying the editor to the issue. Criteria: 3.3.1, 4.1.2. The issue panel and "Invalid JSON" status do carry the text. Fix: aria-invalid="true" plus aria-describedby pointing at the issue message while an error exists.

## Minor
1. lineStrong borders on selection or dangerBg backgrounds fall below 3:1 (above). Check .tog, .ra button and .btn.ind in selected or error rows; use accent or fg for the border there.
2. Roles and states. In CMP-Toolbar the Indent listbox contains a role="separator" li (invalid child), and "Custom..." is an option whose companion input sits outside the listbox. Fix: remove the separator or use role="group", and expose Custom as a menuitem or dialog.
3. Collapsed issue panel (default_narrow, find-open_narrow, confirm_narrow, tree boards): both tabs have aria-selected="false" and aria-controls points to a hidden panel. Fix: keep one tab selected (or use the disclosure button only).
4. Live regions. Progress bars (CMP-Notice, busy/loading boards) put role=progressbar inside role=status with a % in the text, so a screen reader may be spammed on each tick. Fix: announce at start/end only (aria-live off or throttled; progressbar carries the value). Toast status and info bars are inserted already containing text (e.g. static role=status nodes in the toast boards); the live container must exist before content is injected. The error bars use role="alert" and are announced once, which is appropriate. The status bar wraps a button in role=status (the jump button); keep the live text separate from the button.
5. Search toggle: visible text "Aa" vs accessible name "Match case" (2.5.3). Acceptable as a symbol; if the visible label is kept, name it "Match case" with aria-label starting "Aa" or show the text.
6. Search matches: the non-current matches (.hit2) differ from the page only by selection background (about 1.1:1). The current match has a 1px accent outline. The count status ("1 of 2") compensates; add a 1px dotted outline to the other matches.
7. Privacy popover (CMP-StatusBar role="dialog") is non-modal without aria-modal; document Escape to close and focus return. Confirm dialog is good (modal, labelled, described, focus on Cancel, scrim). Inert background must be implemented.
8. Reduced motion: no animation exists in any board and no prefers-reduced-motion rule, so nothing fails today. Add an explicit statement to the spec (progress fill, toast fade, popover transitions must be disabled or instant).
9. Larger text / reflow: heights are fixed in px (toolbar 40/52, buttons 28/44, status bar 28/44, tabs 32, tree rows 24/44 with fixed line-height) and the app is overflow:hidden. Text at 200% will clip. Use min-height with rem units. Narrow boards fit 360 and 390 at 100% only.
10. Auto-dismiss toast (2 s) is ok for "Copied" (never the only signal for errors, per spec). Keep errors in the persistent bar.

## Pass
- Names/roles: toolbar (labelledby), view switch as group with aria-pressed (not tabs), tabs/tabpanel with aria-controls and labelledby, icon-only buttons all named via COPY labels, tree treeitems with aria-level and aria-expanded, selected row aria-selected, dialog labelled/described, search role with labelled field, count as status.
- Non-color error/warning signals: severity word ("Error"/"Warning") in issue rows, gutter bold, wavy underline (error), dotted underline (warning), count in tab and status text, status dot paired with text.
- Reading order matches spec (toolbar, notice bar, search, main, issue panel, status bar); DOM order = visual order in all boards.
- Drop: the overlay is aria-hidden and not focusable; "Open file" is available in the toolbar (desktop), the More menu and the empty-state button (narrow).
- Syntax colors on current-line, selection, error and warning backgrounds pass in both themes. Disabled muted text still passes 4.5:1.

## Needs manual pass (not provable from static boards)
- Screen reader run (VoiceOver + NVDA): live-region announce-once for errors, tree navigation, menu/listbox focus management.
- Real keyboard tab order and Escape/focus return for the dialog, popover, menu, indent listbox and search panel; Tab-escape in the editor.
- Focus-visible rendering for every control once implemented; hover/pressed contrast.
- 200% text zoom, 400% zoom reflow, forced-colors/high contrast mode, pointer target spacing on real touch devices.
- Embedded host: focus trap and iframe title.
