# Design D1 — round 1 critique

Scope: `design/canvas/Main.dc.html`, `design/canvas/CMP-*.dc.html` (dark + light), checked against
`specs/30-experience/style.md`, `tokens.json`, `copy.md`, `screens/SCR-Formatter.md`.
Method: I could not render the files (they need the .dc runtime), so this review is based on the markup and inline styles.
Severity: **major** = users will struggle or the build will diverge; **minor** = noticeable quality loss.
Ordering: usability > clarity > consistency > polish.

## Major

1. **The empty state is not designed** (SCR-Formatter state `empty`, `COPY-empty.title/body`).
   None of the files shows the empty editor. CMP-Toolbar "empty document" disables everything except a quiet
   "Open file", and CMP-StatusBar "empty" says only "Empty". This is the first-run screen, and right now it is a blank `bg` field.
   Fix: add `CMP-Editor / empty`. Gutter shows `1`. Centred block in the document area: title `font.size.md` 600 `fg`,
   body `font.size.sm` `muted`, then an "Open file" button (28px `size.control`, 1px `lineStrong` border).
   Stack gap `space.2`. Also show the same state in a Main variant.

2. **There is no surface for transient feedback.** `COPY-toast.copied`, `notice.multiple_files`, `notice.no_indent`,
   `notice.undo_trimmed`, `error.too_large/download/encoding/not_a_file` and the `confirm.very_large`
   dialog (Continue/Cancel) have nowhere to appear. Only the large-doc notice exists, in CMP-Editor.
   Fix: generalise that notice strip (`surface2`, 12px, 24px dismiss) into info and danger variants. The danger variant
   uses `dangerBg` with a `danger` icon and text. Add a confirm dialog (`surface`, `lineStrong` border, `radius.md`, `scrim`;
   Continue gets the `accent` fill) and a "Copied" toast anchored above the status bar end.

3. **There is no coarse-pointer layout, but 390 px is a phone width.** CMP-Toolbar "narrow (390)" keeps 28px
   controls in a 38px bar. Menu items `.mi` are 28px, tree rows 20px, status-bar buttons 22px. None reach
   `size.touchTarget` (44px), which style.md principle 3 promises.
   Fix: add a "narrow / coarse" variant. Toolbar is 48px with 44×44 hit areas (the visual can stay 28px with an expanded
   `::before`). Menu items and tree rows are 44px under `pointer: coarse`, and status-bar buttons get a 44px hit area.

4. **Some targets are below `size.targetMin` (24px) even with a mouse.**
   - CMP-TreeView `.ra button`: 20px tall, 11px text, only 4px apart.
   - CMP-TreeView `.tw`: the twisty is 14px wide.
   - CMP-StatusBar `.badge` and `.jump`: 22px.
   - CMP-IssuePanel `.tab` and Main tabs: `padding:0`, so the target is only as wide as the text.

   Fix:
   - Show the selected node's actions in the 30px tree header strip, at 24px height, instead of inside the 20px row.
   - Give the twisty a 24px-wide hit area.
   - Make `.badge` and `.jump` 24px tall (the 26px bar has room).
   - Give tabs `padding: 0 space.2`.

5. **Nothing shows the status bar at 390 px.** Main's status content ("Valid JSON", size · lines, Ln/Col, "Local only") at 12px mono
   needs roughly 470px, so it overflows or clips on a phone.
   Fix: add a narrow variant with a set drop order. Ln/Col goes first, then size · lines. The privacy badge becomes
   icon-only (24px, accessible name `COPY-privacy.badge_label`), and the validity label always stays.

6. **The toolbar reflows while busy** (CMP-Toolbar "busy"). Re-indent, the indent selector and the view switch disappear,
   and progress plus Cancel take their place. Controls move under the pointer, so a click aimed at Re-indent can land on Cancel.
   Fix: keep every control in place and disabled. Show progress as a 2px `accent` line on the toolbar's bottom
   edge. Put "Formatting… 42%" and Cancel in a fixed slot: the status-bar start, or a strip under the toolbar.

