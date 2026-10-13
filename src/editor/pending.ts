// MOD-Editor pending document (ADR-0006 §1, INV-03): text arrives in chunks, is appended to a
// `TextBuilder` in ≤ 8 ms main-thread slices, and is shown only when complete. Pure (no DOM) so
// the cancel and failure paths are unit-tested.
import type { Text } from '@codemirror/state';
import { TextBuilder } from './builder';

/** Main-thread append slice (architecture.md tunables). */
export const APPEND_SLICE_MS = 8;

/** Thrown by `commit()` after `discard()`. */
export class DiscardedError extends Error {
  constructor() {
    super('pending document was discarded');
  }
}

export interface Pending<F> {
  append(text: string): void;
  /** UTF-16 units appended so far. */
  readonly appended: number;
  /** Waits for the builder, then hands the complete text to the owner's commit. */
  commit(facts: F): Promise<number>;
  /** Drops the pending text at once; a waiting `commit()` rejects with `DiscardedError`. */
  discard(): void;
}

const tick = (): Promise<void> =>
  new Promise((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => {
      ch.port1.close();
      resolve();
    };
    ch.port2.postMessage(0);
  });

/**
 * `onCommit(text, facts)` applies the complete text and returns the new document version.
 * The first builder error (e.g. a `RangeError` when memory runs out) is latched and rethrown by
 * `append` and `commit`, so a document with a piece missing is never committed (F-001.R9).
 */
export function createPending<F>(
  onCommit: (text: Text, facts: F) => number,
  yieldMain: () => Promise<void> = tick,
): Pending<F> {
  const builder = new TextBuilder();
  let appended = 0;
  let discarded = false;
  let failure: unknown = null;
  let pumping: Promise<void> | null = null;

  const pump = async () => {
    try {
      while (!discarded && !builder.step(APPEND_SLICE_MS)) await yieldMain();
    } catch (e) {
      failure ??= e;
    }
  };
  const kick = () => {
    if (!pumping && !discarded && failure === null) pumping = pump().finally(() => (pumping = null));
  };

  return {
    get appended() {
      return appended;
    },
    append(text) {
      if (failure !== null) throw failure;
      if (discarded) return;
      appended += text.length;
      builder.push(text);
      kick();
    },
    async commit(facts) {
      for (;;) {
        // Implements: F-001.R8 / INV-03 — a cancel while waiting ends the wait (no endless loop).
        if (discarded) throw new DiscardedError();
        if (failure !== null) throw failure;
        if (!pumping && builder.idle) break;
        kick();
        await pumping;
      }
      return onCommit(builder.finish(), facts);
    },
    discard() {
      discarded = true;
      builder.clear();
    },
  };
}
