// MOD-Worker message protocol (ADR-0005 §3): typed discriminated unions shared by the main
// thread and the worker, a document version and/or job id on every message. Hand-written, no
// RPC library. New operations (validate, format, re-indent, tree queries) plug in by adding a
// `JobSpec` kind with its worker handler and, where needed, a result message.
import type { BreakCounts, ContainerRef, FormatMode, LineEnding, TreeItem, ValidationResult } from '../core';

/** `ChangeSet.toJSON()` of @codemirror/state. */
export type ChangeSetJSON = readonly (number | readonly [number, ...string[]])[];

/** Long-running work, one at a time in the worker, each in ≤ 16 ms / 1 MB slices. `supersedes`: a newer job with the same key drops queued ones
 * (`failed(cancelled, 'superseded')`) — the extension point for F-005 validation of stale versions. */
export type JobSpec = { supersedes?: string } &
  /** Read a chosen or dropped file (F-001.R2/R3): fatal UTF-8 (RULE-13), BOM kept, pending mirror. */
  (
    | { kind: 'loadFile'; file: Blob }
    /** Reload a large-tier undo/redo snapshot (ADR-0006 §4); same path as a file. */
    | { kind: 'loadBlob'; blob: Blob }
    /** Large paste (ADR-0006 §2): replace [from, to) of the mirror with text streamed by `text` messages. */
    | { kind: 'insertText'; version: number; from: number; to: number }
    /** UTF-8 Blob of the mirror at `version` (undo snapshots, copy and download); with `span`,
     * only [from, to) of that version — a node's value (F-006.R5, ADR-0007 §5). */
    | { kind: 'export'; version: number; eol: '\n' | '\r\n'; span?: readonly [number, number] }
    /** Validate the mirror at `version` (F-005.R1): dropped when the document changes first;
     * `lineEnding` is the document's, for ENT-Issue code-point offsets; `skipTable` in the
     * large tiers (RULE-02, measured in UTF-8 bytes by the main thread; ADR-0007 §1). */
    | { kind: 'validate'; version: number; lineEnding: LineEnding; skipTable?: boolean }
    /** Beautify or minify the mirror at `version` (F-002, F-003) into a pending mirror, streaming
     * the result as `chunk`s; refused with `failed(invalid)` when the document is not valid.
     * `lineEnding` is the document's (breaks are reported in it, RULE-07); `nonBreakBytes` is the
     * UTF-8 size of the document without its line breaks (for the result's facts). */
    | { kind: 'format'; version: number; mode: FormatMode; lineEnding: LineEnding; nonBreakBytes: number }
    /** The tree's root node at `version` (F-006, ADR-0007 §2): uses the skip table built during
     * validation, or runs the standalone structural pass (sliced, cancellable, with progress). */
    | { kind: 'treeOpen'; version: number }
    /** Children [from, from + count) of a container at `version` (count ≤ 100, ADR-0007 §2). */
    | { kind: 'treeChildren'; version: number; container: ContainerRef; from: number; count: number }
  );

export type JobKind = JobSpec['kind'];

/** Facts of a text read or built by a job (ENT-Document `lineEnding`, `endsWithLineBreak`, size). */
export interface TextFacts {
  /** Length in editor positions (UTF-16 units, one per line break). */
  length: number;
  breaks: BreakCounts;
  /** UTF-8 bytes of everything but the line breaks. */
  nonBreakBytes: number;
  endsWithLineBreak: boolean;
}

export type FailReason = 'invalid' | 'encoding' | 'too-large' | 'unreadable' | 'cancelled' | 'internal';

export type ToWorker =
  /** Start a job; its pending mirror (if any) waits for `adopt` or `cancel`. */
  | { type: 'job'; jobId: number; job: JobSpec }
  /** Streamed input of an `insertText` job; `end` closes it. */
  | { type: 'text'; jobId: number; text: string; end: boolean }
  | { type: 'cancel'; jobId: number }
  /** A user edit (typing, small paste, in-memory undo/redo) as a change set. */
  | { type: 'edit'; version: number; changes: ChangeSetJSON }
  /** The main thread committed job `jobId` as `version`: its pending mirror becomes current and
   * the superseded one is released (large-tier undo snapshots are `export` jobs sent before). */
  | { type: 'adopt'; jobId: number; version: number }
  /** Re-seed after a restart (ADR-0005 §4): `begin`, `chunk`…, `end`. */
  | { type: 'seed'; phase: 'begin' | 'chunk' | 'end'; version: number; text?: string };

export type FromWorker =
  | { type: 'ready' }
  | { type: 'progress'; jobId: number; fraction: number }
  /** Decoded text of a load job, forwarded per slice (≤ ~1 M units). */
  | { type: 'chunk'; jobId: number; text: string }
  /** A load or insert job finished; its pending mirror waits for `adopt`. */
  | { type: 'loaded'; jobId: number; facts: TextFacts }
  /** A format job finished; its pending mirror waits for `adopt` (MOD-Worker `formatted`). */
  | { type: 'formatted'; jobId: number; facts: TextFacts }
  | { type: 'blob'; jobId: number; blob: Blob }
  /** The result of a `validate` job for `version` (MOD-Worker `validation(version, result)`). */
  | { type: 'validation'; jobId: number; version: number; result: ValidationResult }
  /** Result of a `treeOpen` job (MOD-Worker `treeRows`, ADR-0007 §2). */
  | { type: 'treeRoot'; jobId: number; version: number; root: TreeItem }
  /** Result of a `treeChildren` job. */
  | { type: 'treeRows'; jobId: number; version: number; rows: TreeItem[] }
  | { type: 'failed'; jobId: number; reason: FailReason; detail?: string }
  | { type: 'adopted'; jobId: number; version: number };
