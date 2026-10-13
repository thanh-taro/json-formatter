# Code review 1: F-002 Beautify and F-003 Minify

Branch `worktree-agent-ac8172c0bc946ac06` (f744fa4) compared with `main` (2a1b24f). Line numbers below refer to the worktree.
I ran the format tests: unit, worker, property (NUM_RUNS=2000) and conformance, 40/40 pass. `tsc --noEmit` is clean.

**Verdict: changes requested.** There is 1 major finding and 6 minor ones. There are no blockers.

## What holds

- **Losslessness (INV-01).** The formatter is the validator's state machine with an emitter added. It copies exact input slices and only adds whitespace. BOM, numbers, escapes, raw characters inside strings, key order and duplicate keys all stay byte-identical.
  - The property tests are strong. The reference tokenizer is independent, the generator covers 25-digit numbers, BOMs and duplicate keys, and the tests check that output does not depend on chunking and that beautify is idempotent.
  - I mutated the code mentally: dropping the BOM, losing whitespace inside strings, losing number characters at chunk edges, emitting a final break when the input had none, or adding one too many CR or LF would each be caught.
- **RULE-07 layout.** `{}` and `[]` stay on one line, also with whitespace inside. A top-level scalar is trimmed. The final break appears only if the input had one (`lastChar` in `end()`). Line breaks follow the document's line ending: the mirror uses `\n`, and the worker reports breaks as CRLF for CRLF documents. AC9 is tested end to end, including the byte count.
- **RULE-08.** Minify never calls `newline`, and the final break is suppressed.
- **Size prediction (`beautifiedBytes`).** It is exact: a property test compares it with `utf8Length` of the real output for every indent and both line endings. The main thread's `nonBreakBytes` is computed the same way as the editor's `documentBytes`.
- **Chunked output.**
  - `put()` runs at every generated break, and every emitted chunk is flattened (`flat`), so chunks are at most about 1–2 M units, even for 10,000 levels.
  - Input pieces adapt their size to the time each takes. The worker keeps one copy of the output (`MirrorBuilder`) and the Forwarder joins chunks before sending them, so there is no rope retention.
- **Cancel and busy state.** Cancel goes through `feed()`, which discards the pending text and keeps the document. During the run the editor is read-only and the actions and indent selector are disabled. Scrolling still works. AC8 for F-002 and AC5 for F-003 are tested end to end.
- **One undo step.** `beginReplace(kind)` creates one undo entry, stored as a Blob snapshot in the large tiers. sourceName is passed through (AC9 checks `data-source-name`).
- **Invalid input.** It is refused before any job starts, and `jumpTo(0)` focuses the error and moves the cursor there (AC6 checks focus and the cursor position). A whitespace-only document is also covered.

## Findings

### MAJOR-1: The RULE-02 clarification is not implemented (no second confirmation when the document is already over 100 MB)
`src/app/controller.ts:487-490` asks for confirmation whenever the predicted result is very large:

```ts
if (tierOf(bytes) === 'very-large' && !(await this.confirmVeryLarge(bytes))) return;
```

- **Scenario:** the user loads a 150 MB file and confirms. Then they beautify it, and the dialog appears again. The clarified RULE-02 on main says no confirmation in this case ("the user confirmed when it got there").
- **Fix:** add `&& tierOf(ed.bytes) !== 'very-large'`. It is cleaner to put this in a pure helper in core, e.g. `needsResultConfirm(currentBytes, resultBytes)`, so that F-004 `reindent()` (which has the same bug) can share it.
- **Tests:** add a unit test for the helper. Also add an AC10 counterpart: a document already over 100 MB beautifies with no dialog. A controller-level test with a stubbed editor is enough.

### MINOR-1: The size check is skipped when layout facts are missing
`src/app/controller.ts:487` uses `&& result.layout`. If a valid result ever has no layout (an older cached result, or a future path that skips it), beautify runs without the confirmation. Fix: if `layout` is missing, treat the result as not current and re-validate, or ask for confirmation.

### MINOR-2: The AC10 "Continue" branch is not tested
The e2e test only checks declining. Nothing shows that choosing COPY-action.continue actually commits the result over 100 MB. Fix: add a unit test (stubbed confirm returns true, then a format job is started) or a slow e2e test tagged for the nightly run.

### MINOR-3: The indent selector's custom state is local and can disagree with app state
`src/app/components/IndentSelector.tsx:15-17` keeps `custom` in `useState(false)`.
- **Scenario:** custom 3 spaces is chosen, then the toolbar remounts (narrow overflow menu, CMP-Toolbar "narrow" variant, or F-004 rendering the selector elsewhere). The `<select value="3">` matches no option, so it shows "2 spaces" while beautify uses 3.
- **Fix:** derive the custom state from the signal: `custom = indent.kind === 'spaces' && indent.width !== 2 && indent.width !== 4`, or keep `customActive` in app state. Initialise the field's width from `state.indent`.

