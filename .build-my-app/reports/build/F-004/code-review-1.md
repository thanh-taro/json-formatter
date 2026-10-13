# F-004 code review 1 (commit bed54ad, branch worktree-agent-a2857fb67cd0eec56)

Verdict: **changes requested.** No blockers. 2 major, 6 minor.

What was checked: RULE-09 core logic (with the main-branch clarification f1c64cc: the
leading-space count includes spaces on lines that also have tabs), the worker passes, the
controller flow, and the tests. I mutated `src/core/reindent.ts` 10 times, ran the 3 vitest
files each time, and then restored the original file. The worktree is clean.

## RULE-09 branch check (core `src/core/reindent.ts`)
| Branch | Code | Test that kills a mutation |
|---|---|---|
| Tab vs space unit (strictly more tab-starts) | correct | unit test (M5: `>=` killed) |
| Tie goes to the smaller N | correct | unit test (M4 killed) |
| No increase gives the smallest positive count | correct | unit test (M6 killed) |
| Tab unit with no spaces keeps spaces unchanged | correct | unit test (M8 killed) |
| Leftover spaces kept | correct | unit test (M3 killed) |
| Unindented lines update `prev` | correct | unit test (M7 killed) |
| Blank lines skipped in detection | correct | **only the property test** (M1); the dedicated unit test passes under the mutation |
| Spaces on tab lines counted (clarification) | correct | **only incidentally**, through the delta/output property (M2) |
| "Starts with a tab" means first char, not "contains a tab" | correct | **survives** (M10) |
| Blank lines unchanged in conversion | correct | killed (M9) |
| CRLF | mirror is LF-normalised; `keepLineEnding` re-labels breaks | **no test** |
| Chunk / slice boundaries | correct (state carried across feeds) | core chunk test plus property test at sizes 1–9 |
| `reindentDelta` | exact | property test |

## Major

**MJ-1. F-004.R1 is only partly implemented: the custom 1–8 width cannot be chosen.**
- Where: `src/app/components/Toolbar.tsx:104-107` and `:18-21`.
- Scenario: a user wants 3 spaces. The selector only offers 2, 4 and tab. RULE-01 and MOD-App ("indent selector incl. custom 1–8") require custom, and COPY-indent.custom exists in copy.
- Hidden hazard: `onIndent` does `Number(v)`. A future `custom` option value would give `width: NaN`, and `' '.repeat(NaN)` is `''`, so the re-indent would silently strip every indent. If `state.indent` holds a width other than 2 or 4, the `<select value>` matches no option and shows a wrong choice.
- Fix: add the custom option (COPY-indent.custom with an n picker, 1–8). Parse it into a validated `IndentStyle`, for example with an `indentStyle(width)` helper in core that throws or clamps outside 1–8. Add an e2e test for a custom width.

**MJ-2. AC7 cancel is only tested during detection, not during conversion.**
- Where: `tests/e2e/f004-reindent.spec.ts:157`.
- Scenario: with `slowMs: 40`, pass 1 alone takes about 2 s on 50 MB. The bar text is matched as `Formatting… \d+%`, and the cancel almost certainly lands in pass 1 (fraction < 25%).
- Untested path: the riskier one, pass 2. There, chunks have already been appended to `pending` and `feed()` must discard them and leave the document unchanged (INV-03).
- What else covers it: the worker unit test (`tests/unit/worker-reindent.test.ts:70`) covers only the mirror side.
- Fix: in the e2e test, wait until progress is at least 30% (or until a `reindent` job has been posted, via the seam) before clicking Cancel. Assert the text and bytes are unchanged and that undo has no extra entry.

## Minor

**m-1. The progress bar disappears for about 0.5 s between the two passes.**
- Where: `src/app/controller.ts:476` and `:499`.
- Cause: two separate `run()` calls. The second creates a new `Busy` with `visible:false` and restarts the 0.5 s timer.
- Scenario: on a 50 MB document the bar reaches about 25%, vanishes, then reappears. Cancel is unreachable during that gap.
- Fix: run both passes inside one `run()`. Either keep the busy handle across the confirmation, or (simpler) do the confirmation inside the op while `busy.visible` is kept. Alternatively, start the second run with `visible:true` when the first one was visible.

**m-2. No test that a CRLF document keeps CRLF after a re-indent (R2 / RULE-17).**
- Where: `src/app/controller.ts:509` (`keepLineEnding`).
- Mutation: deleting the `keepLineEnding` wrapper passes every test, but it would flip `lineEnding` to LF and change copy/download output.
- Fix: add an e2e test (or a controller test) that opens a CRLF file, re-indents, and checks `data-line-ending` and the downloaded bytes.

**m-3. Weak or no-op unit tests for the RULE-09 detection details.**
- Where: `tests/unit/core-reindent.test.ts:83`.
- The "blank lines are skipped" case gives N=3 whether or not blank lines are counted (increases {3,3} vs {6,3}, tie goes to 3).
- No example pins the clarification (spaces on tab lines count). For example, `'[\n\t  1\n]'` should give `{tab:true, spaces:2}`, and re-indenting it to 4 spaces should give `'[\n        1\n]'`.
- No example pins "starts with" (M10 survived). For example, `'a\n  \tb\n  \tc\n\td'` has 2 space-starts vs 1 tab-start, so the unit must be spaces.
- Fix: replace the blank-line case with one that discriminates, such as `'a\n        \n  b\n    c'`, and add the two cases above.

**m-4. The property test checks the shape of the indent, not the count.**
- Where: `tests/property/reindent.property.test.ts`.
- The regex `^\t* *$` / `^ * *$` accepts any number of units. Unit counts are checked only through `reindentDelta`, which shares `convert()` with the converter, so a bug in `convert` is invisible to the property.
- Fix: in the property, recompute units for each line with an independent oracle: `tabs + floor(spaces/N)` with N taken from `detectUnit`.

**m-5. The worker-side end of a stream is not tested.**
- Where: `src/worker/engine.ts:540`.
- Mutation: removing `take(conv.end())` passes the worker tests, because no worker test ends with a whitespace-only last line, and none spans more than one slice and compares the result to `reindentText`.
- Fix: add a worker test with a text over 1 M units ending in `'\n   '`, comparing `h.text(conv)` to `reindentText(src, target).text`.

**m-6. A no-op re-indent still rewrites the document and takes an undo slot.**
- Scenario: a 2-space document is re-indented to 2 spaces. In the large tier this costs a full 50 MB rewrite and one of the 3 RULE-15 undo slots.
- Fix: when `!unit.tab && unit.spaces === target.width && stats.tabs === 0`, the result is identical. Skip the conversion and show nothing, or reuse COPY-notice.no_indent.

## Shared `state.indent` (`src/app/state.ts:73`)
A single `signal<IndentStyle>` with a default of 2 spaces is a sensible shared API for F-002 and F-004. Two caveats:
1. It accepts any width, including NaN. Validate at the boundary (see MJ-1).
2. The `IndentStyle` type lives in `core/reindent.ts`. F-002 will import it from there, so consider moving it next to the other ENT types in core.

The behaviours below are fine:
- R5 notice
- Undo goes through `beginReplace('reindent')`
- The >100 MB confirmation
- The stale-version guard
- Invalid documents
- Busy-state toolbar disabling
