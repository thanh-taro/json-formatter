# F-001 Load a document — code review 1

Scope: `git diff main...worktree-agent-a4629d9eff1d9eb4b` (commit 8b4f0fd vs merge base c01253e).
Line numbers refer to the worktree `.claude/worktrees/agent-a4629d9eff1d9eb4b`.
Verdict: **changes required**. There is 1 blocker and 6 major findings. The design mostly holds up as a base for later features (see the end of this report).

## Blocker

### B1. Cancelling while the pending text commits freezes the tab
`src/editor/index.ts:352-373` (`makePending`)
- **Scenario:** the worker has posted `loaded` for a 30–100 MB file. `commit()` is still waiting for the builder to drain its queue (the builder lags behind the worker's 1 MB/16 ms output). The user clicks Cancel. `feed` calls `pending.discard()`. `pump()` now returns at once (`!discarded` is false), but `builder.idle` stays false. `while (pumping || !builder.idle) { kick(); await pumping; }` then spins in microtasks forever, so the main thread hangs. INV-03 and PRN-04 are both violated.
- **Not covered by tests:** the AC9 e2e test slows every worker message, so it always cancels before `loaded` arrives.
- **Fix:**
  - At the top of the loop, `if (discarded) throw …`, or make `pump` drop the queue when it is discarded.
  - Add a unit test for "discard while commit awaits".

## Major

### M1. The re-seed after a watchdog restart is not serialized with edits, jobs or a second restart
`src/app/controller.ts:39, 305-328`
- **What goes wrong:**
  - `reseed` does not set `state.busy`, so Clear, Open and Undo stay enabled. If the restart happens during a job, `run()`'s `finally` makes the editor editable again in the middle of the seed.
  - A `clear()` or a keystroke during the seed sends an `edit`, which is applied to the worker's still-empty mirror. That fails the length check and triggers a restart. That restart's `reseed` is then skipped because `reseeding` is still true. The rest of the chunks go to the new worker without a `begin` and are ignored, so the new mirror stays empty.
  - Any large-tier tool operation in this window queues `export`. That captures the empty or stale mirror, so the undo Blob is wrong and undo restores the wrong document (INV-04).
  - A commit that lands while a seed is in flight leaves the mirror on the old document with no error.
- **Fix:**
  - Run the re-seed as a busy operation (no cancel), or queue user operations behind it.
  - Use a generation counter: restart the seed from `begin` if the worker restarts during it, and re-check `ed.version` at `end`.
  - Have the worker defer `edit`, `export` and `job` messages until the seed `end`.
- **Missing test:** terminate the worker, then compare an export with the editor text after typing, Clear and undo.

### M2. A failed snapshot export permanently breaks undo
`src/editor/index.ts:329, 393, 419`; `src/app/controller.ts:287-299`; `src/editor/history.ts:24-27`
- **Scenario:** `Snapshot.blob` is a promise created when the operation commits. If that export fails (watchdog restart, out of memory), the promise rejects and nobody handles it (unhandledrejection). Later, `history()` awaits it, `step.abort()` pushes the same entry back, and every following undo fails the same way with COPY-error.too_large. All older history becomes unreachable.
- **Fix:**
  - Attach a `.catch` when the snapshot is created.
  - On failure, drop that entry (and everything older), or re-export.
  - Do not push an entry back if its Blob has rejected.

### M3. Undoing a paste does not restore the document's line ending
`src/editor/index.ts:224, 277-284, 409-410, 530-537`
- **Scenario:** an LF document `[1,\n2]` gets a paste of `"a"\r\n"b"\r\n"c"`, so `lineEnding` becomes `crlf` (correct, RULE-17). After undo the text is `[1,\n2]` again, but `lineEnding` stays `crlf` (`facts: null` means the current facts are reused). As a result:
  - `data-bytes` and the tier are computed with the wrong line ending;
  - F-007 will write CRLF for an LF document, which breaks the round-trip of uniform LF documents (ADR-0006 §3);
  - RULE-07 beautify will insert CRLF.
- The same happens for large pastes (`beginPaste`) and for redo.
- **Fix:** store the previous `DocFacts` in paste entries, at least when the line ending changes, and apply them on undo and redo.

### M4. CMP-Toolbar has no arrow-key navigation
`src/app/components/Toolbar.tsx:13`
- `role="toolbar"` is set, but every button is a separate Tab stop, and there is no roving `tabindex` or ArrowLeft/Right/Home/End handling. The spec requires arrow keys (CMP-Toolbar Accessibility, NFR-06).
- **Fix:** add a roving tabindex: a single Tab stop, arrows move between items, and disabled items are skipped or stay focusable as ARIA allows.
- **Missing test:** an e2e test for the arrow keys.

### M5. Wrong progress text for a large paste and for undo restore
`src/app/controller.ts:257, 286`; `src/app/state.ts:18`
- Both use `progress.exporting` ("Preparing…"). The spec (UX notes, updated on main in 308820a) requires COPY-progress.inserting and COPY-progress.restoring.
- **Fix:** widen the `Busy['label']` union, add the two strings, and assert them in e2e tests (2 MB paste, AC12 undo).

### M6. The worker can keep up to the whole paste in memory after a large-paste job ends
`src/worker/engine.ts:158-162, 233-236, 246`; `src/app/controller.ts:265-275`
- **Scenarios:**
  - **Text after a failure:** the `text` handler creates an inbox for any job id. When `insertText` fails (stale version, `fail()` deletes the inbox), the main loop keeps sending the rest of the paste (it only checks `stop`). That re-creates the inbox and keeps up to 100+ MB alive in the worker forever.
  - **Cancel before the job runs:** if a job is cancelled while still queued (for example behind a 100 MB snapshot export), the drain loop skips it but never deletes the inbox that already holds the text.
- **Fix:**
  - Create inboxes only in `enqueue`, and ignore `text` messages for unknown or finished jobs.
  - Delete the inbox in the cancel path and in the drain skip path.
  - Stop the main loop as soon as `job.result` settles.

## Minor

- **m1 — a failed adopt goes unnoticed** (`src/worker/client.ts:151-159`, `engine.ts:182-184`). The worker answers a failed adopt with `failed(jobId, 'nothing to adopt')`, but by then the client has removed the job, so the message is dropped. The mirror is then out of sync with nothing reported. Treat an adopt failure like `jobId -1`: restart and re-seed.
- **m2 — dropping a file while the confirmation is open** (`src/app/controller.ts:194-209`). Drop listeners stay active, and a second drop overwrites `state.confirm`. The first promise then never settles. After Continue, `run()` may silently ignore the file because the app is busy. Guard with a confirm-pending flag (treat it as busy) or resolve the earlier promise with `false`.
- **m3 — repeated confirmation on very large documents** (`src/editor/index.ts:219`). Once a document is already very large (and confirmed), every paste, even one character, asks for confirmation again. RULE-02 asks only when the paste "would make the document exceed" 100 MB. Ask only when the document is crossing the threshold.
- **m4 — export line ending defaults to LF** (`src/worker/client.ts:206`). `exportBlob(version, eol = '\n')` defaults to LF. This is harmless for undo snapshots, but a trap for F-007 copy and download on CRLF documents. Make `eol` a required argument, or derive it from the document's `lineEnding`.
- **m5 — boundary drift from MOD-Editor's public surface** (`src/editor/index.ts:100-101, 70`). `EditorHandle.view` exposes CodeMirror to MOD-App. The `snapshot` callback replaces the specified `attachUndoBlob(blob)`, and `beginPaste` and `chunks` are extra. Either hide `view` and update MOD-Editor.md, or align the code with the spec.
- **m6 — long main-thread task on in-memory undo/redo** (`src/editor/index.ts:413`). Undo or redo of a normal-tier tool entry posts `entry.changes.toJSON()`, which is the whole previous document (up to 10 MB) as a line array, in one synchronous postMessage. This can take hundreds of ms (NFR-02). Re-seed through the chunked path instead.
- **m7 — whole-app re-renders** (`src/app/Formatter.tsx:15-33`). `Formatter` reads the `doc`, `cursor` and `busy` signals at the top, so the whole tree re-renders on every keystroke, cursor move and progress message. Read the signals in leaf components and throttle progress to animation frames (platform-mapping).
- **m8 — test gaps:**
  - AC12 e2e performs 4 loads in total, so only the in-memory entry of the first load is trimmed. Use 1 load plus 4 operations, which trims a Blob entry and checks that the notice appears once across 2 trims.
  - None of the following are tested: cancel during commit (B1), watchdog restart plus re-seed (M1), line ending after undoing a paste (M3), toolbar arrow keys (M4), progress copy (M5).
- **m9 — unbounded set in the worker** (`src/worker/engine.ts:137`). `cancelled` grows for the whole session. Delete ids once a job is acknowledged.

## Fit for F-002/3/4/5/6/7/10

The base mostly fits:
- `beginReplace(kind)`, `feed()` and the `JobSpec` union are clean extension points.
- Undo Blobs are captured at enqueue, so the export order is correct.
- `setHidden` exists for F-006.

Needed adjustments:
- `feed()` hard-requires `result.type === 'loaded'`. Generalise it for F-002 `formatted` facts.
- Widen the `Busy` label union.
- The worker queue is FIFO with no supersede or priority, which F-005 validation needs (debounce, drop stale versions).
- Make `exportBlob`'s `eol` explicit for F-007.
- Fix M1 before any feature relies on the mirror for tree, export or copy.
