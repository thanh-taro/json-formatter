# Design D2–D4 — round 1 critique (screens / flows / edge / narrow)

Scope: pages FLOW-01, FLOW-02, FLOW-03 + Find, Edge states, Narrow (390) in `design/canvas/`.
Method: every board rendered in dark theme in headless Chrome (1200x760 / 390x760), plus a markup check.
References: `specs/30-experience/style.md`, `tokens.json`, `screens/SCR-Formatter.md`, `flows/*.md`, `components/*.md`.
Bar: only issues that would matter in practice. Ordered by impact (usability > clarity > consistency > polish).

## Findings

### 1. MAJOR: Narrow-Error hides the error off-screen
- **Screen:** Narrow-Error.
- **Problem:** Line 9 is cut at about column 40, but the error is at column 50. The red gutter number and line tint show up, but the comma and its wavy marker don't. The panel says "Line 9, column 50" and the user can't see that spot.
- **Why it matters:** This is FLOW-02's whole job, and on a phone the user can't see what to fix.
- **Fix:** At coarse/narrow widths, jumping to the error (and the first validation) scrolls horizontally so the error column sits about `space.8` from the right edge. Even better, soft-wrap long lines in the narrow layout, with a hanging indent of `size.treeIndent`. Redraw Narrow-Error with the marker visible.

### 2. MAJOR: Minify can't be reached at 390, and Find appears twice
- **Screens:** Narrow-*, plus the overflow menu frame in CMP-Toolbar.
- **Problem:** The narrow toolbar has Beautify, Find, Text/Tree, Copy and More. The More menu has Open, **Find**, Re-indent, Indent, Download and Clear. Minify isn't in either.
- **Why it matters:** One of the 3 core format actions is missing on phones. The duplicate Find wastes a 44 px row.
- **Fix:** Swap the menu's Find for Minify. Put the menu in this order, with `line` dividers: Open file · Clear | Minify · Re-indent · Indent ▸ | Download. Add a Narrow-Menu board that shows the menu open in context (44 px items, `lineStrong` border on `surface`).

### 3. MAJOR: FLOW-02 step 2 removes the error highlight just as the user arrives
- **Screens:** FLOW-02-2-AtError, Narrow-Error.
- **Problem:** The error line has the class `errl` (`dangerBg`), but an inline `background:var(--currentLine)` overrides it once the caret lands there. Step 1→2 looks almost the same, except the red tint goes away. The clicked issue row also has no selected state.
- **Why it matters:** "Where am I and what changed" is the core of this step. Right now arriving at the error looks like the error was cleared.
- **Fix:** When the error line is also the current line, keep `dangerBg` on it. Show the current line with the bold gutter number and the caret only. Give the activated issue row a selected state: `surface2` plus a 2 px `accent` inner left edge, the same as the tree selection.

### 4. MAJOR: The narrow status bar wraps to two lines
- **Screens:** Narrow-Default, Find, Notice, Confirm.
- **Problem:** "Valid JSON · 2 / warnings" and "415 B · 25 / lines" both wrap inside the 44 px bar. Rows on two text baselines look broken, and the text block gets taller than the bar.
- **Fix:** Set `white-space:nowrap` on every status item. In the narrow variant, show size only ("415 B") and drop the line count (cursor position is already dropped). Use `space.2` gaps, not 12 px. Ellipsize the validity text last. Also consider keeping the words "Local only" next to the shield: the bar has room once lines are gone, and privacy is the product's promise.

### 5. MAJOR: The narrow issue panel breaks its cap and wraps badly
- **Screens:** Narrow-Default, Narrow-Notice, Narrow-Error.
- **Problem:** The panel is about 334 of 760 px (44%), over `size.issuePanelMax` (40%). With the notice bar showing, the editor shrinks to 13 lines. The desktop 3-column row (badge | message | location) squeezes the message into a 4-line, roughly 140 px column.
- **Fix:** At narrow widths, stack each row:
  - line 1: severity badge + location, right-aligned;
  - line 2: message at full width;
  - line 3: `muted` code.

  Enforce the 40% cap with an internal scroll.

