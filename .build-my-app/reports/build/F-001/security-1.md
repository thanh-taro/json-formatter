# F-001 security / privacy review 1

Scope: `git diff main...worktree-agent-a4629d9eff1d9eb4b` (worktree `.claude/worktrees/agent-a4629d9eff1d9eb4b`).
Paths below are relative to that worktree. References: NFR-01, INV-02, INV-03, RULE-13, ADR-0005/0006/0009, platform-mapping.md.

Verdict: **no blockers**. 1 major, 6 minor, 4 info.

## Confirmed OK
- **No persistence (NFR-01):** there is no localStorage, sessionStorage, IndexedDB, Cache API or `console.*` in `src/`. Undo snapshots are worker-built `Blob`s that only the history holds (`editor/history.ts`). They are released when RULE-15 trims the history or when redo is cleared. No `createObjectURL` is used in F-001, so nothing needs revoking.
- **No network (INV-02):** there is no fetch, XHR, WebSocket or sendBeacon. The new dependencies (CodeMirror 6, @lezer/highlight, and lucide-static, which is inlined at build) make no calls. The `/*` header CSP has `connect-src 'none'` and also applies to the worker script under `/assets/*`.
- **CSP:** the worker is a same-origin module worker (`worker/client.ts:55`), not a `blob:` worker. There is no eval or `new Function`. CodeMirror is mounted in a shadow root with adopted stylesheets (`editor/index.ts:176`). Its `style` attributes and Preact's `style={{…}}` (`NoticeBar.tsx:28`) are written through CSSOM (`style.cssText`/properties), which `style-src 'self'` allows. The e2e tests check `securitypolicyviolation`.
- **Injection:** file names and messages are rendered as JSX text or attributes and never as HTML. `dangerouslySetInnerHTML` (`Icon.tsx:28`) only gets SVGs that are fixed at build time.
- **File handling:** the very-large confirmation uses `file.size` before any read (`controller.ts:209`). The worker reads in 1 MB `slice()` windows with `TextDecoder('utf-8', {fatal:true, ignoreBOM:true})`, and the final `decode()` flush catches a truncated sequence at the end (`engine.ts:255-276`). The previous document is kept until commit (INV-03).
- **Drag-drop:** file drops are intercepted at window capture, so the engine never inserts file text. Folders are refused with `webkitGetAsEntry().isDirectory`, which is called synchronously inside the drop event. Non-file drops outside the editor get `error.not_a_file`. With several files, only the first is loaded.
- **Clipboard:** paste uses `clipboardData` from the paste event only. No clipboard-read permission is needed (Permissions-Policy `clipboard-read=()`).
- **Worker messages:** the trust boundary is a dedicated same-origin worker. Messages are typed discriminated unions with a job id or version. `ChangeSet.fromJSON` validates edits, and a desync triggers a restart and re-seed.

## Findings

