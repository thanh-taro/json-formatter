# F-006 code review — round 1

Branch `worktree-agent-a66be80d7722ad532` (b650ad4), reviewed as `git diff main...branch` (merge base before F-004/F-010).
Paths below are relative to the worktree `.claude/worktrees/agent-a66be80d7722ad532`.

Verdict: **changes required** (1 blocker-to-merge, 2 major, 5 minor).

## Blocker (merge)

### B1 — Branch does not merge cleanly onto current main; the auto-merged controller does not compile
- `git merge-tree main branch`: content conflicts in `src/core/index.ts`, `src/editor/index.ts`, `src/worker/client.ts`, `src/worker/protocol.ts`.
- `src/app/controller.ts` auto-merges but then has **two** `showTextView(): void` methods (main:174, from F-010, vs the branch's 820). That is a duplicate member, so TypeScript fails.
- Fix: merge main into the branch. Keep a single `showTextView()` (main's, extended with `this.editor?.setHidden(false)`) so F-010's find path (`FindController(showTextView)`) also unhides the editor. Resolve the four conflicts, then re-run unit and e2e.

## Major

### M1 — Expansion resets on every document version (spec edge case: "nodes that still exist at the same path stay expanded")
- `src/tree/view.ts:738-763` (`build` → `new RowModel(rootItem)`, `expandInitial()`, `cursor = root`, `selected = false`, `scrollTop = 0`). Every new version (undo/redo in the tree, beautify/minify/re-indent from the toolbar while the tree is shown, switching back after edits) throws away the user's expansion and resets it to RULE-12 defaults.
- Scenario: expand `$.order.items[3].meta`, press Ctrl+Z in the tree, then Ctrl+Shift+Z. The tree comes back with only the root and its children expanded, and the selection is gone.
- Fix (required): before replacing the model, snapshot the expanded set from the old `RowModel` as path parts. Store item nodes as `cont.parts`, and group nodes as (container parts, `from`, `to`, `g`). After `expandInitial`, re-apply that set top-down. For each saved container path, fetch the parent's block holding the key or index (objects: match the decoded key at the same member position first, then fall back to the first occurrence of the key; arrays: match the index), expand it if it is still a container, and re-expand the groups whose ranges still exist. Paths that no longer resolve are dropped and RULE-12 applies to them. Keep the cursor the same way when its path still resolves. Cap the replay, e.g. stop re-expanding after N fetched blocks, so a huge expanded set cannot stall a build. Add a unit test on RowModel (snapshot/restore) and an e2e test: expand a deep node, undo, and check it is still expanded.

### M2 — A failing initial children fetch leaves the tree stuck and raises an unhandled rejection
- `src/tree/view.ts:739-746`: `job.root.then(async (rootItem) => { … m.put(…, await deps.children(…)) … }, onError)`. The second `then` argument only handles rejections of `job.root`. If `deps.children` rejects (worker restart → `internal`, allocation → `too-large`), the async callback rejects with nothing handling it. `opening` stays set, so the build timer shows "Building tree… 0%" forever, or with a previous model the dimmed tree and the checking bar stay up indefinitely. That breaks INV-05 and NFR-02. The `cancelled`/Superseded case is mostly covered by `markStale`→`stopBuilding`, but the other reasons are not.
- Fix: wrap the body in try/catch and route errors through the same handler as root failures (or chain `.then(...).catch(handler)`), with the `opening !== op` guard. Add a unit or e2e test with a seam that fails `treeChildren`.

## Minor

### m1 — Background fill step is count-based, not time-based
- `src/worker/engine.ts` `FILL_STEP = 1000` / `fillSlice`: one `index.fill(c, 1000)` scans 1000 children without yielding. Children below the skip-table threshold are not indexed, and the threshold doubles on compaction for big documents. So one step can scan many MB and blow the 8 ms slice (ADR-0007 §2), which delays edit and validate jobs behind it. The same applies to the cold-scan loop in `treeChildren`, where `slicer.step(0, …)` only yields on time.
- Fix: pass a deadline or units budget into `TreeIndex.fill` (stop at the next depth-1 comma once the budget is spent), or size the step from the measured positions per child.

### m2 — Row preview can split a surrogate pair
- `src/core/tree.ts:286`: `this.text(s, s + Math.min(len, PREVIEW_MAX))` cuts at a UTF-16 index, so a string with emoji around position 200 shows a lone surrogate (U+FFFD) before the "…". Fix: if the code unit at the cut is a high surrogate, cut one earlier.

### m3 — Missing tests for the newly committed edge cases and the tab-stop rule
- No test that **Cancel on the checking bar returns to the text view** (`view.ts:172` wires it; there is no e2e).
- No test for **expansion kept by path** (see M1).
- Keyboard e2e (`tests/e2e/f006-tree.spec.ts:421`) only checks one `tabindex="0"` row. There is no test for the ADR-0007 §4 rule that, when the selected row is scrolled out of the rendered window, the viewport becomes the tab stop (`tabindex=0`) and Tab into it scrolls back to and focuses the selected row (`view.ts:342, 629-635`).
- Fix: add the three e2e cases.

### m4 — Scale e2e tests are weaker than AC9/NFR-04
- `tests/e2e/f006-tree.spec.ts:556-586` `scrollFrames` sets `scrollTop += 4000` per frame. It never checks that row data arrives (rows can stay `--loading` the whole run). It never exercises the scaled-spacer wheel path (`view.ts:639-651`), because 10,000 rows × 24 px = 240 k px is unscaled; the 1 M test scrolls only a few hundred rows. It never measures memory (NFR-04 < 1.5 GB after GC).
- Fix: in the 1 M test, expand enough groups (or use a 400 k+ visible-row case) to enter scaled mode and drive it with `page.mouse.wheel`. After the fling, assert that the visible rows leave `--loading` within a bound. Record `performance.measureUserAgentSpecificMemory()` / CDP heap after GC for the 50 MB case.
- The `group` timing (`[0 … 9999]` appears) is arithmetic and trivially fast. Keep `first` (data arrival) as the real AC9 gate, as already done.

### m5 — Stale TreeIndex kept after edits
- `src/worker/engine.ts` `this.tree` is only replaced on the next tree query (or `forgetDocument`). After an edit while the text view is shown, the old index keeps the previous mirror's chunk array and all its checkpoint arrays alive. Fix: clear `this.tree` and `fillStack` when the mirror changes (where `validated`/`skipTable` are invalidated on change).

## Checked and OK
- RULE-06 (`core/tree.ts:81-97`): ASCII identifier regex. Names are decoded (`decodeKey` on escaped keys) and re-escaped with `JSON.stringify`, which is minimal: `"`, `\`, controls, lone surrogates. Index form `[n]`; root `$`. Unit-tested, including `ABC` → `$.ABC`, lone surrogate, emoji, and duplicate keys.
- RULE-11: spans are exact source text. Numbers keep their spelling (`1.50`, `-0`, `1E+2`, 20-digit IDs); strings keep their quotes and escapes. Copy value exports the span with the document's EOL (CRLF restored). The worker refuses a span for a stale version (INV-05).
- RULE-12: `groupSize` nests by 100s (10,001 → 10,000-groups of 100-groups). Objects group by member position. A grouped root expands the root plus its first group. Collapse all is O(1). Group rows have no copy actions (header disabled).
- Range-tree row model: `rowAt`/`indexOf`/expand/collapse are O(depth·log k). There is a randomized equivalence test against a naive list and a 1 M-children node-count test. Memory: no per-node objects for unexpanded parts, only an LRU of 100-row blocks.
- Header actions (D-018), roving tabindex, 24 px rows via `--tk-tree-row` (touch size on coarse pointers), Home/End/PageUp/PageDown/arrows/Enter. Undo/redo in tree focus (AC13 test). The clipboard fallback field (AC12) is selected and focused. Reveal selects [s, e) and scrolls it into view (AC7).
- INV-05: the stale tree is dimmed, `aria-busy`, actions disabled, block fetches suppressed; the checking bar shows progress and Cancel after 0.5 s.
