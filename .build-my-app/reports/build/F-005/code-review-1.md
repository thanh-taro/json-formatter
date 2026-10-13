# F-005 code review — round 1

Branch `worktree-agent-a52b4abcd32c3dbb2` @ 40907b9 vs `main` (`git diff main...`). Paths below are relative to the worktree.
Verdict: **no blockers, 2 major, 8 minor.** The tokenizer is correct on everything I probed.

## Verified (no finding)
- **RULE-04 positions.** I probed every code, plus the clarifications on main 4ec17c8: raw LF or TAB in a string → `control-character`; lone `/` → `unexpected-character`; BOM plus whitespace → `empty-document`.
- **AC2–AC5, AC9–AC11.** All pass, including 10,001 nested objects.
- **ENT-Issue positions.** Line, column and offset are correct with LF, CRLF (the editor's `\n` plus the `crlf` ending gives 2 per break) and lone CR. Columns count surrogate pairs as one code point, also when the pair is split across chunks. A BOM is not counted.
- **Chunk-boundary independence.** Keys with escapes split across chunks, numbers, literals and `/` all behave the same at any chunking. Property tests cover chunk sizes 1–9.
- **Depth.** The stack is iterative (typed arrays). 1,000,000 `[` stops at level 10,001.
- **Numbers and warnings.** The unsafe-number fast path is sound (≤15 digits and no exponent cannot be unsafe). The warning cap works (1,500 warnings → 1,000 listed + 500).
- **Duplicate keys.** Names are compared decoded, the linear-to-`Set` switch happens at 16 keys, and nested scopes are kept separate.
- **Skip table (ADR-0007).** Compaction keeps ancestors, and child counts come from comma counts.
- **Stale results (INV-05).** A result is shown only when `editor.version === v`. The worker drops a running validation at the next slice. Queued validations are superseded. The mirror is immutable, so the identity-based outcome cache is safe.
- **Security.** Hints are built from codes and params only. No document text goes into messages. JSX escapes everything; no `innerHTML` in the new code.
- **Test runs.** Conformance runs locally (318 cases) and in CI (`pnpm fixtures:jsontestsuite` fails the job if the download fails). `vitest`: 178/178 pass.
- **Throughput.** Measured in Node: 100 MB validated in 0.50–0.59 s, with or without the skip table.

## Major
**M1 — `src/editor/index.ts:226-231` blocks the main thread on long lines (NFR-02, NFR-04).**
- `reportCursor` runs `codePointColumn` over the whole line up to the cursor, on the main thread, 150 ms after each cursor change.
- Measured: 80–115 ms for a 49.5 M-unit line, and about twice that at 100 MB.
- Scenario: a minified 50–100 MB document, cursor near the end. Every click, arrow pause or typing pause causes a 100–200 ms long task, so typing and scrolling jank.
- Fix: keep a cached per-line surrogate index (built once per line version, in ≤8 ms slices or in the worker). Or count incrementally from the previous head on the same line. Until the count is ready, show the UTF-16 column (it is exact when the line has no surrogates).

**M2 — `src/worker/engine.ts:404` (also `:241`, `:402`) keeps an old document in memory (NFR-04).**
- `skipTable` is only set, never cleared, and it holds a reference to its `Mirror`.
- Scenario: load a valid 100 MB file (table built), then load an invalid or small document. The old 100 MB mirror stays reachable through `skipTable`, so it is never garbage-collected. That is about +100 MB against the 1.5 GB budget.
- `validated` has the same problem until the next validation finishes.
- Fix: `this.skipTable = outcome.skipTable ? {...} : null` on every result. Also clear `skipTable` and `validated` when a different mirror is adopted or seeded.

## Minor
**m1 — `src/app/controller.ts:165` can leave the status at "Checking…" forever.**
- Every rejection is swallowed. A `failed(internal | too-large)` from a validator exception or an allocation failure is never retried and never shown.
- Fix: ignore only `cancelled`. For other reasons, show COPY-error.failed and/or retry once.

**m2 — `src/app/controller.ts:180` announces the same error on every keystroke.**
- The announcement key is `code@line:column`. Typing on the last line of an unclosed document moves the `unclosed-container` column with each key, so the error is re-announced each time. SCR-Formatter says "once per new error, not on every keystroke".
- The e2e "announced once" test (`tests/e2e/f005-validate.spec.ts:296`) only checks the text is there; it never types a second key.
- Fix: key on code + `openPos`/bracket (position-independent for EOF errors), or on the error mark's mapped position. Add an e2e test that types on the last line and asserts the live region does not change.

**m3 — `controller.ts:194`, `IssuePanel.tsx:103`, StatusBar jump: jumping while checking uses old positions.**
- While `checking`, the listed issues carry `pos` values from the previous version. The editor marks are mapped through edits, but the jump target is not, so jumping lands on the wrong character.
- Fix: jump to the mapped range from the marks field, or map `pos` through the changes made since the result's version.

**m4 — `src/worker/engine.ts:390` debounce occupies the single job slot.**
- The 200 ms `sleep` runs inside the job. Copy, export, beautify or tree requests made right after typing in a document over 1 MB wait for the sleep plus a full validation (up to about 1 s at 100 MB).
- Fix: debounce before enqueueing (a timer in `enqueue` for `validate`), and/or let a user-initiated job cancel and requeue a running validation.

**m5 — `src/worker/engine.ts:30,338,394` uses the wrong measure for the skip-table cutoff.**
- The cutoff is 10 M UTF-16 units, but RULE-02 tiers are in UTF-8 bytes. Non-ASCII documents can be in the large tier (> 10 MB) with fewer than 10 M units, so they get no table and the first tree open falls back to the standalone pass.
- Fix: send the tier (or the byte count) with the `validate` job; use bytes for the load path too.

**m6 — `src/app/controller.ts:160` makes the status flicker for small documents.**
- Every keystroke flips the status to "Checking…" and dims the issue panel for a frame or two, even though the result comes back within milliseconds.
- Fix (optional UX): show `checking` only after about 100–150 ms in the normal tier, while still marking the state internally (AC8 is unaffected).

**m7 — `tests/property/validate.property.test.ts` checks validity and chunking only.**
- No property checks warning correctness (decoded duplicate keys, unsafe numbers) or error codes and positions against an oracle. ADR-0005 cites a duplicate-key bug that only a property oracle caught.
- Fix: work out the expected `duplicate-key` positions from the generated tree (decode each key with `JSON.parse` of the key string alone) and expected `unsafe-number` from the generated spellings. For single-character mutations, assert the code and position for the mutation classes with known answers.

**m8 — No NFR-03 benchmark.**
- ADR-0005 says "the core is benchmarked in isolation", and NFR-03 asks for a benchmark suite. The numbers I measured meet the target, but nothing in the repo records them.
- Fix: add a bench for 10 and 100 MB validation (plain and with the skip table) and record the results.

**m9 — `tests/e2e/f001-load.spec.ts:214,240,267,282,387,604,608` rewrites committed screenshots on every run.**
- `page.screenshot` writes unconditionally to the committed `.build-my-app/reports/build/F-001/*.png`. F-005 changed the status bar (validity, size and lines), so every e2e run, CI included, now replaces those files with the F-005 UI and dirties the tree.
- Fix: make screenshots opt-in (`if (process.env.SCREENSHOTS)`), or write them to `testInfo.outputPath()`.

Note on the conformance test: `describe.skipIf(!hasCorpus())` would skip quietly if the fetch step were ever removed from CI. Consider `if (process.env.CI && !hasCorpus()) throw`.

Process note: to measure M1 I created a temporary probe test in the worktree's `tests/unit/` and deleted it right after; `git status` is clean. All other probes ran from the scratchpad.