### MAJOR-1: A memory failure on the main thread during a commit can silently truncate the document
- **Location:** `src/editor/builder.ts:33-40` (the piece is dequeued before `append()` runs), `src/editor/index.ts:352-357` (`pump()` rejects into a detached `.finally()`), `src/editor/index.ts:368-376` (`commit` has no integrity check).
- **Scenario:** a `RangeError` can occur in `append()`. Examples are `carry.join('')` on a line of more than about 512 M characters, or `Text.of` under memory pressure. It happens during a background pump, while `commit()` is not awaiting. The rejection is unhandled and the piece is already lost. The next `append()` starts a new pump, and `commit()` later succeeds, so the document is committed with text missing and no error is shown. This breaks F-001.R9/AC10 ("loading stops, user told") and integrity (INV-01/INV-03).
- **Fix:** in `makePending`, latch the first error (`pump().catch(e => failure ??= e)`) and make `append`/`commit` rethrow it. In `step()`, dequeue only after `append` succeeds. As a guard, `commit` should also assert `text.length === facts.length` (the worker's mirror length is already in `TextFacts`) and throw `JobFailure('internal')` on mismatch.

### MINOR-1: The streamed large paste keeps sending after the worker job fails, and the worker keeps the text
- **Location:** `src/app/controller.ts:260-276` (the loop stops only on user cancel), `src/worker/engine.ts:158-162` (`text` for an unknown or failed job creates a new inbox).
- **Scenario:** an `insertText` job fails, for example with an OOM `RangeError` or "stale insert". `feed` rejects, but the main thread keeps posting the rest of the paste (up to hundreds of MB). After `fail()`, the worker recreates an inbox for the job id and buffers that text indefinitely. This leaks document content in worker memory for the rest of the session and makes a worker crash more likely during the memory-exhaustion path.
- **Fix:** set `stop = true` when `feeding` settles (`feeding.catch(() => (stop = true))`). In the worker, ignore `text` messages for job ids in `cancelled` or with no queued or running `insertText` job.

### MINOR-2: Read errors are shown with the wrong message
- **Location:** `src/worker/engine.ts:119`, `src/app/controller.ts:111`, `src/app/controller.ts:153`.
- **Scenario:** any `TypeError` (including a programming bug) is reported as `error.encoding`. Any `internal` failure, such as a `NotReadableError` when the file was moved or deleted or permission was denied, or a worker restart, is shown as `error.too_large`. Users get a misleading reason. RULE-13 requires the user to be "told why".
- **Fix:** classify encoding errors only around `decoder.decode()`, by wrapping that call. Map `DOMException` `NotReadableError`/`NotFoundError` to a "could not be read" message. This needs a new COPY id, so a spec change is required. Map other `internal` failures to a generic failure message.

### MINOR-3: An external text drop into the editor skips the large-paste path and the RULE-02 confirmation
- **Location:** `src/io/index.ts:108` (a non-file drop inside the editor is passed to the engine), `src/editor/index.ts:199-227` (only `paste` is gated).
- **Scenario:** dropping a very large text selection from another app into the editor inserts it synchronously through CodeMirror. There is no very-large confirmation and no chunking. The main thread freezes or runs out of memory and the tab can crash with the previous document lost. The edge case only allows drags within the editor.
- **Fix:** add a `drop` domEventHandler that sends `text/plain` drops through the same size check as `pasteHandler` (`onLargePaste` above `LARGE_PASTE` or very-large).

### MINOR-4: A second load during the confirmation dialog orphans the first prompt
- **Location:** `src/app/controller.ts:194-209`, `src/app/controller.ts:235-255`.
- **Scenario:** `busy` is not set while the dialog is open. A drop (window listeners stay active) or a paste can therefore start a second `confirmVeryLarge` that overwrites `state.confirm`. The first promise never resolves, and its `File` or paste text (possibly hundreds of MB) stays in memory for the session.
- **Fix:** if `state.confirm.value` is set, refuse or ignore new loads, or resolve the previous prompt with `false` before replacing it.

### MINOR-5: A failed snapshot export is unobserved and breaks undo for good
- **Location:** `src/editor/index.ts:329`, `src/editor/index.ts:393`, `src/editor/index.ts:419`, `src/app/controller.ts:288-299`.
- **Scenario:** a `snapshot()` promise can reject, for example after a worker restart or OOM. That raises an unhandled rejection (the message contains only the reason, not content). The entry stays in history, `step.abort()` puts it back, and every later undo fails with `error.too_large` (INV-04).
- **Fix:** attach a `.catch` when recording that marks the entry as unavailable, and tell the user once, for example with `undo_trimmed` or a dedicated COPY id. On reload failure, drop the entry instead of putting it back.

### MINOR-6: The spec wording on Blob paging does not match NFR-01
- **Location:** `specs/50-quality/nfr.md:8` ("no document content persisted anywhere (memory only)") contradicts `specs/40-technical/adr/ADR-0006-…md:43` and `architecture.md:232` ("browsers may page large Blobs to disk").
- **Impact:** Chromium spills large in-memory Blobs to `<profile>/blob_storage/` temp files, and WebKit may also do so. The files are deleted when the Blob is released or at the next browser start (after a crash). This is acceptable, but the written promise and the design disagree. COPY-privacy.details ("never … stored") would then rely on browser behaviour.
- **Fix:** record a decision and amend NFR-01 to say "not persisted by the tool; the browser may temporarily swap large in-memory data, discarded when the page closes". Mention this in F-009 details if the claim needs to be exact.

### INFO
- `src/app/Formatter.tsx:26`: `data-source-name` puts the file name in the DOM. It is safe as an attribute, but extensions or same-origin scripts can read it. Prefer exposing it only in test builds.
- `src/worker/client.ts:84-90`: there is no `messageerror` listener. A message that fails to deserialize is caught only by the 1 s watchdog. Listen for it and restart immediately.
- `src/worker/engine.ts:137`: the `cancelled` set grows for the whole session (job ids only, negligible). Delete ids once their job settles.
- `src/worker/engine.ts:247`: failure `detail` carries `e.message`. That is not content today, and it is not displayed or logged. Keep it that way: never put text excerpts in error details (INV-02 hygiene).

## Store privacy declarations (data collected)
- **Collected / transmitted:** none. There are no analytics, identifiers, crash reports or network calls after load (INV-02, NFR-01). Apple: "Data Not Collected". Google Play Data safety: no data collected, no data shared.
- **Processed on device only (not collected):** user content (JSON or text from typing, paste, file open or drop). File metadata: name (held as `sourceName`), size, line-ending facts. All of it is in memory only and discarded on page close. Large-tier undo snapshots are in-memory Blobs that the browser may temporarily page (MINOR-6).
- **Permissions:** none requested. File access is through the user-initiated picker or drop. Paste uses only the user-initiated paste event, with no clipboard-read permission.
