---
id: MOD-IO
title: Device I/O — file open and drop, clipboard, download
status: draft
depends_on: [MOD-Worker, MOD-Copy]
---

## Responsibility
Adapters between user gestures and browser I/O, each with the fallback the spec requires
(platform details in `platform-mapping.md`): the hidden file input for the open action; the
drag-and-drop controller for the whole tool (shows CMP-DropOverlay only for file drags, takes
the first file and reports multiple files, rejects folders and non-file content outside the
editor); hands `File` handles to the worker (no reading on the main thread); clipboard write
of whole documents, paths and node values (plain text for short strings, a worker-built Blob
via a clipboard item for large ones, created inside the user gesture), reporting "blocked" so
the caller can apply the select-and-tell fallback; download via a Blob object URL and a
`download` link named per RULE-10, with revocation and a "blocked" outcome where detectable.

## Not responsible for
- Deciding names, tiers, confirmations, or messages (MOD-App with MOD-Copy).
- Encoding validation (MOD-Worker).

## Public surface
- `pickFile()` → `File | null`; `installDropTarget(root, { onFile, onRejected, onOverlay })`.
- `copyText(text)`, `copyBlob(blobPromise)` → `"copied" | "blocked"`.
- `download(blob, name)` → `"started" | "blocked"`.
- `downloadName(source, lastOperation)` (RULE-10, pure).

## Implements
F-001.R2, F-001.R3, F-006.R9 (blocked outcome), F-007.R1, F-007.R2, F-007.R3 (blocked
outcome), F-007.R4, F-007.R5; RULE-10; INV-02; NFR-01.
