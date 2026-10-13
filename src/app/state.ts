// MOD-App state in signals (ADR-0002): document facts (ENT-Document), busy operation with
// progress and cancel, the notice bar, the confirmation dialog and the drop overlay.
import { signal } from '@preact/signals';
import type { LineEnding, Tier } from '../core';
import type { MessageId } from '../copy';

export interface DocState {
  empty: boolean;
  bytes: number;
  lines: number;
  tier: Tier;
  lineEnding: LineEnding;
  sourceName: string | null;
}

/** A running operation (busy policy D-005): progress appears after 0.5 s, cancel throughout. */
export interface Busy {
  label:
    | 'progress.loading'
    | 'progress.inserting'
    | 'progress.restoring'
    | 'progress.formatting'
    | 'progress.exporting'
    | 'progress.tree';
  fraction: number;
  /** True once the operation has run for 0.5 s (NFR-02). */
  visible: boolean;
  cancel: () => void;
}

/** A CMP-Notice bar (info or error); at most one at a time, newest wins. */
export interface Bar {
  /** Increases with every bar shown, so the same message shown again is a new bar. */
  seq: number;
  kind: 'info' | 'error';
  /** COPY ID of the message (also exposed as `data-notice-id`). */
  id: Extract<MessageId, `notice.${string}` | `error.${string}`>;
  /** The message text, from `t(id, …)`. */
  text: string;
  /** File errors offer COPY-action.open to try another file (CMP-Notice). */
  offerOpen?: boolean;
}

export interface Confirm {
  bytes: number;
  answer: (proceed: boolean) => void;
}

export function createAppState() {
  return {
    doc: signal<DocState>({ empty: true, bytes: 0, lines: 1, tier: 'normal', lineEnding: 'lf', sourceName: null }),
    cursor: signal({ line: 1, column: 1 }),
    busy: signal<Busy | null>(null),
    bar: signal<Bar | null>(null),
    confirm: signal<Confirm | null>(null),
    /** The worker mirror is being re-seeded (ADR-0005 §4): operations wait, the editor is read-only. */
    seeding: signal(false),
    dragging: signal(false),
  };
}

export type AppState = ReturnType<typeof createAppState>;