7. **The selected state of the view switch is nearly invisible** (Main and CMP-Toolbar `.views`). The pressed segment differs
   only by `surface2` on `surface` (about 1.1:1 in dark) plus `fg` vs `muted` text. Principle 4 says state should be shown by form, not only by colour.
   The group border and the indent-select border use `line`, but tokens reserve `lineStrong` for control borders.
   Fix: give the pressed segment a `selection` background and an `inset 0 -2px 0 accent` underline, the same as issue tabs.
   Change the `.views` and `.sel` borders to `lineStrong`.

8. **Main's issue panel does not match CMP-IssuePanel.**
   - Tabs: Main uses plain `<span>`s with no `tablist`; CMP has real tabs.
   - Row text: Main shows the code "unsafe-number" as the Manrope title with the hint below; CMP shows the hint first and the code in mono below.
   - Layout: badge column `auto` vs `52px`, and header padding differs.

   Developers will build whichever one they open. Fix: rebuild Main's panel from the CMP markup.

9. **The custom indent field is under-sized and will zoom on iOS** (CMP-Toolbar "indent selector open"). It is 22px tall,
   12px text, with a `line` border. iOS zooms on focus below 16px, and here that happens inside the iframe.
   Fix: make it 28px (`size.control`) with a `lineStrong` border and `font.size.input` (16px) text, at least under coarse pointers.

## Minor

10. **The gutter shows no state** (Main and CMP-Editor). The `currentLine`/`dangerBg` tint stops at the gutter, and line numbers
    are all `muted`. Warnings are only a 1px dotted underline, and the error squiggle under a single "," is about 8px wide.
    Fix: run the line tint across the gutter and make the current line number `fg`. Mark error lines with a `danger`
    number and a 2px inset bar. Mark warning lines with a 2px `accent2Fg` tick in the gutter.

11. **Issue counts are ambiguous** (CMP-IssuePanel). "WARNINGS 1 204" in 11px uppercase reads as two numbers. The sample also
    says "…and 204 more" under 3 rows, which should be 1 201.
    Fix: show the count as a pill (`radius.pill`, `surface2`, 12px mono) with a locale-grouped number, and fix the sample.

12. **"Valid JSON" hides warnings** (Main status bar). With 1 warning, the status shows only a green dot.
    Fix: add a "· 1 warning" segment in `accent2Fg` that opens the Warnings tab.

13. **Interaction states are not drawn.** No sheet shows hover, focus-visible or pressed states for toolbar buttons, issue rows,
    tabs or tree rows. There is also no "active" state for the issue row the user just jumped to.
    Fix: add a states row per component: hover `surface2`, focus 2px `accent` outline with 2px offset, active issue row on `selection`.

14. **Some labels and menu items give unclear cues.**
    - CMP-Toolbar narrow menu, "Indent · 2 spaces": no chevron or submenu affordance.
    - The same menu puts destructive "Clear" right under Download, with no separator.
    - The CMP-TreeView "unavailable" button reads just "Text".

    Fix:
    - Add a chevron to the Indent item and have it open the indent listbox.
    - Put a separator before Clear.
    - Rename the tree button "Switch to text view" (new COPY id).

15. **Type and spacing are off the token scale.**
    - Type: 11px is used for issue tabs, severity badges, `.kind` chips and `.ra` buttons. The smallest token is `font.size.xs` (12px).
    - Spacing: 6px (toolbar padding, `.sep` margin, editor top padding, button gap); 10px (gutter right, segment padding, issue grid gap, `.msg` gap,
      fallback box padding); 14px (privacy popover padding).
    - Size: the 30px panel and tree headers have no token.

    Fix: use 12px for that text, snap spacing to `space.1`/`space.2`/`space.3`, and add a `size.panelHeader` token.

## Keep consistent elsewhere
- Beautify is the only filled button, and its disabled state drops the fill: good.
- Severity badges carry a word (Error/Warn) plus a tint. The invalid status works as a "go to error" button, and the tree's
  invalid state uses "Go to error · Line 8, column 50". Use this jump-to-location pattern everywhere.
- The large-document notice strip is the right base for all other notices (see 2).
