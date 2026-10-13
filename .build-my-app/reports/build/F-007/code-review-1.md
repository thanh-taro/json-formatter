# F-007 code review 1 — commit 506dfcc (worktree-agent-a241f98dd202ee62e)

Scope: `git diff main...worktree-agent-a241f98dd202ee62e`. Checked against F-007 (R1–R6, AC1–AC8),
RULE-10, INV-02, NFR-01/02, D-023/D-025, MOD-IO, SP-iframe, SP-pipeline.
Unit tests: `tests/unit/io-export.test.ts` 11/11 pass; `tsc --noEmit` clean.

**Verdict: no blockers, no majors. 5 minors.**

## Verified OK
- **The write happens inside the user gesture.** `copy()` calls `run()`, and `run()` calls `op` synchronously. `op` calls
  `exportJob` and `copyBlob`, and `copyBlob` calls `clipboard.write([new ClipboardItem({'text/plain': Promise<Blob>})])`
  before the first `await`. So the call stays inside the click activation in WebKit and Chromium. This matches MOD-IO and
  SP-pipeline.
- **Blocked versus failed.** A refused write resolves to `blocked` (no API, constructor throws, the call rejects, WebKit
  above ~120 MB rejects late). A failed or cancelled export passes its own error on (`exportFailed` flag). Too-large and
  internal export failures go to the normal failure bar. When the write is refused early, the export job is cancelled
  (controller.ts `if (outcome === 'blocked') job.cancel()`).
- **Fallback.** Switches to the text view, selects the whole document (0..len), focuses the editor, and shows
  COPY-error.clipboard as an error bar (`role=alert`). The AC4 test covers a real refusal in Chromium (frame without
  `allow="clipboard-write"`).
- **Download.** Blob from the worker → object URL → hidden `<a download>` → click → remove. The URL is revoked after 60 s.
  No network request, and AC5 checks both the page request log and the server log. Bytes are exact: the CRLF + BOM +
  non-BMP test compares byte for byte. The text is UTF-8 via TextEncoder in the worker.
- **Memory.** No extra full copy on the main thread. `new Blob([b])` in `copyBlob` only references the worker Blob. The
  only transients are in the worker (encoded parts plus the Blob), which existed before this change.
- **Progress and cancel.** Both actions use `run('progress.exporting')`: progress shows after 0.5 s and can be cancelled.
  Cancel also abandons a write that is still pending (race with `cancelled`). The cancel test checks that nothing is
  copied, no message is shown and the tool is idle.
- **Disabled when empty.** `off = empty || busy` in the Toolbar, plus `ed.isEmpty` guards in the controller. There is an
  e2e test for this.
- **RULE-10 naming.** `downloadName` is correct.
- **File names (security).** The source name comes from `File.name`, which has no path. The browser sanitises the
  `download` attribute, so no extra sanitising is needed.

## Findings

### m1 (minor) — AC7 test passes without testing anything, and `state.view` is dead code
`src/app/components/Toolbar.tsx:103-107`: the view switch is hard-coded (`aria-pressed="true"`/`"false"`, no handler).
`src/app/state.ts` `view` signal: nothing reads it.
`tests/e2e/f007-copy-download.spec.ts:192-209` (AC7) clicks "Tree". That click does nothing, then the test asserts that
"Text" is pressed, which is always true. The test reports AC7 as covered when it is not.

Fix: mark AC7 as `test.fixme` (pending F-006), or keep it and add an explicit note "tree view not present — AC7
re-verified by F-006". Add an AC7 item to F-006's checklist so the copy fallback is wired to the real view state there.

### m2 (minor) — `lastTool` is not part of undo history
`src/editor/index.ts:590,625`: `lastTool` is a plain variable, set on commit and never restored by undo or redo.

Scenario: paste `{\n "a": 1\n}` → minify → undo (the pretty text is back) → download. The file is saved as
`minified.json` even though the content is not minified. The same happens after redo across a load.

Fix: store the tool kind in the history entry (history entries already carry `tool: ToolKind`). Then derive `lastTool`
from the entry at the current history position, or set it in `historyStep`.

### m3 (minor) — AC2/AC3 do not test naming end to end
`tests/e2e/f007-copy-download.spec.ts:257-301`: until F-002/F-003 land, "beautify" does nothing and AC3 is skipped.
AC2 passes only because of `sourceName`. No e2e test checks that `formatted.json`/`minified.json` follow from a real
tool operation. The controller → `lastTool` → `downloadName` wiring is also not unit-tested.

Fix: add a unit or controller test that commits `beginReplace('minify')` on a pasted document and checks the name. Or
track un-skipping AC3 as a hand-off item for F-002/F-003.

### m4 (minor) — no real-clipboard test for a slow promised copy
AC8 and the cancel test (`spec.ts:211-255`) stub `navigator.clipboard` in every engine. The only real-clipboard copy
(AC1, Chromium) finishes in milliseconds. So no test shows that a real `ClipboardItem` promise still resolves when the
worker export takes longer than the transient-activation window (about 5 s in Chromium; seamWorker `slowMs` makes this
easy to reproduce). WebKit has no real-clipboard coverage at all; the SP-iframe "Not covered" item is still open.

Fix: add one Chromium test with a real clipboard, `seamWorker({slowMs})` and a few MB of data, so the export takes more
than 5 s, then read back the length. Record the WebKit manual check in the F-007 report as an open item.

### m5 (minor) — toast live region is mounted together with its content
`src/app/components/Toasts.tsx:9-10`: the component returns `null` when there are no toasts. So the `role="status"`
element enters the DOM already holding "Copied". NVDA and VoiceOver often do not announce live regions that are inserted
with their content, so the copy confirmation (R1) may be silent for screen-reader users.

Fix: always render the `.tk-toasts` container with `role="status"` / `aria-live="polite"`, and add or remove only the
toast items inside it.

### Nits (no action required)
- `controller.ts showToast`: the toast `setTimeout`s are not cleared in `detach()`. This is harmless because the signals
  outlive the controller.
- `controller.ts:276`: toasts reuse the `barSeq` counter. This is harmless, but a separate counter would be clearer.