### 6. MAJOR: Tree row actions are far from the row, and missing at 390 (pattern below)
- **Screens:** FLOW-03-3-RowActions, Narrow-Tree.
- **Problem:** On desktop the three buttons sit at the far right edge, about 850 px from the selected label at 1200 px. They are bordered buttons, which goes against the rule that every other action is a quiet text+icon button. At 390 there are no row actions at all, so FLOW-03 (copy path/value) can't be done on a phone.
- **Fix:** See "Proposed pattern" below.

### 7. MAJOR: Loading a file leaves the old document live and unlabeled
- **Screen:** Edge-Loading.
- **Problem:** The bar says "Reading file… 18%". Meanwhile the old document stays editable, and the status still shows "Valid JSON · 415 B". The user can't tell that the new file will replace this text, or whether edits made now will survive.
- **Fix:** The notice should name the file and the outcome, for example "Reading orders.json… 18% · replaces the current document" (new copy key). Make the editor read-only while reading: hide the caret and set the text to `muted`. Set the status validity to the hollow-dot "Reading…" state already used in Edge-TreeChecking.

### 8. MINOR: Warnings-only documents open the panel automatically, and the invalid state shows "Warnings (0)"
- **Screens:** FLOW-01-2/3/4, SCR-Find, FLOW-02-1/3.
- **Problem (1):** A valid paste opens a 150 px panel for 2 identical warnings. It stays open through Beautify and Copy and pulls focus away from the next step.
- **Problem (2):** While the document is invalid, the tab reads "Warnings (0)" even though the same unsafe numbers are present. After the fix it jumps to "(2)", the active tab switches, and the panel grows, so the editor jumps.
- **Fix:** Open the panel automatically only for problems. For warnings-only documents, show it collapsed to its `size.panelHeader` strip; the status bar count is the way in. While invalid, show the Warnings tab with no count, rather than "0".

### 9. MINOR: Tree view shows a meaningless cursor position and a path with no visible selection
- **Screens:** FLOW-03-1/2/3, Edge-Tree*.
- **Problem:** The status bar shows "Ln 1, Col 1" in tree view. In FLOW-03-2 the path bar reads "$.events" but no row is highlighted.
- **Fix:** In tree view, hide the cursor slot, the same way the narrow variant does. The path bar should only show the path of the selected row, and that row must show `selection` plus the `accent` edge.

### 10. MINOR: There are two different progress patterns
- **Screens:** Edge-Loading and Edge-Busy versus Edge-TreeChecking.
- **Problem:** Loading and Busy use a 40 px notice bar: label on the left, a 160 px track pushed to the far right, and a bordered Cancel. TreeChecking uses a 32 px header: the track right after the label, and Cancel as a plain text link.
- **Fix:** Use the CMP-Notice progress variant everywhere. Place the track directly after the label (`space.3`) so the eye doesn't travel about 850 px. Cancel is always `btn.out` (`lineStrong`).

### 11. MINOR: File and policy errors don't offer consistent recovery
- **Screens:** Edge-Encoding, TooLarge, NotAFile, Clipboard, Download.
- **Problem:** Only Download has an inline action (Copy). Only TooLarge says "your previous document is unchanged." Clipboard uses the `dangerBg` error tone even though the fallback has already worked (the text is selected).
- **Fix:** For every file-load error: name the file, add "Your document is unchanged.", and offer a `btn.out` action "Open another file". Show Clipboard as an info notice (`surface` with a `muted` icon). Keep `dangerBg` for real failures.

### 12. MINOR: One large document triggers two separate notices
- **Screens:** Edge-Large, Edge-UndoTrimmed.
- **Problem:** Both notices come from the same 34.2 MB document. They will either stack or show up one after the other.
- **Fix:** Merge them into one info notice, for example "Large document (34.2 MB): some highlighting is off and only the last 3 changes can be undone." Spec allows one large notice per document ("once").