### MINOR-4: The custom-width field gets its own Tab stop and is outside the toolbar's arrow-key navigation
`Toolbar.tsx` `controlsOf` only picks up `button, select`. As a result the toolbar no longer has a single Tab stop, and arrow keys cannot reach the field. Fix: include `input` in `controlsOf` and the roving tabindex. In `onKeyDown`, skip ArrowLeft and ArrowRight when the target is an `input`, so the caret can still move (the APG toolbar pattern allows this). Keep Home and End as they are.

### MINOR-5: The custom-width field's size on coarse and fine pointers
`src/app/styles/shell.css` `.tk-indent-width` uses `min-height: size.control`. It does not grow to `size.touchTarget` on coarse pointers (style.md §3). It also uses the 16 px input font on fine pointers too, which differs from the toolbar's `font.size.sm`.
- **Fix:** default to `font.size.sm` and use 16 px plus `min-block-size: size.touchTarget` inside `@media (pointer: coarse)`.
- The other toolbar controls also lack the coarse touch-target rule, but that predates this change. Note it for F-001 or a shell follow-up.

### MINOR-6: The commit summary does not mention the specs' status lines
The branch changes F-002 and F-003 (and `_index.md`) from `ready` to `building`. That is fine if the pipeline expects it, but it will conflict with the parallel F-004 and F-007 branches on `_index.md`, which they also edit.

### Note (not a defect)
Minifying a CRLF document leaves no line breaks. Its `lineEnding` then becomes LF, as ENT-Document defines ("LF when there are none"). A later beautify therefore produces LF. This matches the spec literally, and undo restores CRLF. If keeping the original line ending is the intent, raise it as a spec question; do not change it in code.

## Expected merge conflicts with F-004 (`worktree-agent-a2857fb67cd0eec56`)

I simulated the merge with `git merge-tree`. These files conflict: `Toolbar.tsx`, `controller.ts`, `worker/client.ts`, `worker/engine.ts` and `specs/20-features/_index.md`. `src/core/index.ts` and `state.ts` merge without textual conflicts, but `core/index.ts` then breaks the build.

| File | Resolution |
|---|---|
| `src/core/index.ts` | It merges cleanly but exports `type IndentStyle` from both `./indent` and `./reindent`, which is a TypeScript duplicate-export error. Remove the `IndentStyle` declaration from `reindent.ts`, `import type { IndentStyle } from './indent'` there, and drop `type IndentStyle` from the `./reindent` export list. `indent.ts` is the single owner (it also has `indentText` and `MIN_`/`MAX_CUSTOM_WIDTH`). |
| `src/app/state.ts` | Both branches add the same `indent` signal, so it merges cleanly. Keep one copy. You can initialise it from `DEFAULT_INDENT`. |
| `src/app/components/Toolbar.tsx` | Keep F-002's `<IndentSelector>`, which supports custom widths 1–8; F-004's inline `<select>` has no custom option. Drop F-004's `indentValue` and `onIndent` and the `IndentStyle` import. Keep F-004's `onClick={() => void app.reindent()}` on the re-indent button. |
| `src/worker/client.ts` | Take F-004's `resultOf(msg)` switch and add `case 'formatted': return { type: 'formatted', facts: msg.facts };`. Add `'formatted'` to both the `JobResult` union and the settle `case` list. |
| `src/worker/protocol.ts` / `engine.ts` | Keep both `JobSpec` kinds (`format`, `reindentPlan`/`reindent`), both handler `case`s and both methods. In the imports, merge `FormatMode` with `IndentStyle`/`SourceUnit`. |
| `src/app/controller.ts` | Merge the two `../core` import blocks: `beautifiedBytes`, `FormatMode`, `IndentStyle`, `LineEnding`, `SourceUnit`. Keep `format()`/`validationOf()` and `reindent()` side by side. Apply the MAJOR-1 helper to both RULE-02 checks. Optionally unify the line-ending handling: F-002 reports CRLF breaks from the worker, while F-004 relabels them on the main thread (`keepLineEnding`). Either works; pick one approach for consistency. |
| `specs/20-features/_index.md` | Keep both status rows. |

F-007 (`worktree-agent-a241f98dd202ee62e`) also edits `Toolbar.tsx`, `controller.ts` and `state.ts`. Expect conflicts that only involve adding code next to each other.
