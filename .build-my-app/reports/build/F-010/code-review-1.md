# F-010 code review — round 1

Commit cabb324 (worktree-agent-ae943b14404817106) vs main. Paths are relative to the worktree.
Verdict: **changes requested** (0 blockers, 2 major, 6 minor).

Verified OK: RULE-18 literal / case-insensitive default / non-overlapping / wrap; matches across
1 MB windows (the unit test straddles the boundaries and a property test compares with a naive
oracle); memory is a count + resume offset per window plus a 4-window LRU of positions (no
global match array); highlights are built for `visibleRanges` only; the engine is in MOD-Editor on
the main thread, `@codemirror/search` is not used (ADR-0004); `Mod-f` sits in the editor keymap,
so it fires only while the editor has focus; Escape/close return focus to the editor; field is
labelled, toggle uses `aria-pressed`, count is `role="status"`; 44 px controls on coarse pointers
(search.css:25, 70, 91). `tests/unit/editor-find.test.ts` passes (21/21).

## Major

### M1 — The fold fallback breaks the 8 ms slice (≈ 24 ms per 1 MB window)
`src/editor/find.ts:28-40`. If a 1 MB window contains a single character whose lower case is
longer (in practice `İ` U+0130, as in Turkish names or addresses), `fold` rebuilds the whole
window one character at a time with `+=`. Measured in Node on an M-series Mac: 0.2 ms per window
for ASCII, **24 ms** when the window contains one `İ`. A slice always scans at least one window,
so on a 100 MB document with `İ` spread through it every slice takes about 24 ms on a fast
machine and about 70–120 ms on a mid-range phone. That breaks the ≤ 8 ms slice from ADR-0004 /
MOD-Editor and risks NFR-02 (AC6). The per-character path also loses folding for astral letters
(e.g. Deseret `𐐀`→`𐐨`), because `charAt` returns lone surrogates. So the same term matches in
some windows but not in windows that contain an `İ`.
**Fix:** only `U+0130` expands under `toLowerCase()`, so split on it and lower-case the parts:
`s.split('İ').map((p) => p.toLowerCase()).join('İ')`. This is fast and keeps astral folding.
Add a unit case (an astral capital in a window with `İ`) and a bench or timing assertion for a
1 MB window that contains `İ`.

### M2 — Conformance suite fails instead of skipping when the corpus is absent
`tests/conformance/jsontestsuite.test.ts:76`. This was in place before F-010 (it dates from
F-005), but it affects every branch. Vitest runs the factory of a `describe.skipIf(true)` block
to collect its tests, so `const cases = loadCorpus()` calls `readdirSync` on a missing directory
and the file fails with ENOENT. I reproduced this: a skipped describe whose body throws gives
"Test Files 1 failed". Result: `pnpm test` fails on a fresh clone unless you first run
`pnpm fixtures:jsontestsuite`.
**Fix:** `const cases = hasCorpus() ? loadCorpus() : [];`, or load in `beforeAll`. Keep the
`CI` hard failure at line 73.

## Minor

### m1 — R2 vs the recount: the shown current match is not the selected one
`src/editor/find.ts:279-282, 291-296`, `src/editor/index.ts:346`. After an edit, `restart()`
picks a new current match (the first match at or after the caret), counts and highlights it as
`n of N`, but does not select it. The first Next then selects that same match instead of moving.
Not selecting is the right behaviour: selecting would steal the caret while the user is typing
(F-001.R1). But it departs from the literal wording of R2 ("the current match is selected"), and
the spec does not say what Next does after a recount.
**Fix:** record this as a decision (F-010 edge case: "a recount keeps the editor selection; the
current match is the first at/after the cursor and is highlighted; Next/Previous select it
first"), or drop "current" after a recount (show `– of N`) until the user navigates. The code
needs no change if the spec is clarified.

### m2 — Recount in large documents blanks the count and the highlights
`src/editor/find.ts:267-276, 329-342`; `SearchPanel.tsx:14-20, 53`. Each document change
creates a new index with `cur = null`. Until the scan reaches the caret's window, which can be
most of a 100 MB document, the first slice publishes `current: null`. The count goes blank,
Previous and Next turn disabled (`total` restarts at 0), and the visible highlights disappear
because the new index has not scanned those windows. This happens on every keystroke in the
editor. The same blank (no `COPY-search.counting`) appears on the first search when the caret is
deep in the document.
**Fix:** keep showing the previous status and decorations (mapped) until the new index resolves
its first match, or show `COPY-search.counting` with a placeholder current. Add an e2e that types
in the editor on the 100 MB fixture with find open. AC6 currently measures typing only in the
field.

### m3 — The live region announces every slice
`src/app/components/SearchPanel.tsx:87-89`. The `role="status"` text changes after each 8 ms
slice while counting (`1 of 1,204+`, `1 of 2,311+`, …), so screen readers queue a long run of
polite announcements (NFR-06).
**Fix:** render the visible count as now, but feed a visually hidden polite region that changes
only when the first match is found, when the count becomes final, and on navigation (or debounce
it to about 500 ms).

### m4 — No real hook for "find while the tree is shown"
`src/app/find.ts:19-29`. The edge case is covered only by a comment. When F-006 adds the view
signal, nothing forces `show()` to switch to the text view.
**Fix:** inject a callback now, e.g. `new FindController(() => this.editor, () => this.showTextView())`
with a no-op `showTextView` in `AppController`, and call it first in `show()`. Note it in F-006's
build notes so its AC wires the switch.

### m5 — The panel takes Ctrl+F on macOS
`src/app/components/SearchPanel.tsx:41`. `(e.metaKey || e.ctrlKey)` catches Ctrl+F on macOS,
which in a text field is the native "move forward one character" key. The editor keymap uses
`Mod-f` (Cmd on Mac) correctly.
**Fix:** use the platform modifier only (`isMac ? e.metaKey : e.ctrlKey`), matching
platform-mapping.md.

### m6 — Property test cannot catch fold bugs
`tests/unit/editor-find.test.ts:12-24`. The oracle uses the same `fold` as the code under test,
so a wrong fold can never fail it. M1's astral inconsistency passes unnoticed.
**Fix:** compare the oracle against `a.toLowerCase() === term.toLowerCase()` (with the `İ` and
`ς` exceptions spelled out), and add astral letters and `İ` to the generator alphabet.

## AC test coverage
AC1–AC10 all have tests in e2e and/or unit. Gaps: editor typing at 100 MB with find open (m2),
and fold performance (M1).