### 13. MINOR: The "Copied" toast covers content
- **Screen:** FLOW-01-4.
- **Problem:** The toast sits over the issue panel's location column and hides "Line 4, column 12". It's also about 1100 px from the Copy button the user just clicked.
- **Fix:** Confirm in place: the Copy button swaps its icon and label to a check plus "Copied" for 2 s, and an `aria-live` region announces it. Keep the toast only for tree row copies, placed above the issue panel or status bar so it never overlaps a panel. Add a 390 toast board.

### 14. MINOR: The confirm dialog has no title and generic buttons
- **Screens:** Edge-Confirm, Narrow-Confirm.
- **Problem:** The dialog has no title. Behind the scrim, the status bar shows 415 B while the body says 148.3 MB, which reads as a contradiction.
- **Fix:** Add a title that names the action and the source, for example "Open orders.json (148.3 MB)?". Label the primary button with the verb: "Open anyway" or "Beautify anyway". Keep default focus on Cancel.

### 15. MINOR: Two flow boards add focus rings that the product won't show
- **Screens:** FLOW-01-2 and FLOW-01-3.
- **Problem:** A focus ring is drawn on Beautify (step 2) and then on Copy (step 3), as if focus moved there automatically. That would be surprising behaviour, and devs may build it.
- **Fix:** Show focus where it actually stays (the editor, or the button that was just pressed). Mark the "next step" with a canvas annotation instead of a product state.

## Proposed pattern: tree row actions at 390 (coarse)
Use a selection-driven action bar in the tree header, not per-row hover controls, swipes or long-press-only actions.

- **Tap behaviour:** Tapping a row selects it (`selection` + 2 px `accent` inner edge). The twisty keeps its own 44x44 hit area on the left, so tapping the label selects and does not toggle.
- **Header becomes the action bar:** The existing path header (44 px tall at coarse) shows:
  - left: the selected path in mono `font.size.sm`, truncated from the start (`…events[1].amount`);
  - right: 3 icon buttons, 44x44 each, with accessible names: Copy path, Copy value, Show in text.
  - With nothing selected, the buttons are disabled (`muted`).
  - The bar is sticky, so the actions stay reachable while scrolling a long tree.
  - Width check: 390 − 3x44 = 258 px for the path.
- **Feedback:** "Copied path" / "Copied value" toast above the status bar. Show in text switches view, as in FLOW-03-4.
- **Accelerator:** Long-press on a row opens the same 3 actions as a `role="menu"` popover. It is never the only way in.
- **Desktop:** Use the same header bar with text labels, so the pattern is consistent and closes finding 6. Keep hover/focus row actions as an accelerator, but as quiet `ibtn` buttons placed `space.4` after the row summary, not pinned to the far edge.
- **Why not swipe:** It conflicts with horizontal scrolling of long values and isn't discoverable. Why not a per-row kebab: it adds a 44 px column to every row and repeats on every row.

## Keep consistent (works well)
- **No triple-reporting:** The status bar carries validity and counts only, the issue panel carries the message, and the notice bar carries file and operation events. Keep that split everywhere.
- **Notice placement:** The notice bar always sits between the toolbar and the editor, and the toolbar controls stay in place but disabled while busy.
- **Confirm focus:** Default focus on Cancel. The 44 px buttons in Narrow-Confirm are right.
- **Narrow Find:** It wraps to two rows with a full-width 16 px field, so iOS won't zoom. Use the same wrap rule for other narrow bars.
- **Show in text:** It highlights the whole node range and updates Ln/Col, a clear handoff between views.
- **Empty states:** The empty state (icon, one line, privacy line, single `btn.out` CTA) works as a calm first impression. Edge-TreeTooLarge reuses the same pattern; keep it for every "can't show this" state.
