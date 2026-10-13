// MOD-Worker engine (ADR-0005 §2): the compact mirror, one job at a time, cooperative
// cancellation in ~16 ms / ~1 MB slices yielding through a MessageChannel tick, file and Blob
// reading in 1 MB `slice().arrayBuffer()` windows, export Blobs. DOM-free and transport-free
// (`post` is injected) so it runs under Vitest in Node as well as in the module worker.
import { ChangeSet } from '@codemirror/state';
import { LineBreakScanner } from '../core';
import { Mirror, MirrorBuilder } from './mirror';
import type { FailReason, FromWorker, JobSpec, TextFacts, ToWorker } from './protocol';

export const SLICE_MS = 16;
export const SLICE_UNITS = 1 << 20;
/** Blob read window (WebKit cannot stream()/arrayBuffer() in-memory Blobs above ~100–120 MB). */
export const READ_BYTES = 1 << 20;
/** Text forwarded to the main thread per message, at most. */
const FORWARD_UNITS = 1 << 20;

type Post = (msg: FromWorker, transfer?: Transferable[]) => void;

class Cancelled extends Error {}
/** The fatal decoder rejected the bytes (RULE-13); only this is reported as `encoding`. */
class EncodingError extends Error {}

/** Yields to the event loop without the 4 ms timer clamp, so `cancel`/`edit` get through. */
function yieldTick(): Promise<void> {
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => {
      ch.port1.close();
      resolve();
    };
    ch.port2.postMessage(0);
  });
}

/** Time-slice bookkeeping for one job. */
class Slicer {
  private start = performance.now();
  private units = 0;
  constructor(
    private readonly engine: WorkerEngine,
    private readonly jobId: number,
    private readonly onSliceEnd: () => void,
  ) {}

  /** Call after each unit of work; yields at the end of a slice (≤ 16 ms or ≤ 1 MB of input). */
  async step(units: number, fraction: () => number): Promise<void> {
    this.units += units;
    if (performance.now() - this.start < SLICE_MS && this.units < SLICE_UNITS) return;
    this.onSliceEnd();
    this.engine.post({ type: 'progress', jobId: this.jobId, fraction: fraction() });
    await yieldTick();
    this.engine.throwIfCancelled(this.jobId);
    this.start = performance.now();
    this.units = 0;
  }
}

/** Batches decoded text into ≤ 1 M-unit strings posted at the end of each slice. */
class Forwarder {
  private buf: string[] = [];
  private n = 0;
  constructor(
    private readonly engine: WorkerEngine,
    private readonly jobId: number,
  ) {}
  add(s: string): void {
    if (!s) return;
    this.buf.push(s);
    this.n += s.length;
    if (this.n >= FORWARD_UNITS) this.flush();
  }
  flush(): void {
    if (!this.n) return;
    this.engine.post({
      type: 'chunk',
      jobId: this.jobId,
      text: this.buf.length === 1 ? this.buf[0]! : this.buf.join(''),
    });
    this.buf = [];
    this.n = 0;
  }
}

/** Streamed input of an insertText job. */
class TextInbox {
  private queue: string[] = [];
  private ended = false;
  private wake: (() => void) | null = null;
  put(text: string, end: boolean): void {
    if (text) this.queue.push(text);
    if (end) this.ended = true;
    this.wake?.();
  }
  async *[Symbol.asyncIterator](): AsyncGenerator<string> {
    for (;;) {
      const next = this.queue.shift();
      if (next !== undefined) {
        yield next;
        continue;
      }
      if (this.ended) return;
      await new Promise<void>((r) => (this.wake = r));
      this.wake = null;
    }
  }
}

function factsOf(scan: LineBreakScanner, length: number): TextFacts {
  scan.end();
  return {
    length,
    breaks: { ...scan.counts },
    nonBreakBytes: scan.nonBreakBytes,
    endsWithLineBreak: scan.endsWithLineBreak,
  };
}

function reasonOf(e: unknown): FailReason {
  if (e instanceof Cancelled) return 'cancelled';
  // Implements: RULE-13 — only failures of the fatal decoder itself (security review MINOR-2).
  if (e instanceof EncodingError) return 'encoding';
  // Implements: F-001.R9 — allocation failures become "too large" instead of a crash.
  if (e instanceof RangeError) return 'too-large';
  if (e instanceof Error && /memory|allocation/i.test(e.message)) return 'too-large';
  return 'internal';
}

interface QueuedJob {
  jobId: number;
  /** Jobs with the same key supersede each other while queued (e.g. validation of stale versions). */
  key?: string | undefined;
  run: () => Promise<void>;
}

export class WorkerEngine {
  mirror: Mirror = Mirror.empty;
  version = 0;
  /** The result of the last finished load/insert job, until `adopt` or `cancel`. */
  private pending: { jobId: number; mirror: Mirror } | null = null;
  private seedBuilder: MirrorBuilder | null = null;
  private readonly cancelled = new Set<number>();
  private readonly inboxes = new Map<number, TextInbox>();
  private readonly queue: QueuedJob[] = [];
  private running = false;
  private runningJob: number | null = null;
  /** Messages that arrive while a re-seed is in flight, applied after its `end` (review M1). */
  private deferred: ToWorker[] = [];

  constructor(readonly post: Post) {}

  throwIfCancelled(jobId: number): void {
    if (this.cancelled.has(jobId)) throw new Cancelled();
  }

  /** Test helper: resolves when the job queue is empty. */
  async idle(): Promise<void> {
    while (this.running || this.queue.length) await yieldTick();
  }

  handle(msg: ToWorker): void {
    // While re-seeding, the mirror is incomplete: edits, adopts and jobs wait for the seed `end`.
    if (this.seedBuilder && msg.type !== 'seed' && msg.type !== 'cancel' && msg.type !== 'text') {
      this.deferred.push(msg);
      return;
    }
    switch (msg.type) {
      case 'job':
        this.enqueue(msg.jobId, msg.job);
        break;
      case 'text':
        // Only for a queued or running insertText job; text for a finished, failed or
        // cancelled job is dropped at once (review M6).
        this.inboxes.get(msg.jobId)?.put(msg.text, msg.end);
        break;
      case 'cancel': {
        const inbox = this.inboxes.get(msg.jobId);
        this.inboxes.delete(msg.jobId);
        inbox?.put('', true);
        const queued = this.queue.some((j) => j.jobId === msg.jobId);
        // Remembered only while the job still has to see it (review m9: no unbounded set).
        if (queued || this.runningJob === msg.jobId) this.cancelled.add(msg.jobId);
        if (this.pending?.jobId === msg.jobId) {
          this.pending = null;
          this.post({ type: 'failed', jobId: msg.jobId, reason: 'cancelled' });
        }
        break;
      }
      case 'edit':
        try {
          this.mirror = this.mirror.apply(ChangeSet.fromJSON(msg.changes));
          this.version = msg.version;
        } catch (e) {
          // Out of sync (or out of memory): the client restarts and re-seeds (ADR-0005 §4).
          this.post({ type: 'failed', jobId: -1, reason: 'internal', detail: String(e) });
        }
        break;
      case 'adopt': {
        if (this.pending?.jobId !== msg.jobId) {
          // The main thread committed text the mirror does not have: re-seed (review m1).
          this.post({ type: 'failed', jobId: -1, reason: 'internal', detail: 'nothing to adopt' });
          break;
        }
        this.mirror = this.pending.mirror;
        this.pending = null;
        this.version = msg.version;
        this.post({ type: 'adopted', jobId: msg.jobId, version: msg.version });
        break;
      }
      case 'seed':
        if (msg.phase === 'begin') {
          this.seedBuilder = new MirrorBuilder();
          this.pending = null;
        } else if (msg.phase === 'chunk') this.seedBuilder?.push(msg.text ?? '');
        else if (this.seedBuilder) {
          this.mirror = this.seedBuilder.finish();
          this.version = msg.version;
          this.seedBuilder = null;
          const later = this.deferred;
          this.deferred = [];
          for (const m of later) this.handle(m);
        }
        break;
    }
  }

  private enqueue(jobId: number, job: JobSpec): void {
    let run: () => Promise<void>;
    switch (job.kind) {
      case 'loadFile':
        run = () => this.load(jobId, job.file);
        break;
      case 'loadBlob':
        run = () => this.load(jobId, job.blob);
        break;
      case 'insertText': {
        this.inboxes.set(jobId, new TextInbox());
        run = () => this.insertText(jobId, job.version, job.from, job.to);
        break;
      }
      case 'export': {
        // Capture the mirror now: later edits must not change what is exported.
        const doc = this.mirror;
        run = () => this.exportMirror(jobId, doc, job.eol);
        break;
      }
    }
    const key = job.supersedes;
    if (key !== undefined) {
      // Extension point (F-005): newer work of the same kind drops queued stale work.
      for (const stale of this.queue.filter((j) => j.key === key)) {
        this.queue.splice(this.queue.indexOf(stale), 1);
        this.post({ type: 'failed', jobId: stale.jobId, reason: 'cancelled', detail: 'superseded' });
      }
    }
    this.queue.push({ jobId, key, run });
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (let job = this.queue.shift(); job; job = this.queue.shift()) {
        if (this.cancelled.delete(job.jobId)) {
          this.inboxes.delete(job.jobId);
          this.post({ type: 'failed', jobId: job.jobId, reason: 'cancelled' });
          continue;
        }
        this.runningJob = job.jobId;
        try {
          await job.run();
        } finally {
          this.cancelled.delete(job.jobId);
          this.runningJob = null;
        }
      }
    } finally {
      this.running = false;
    }
  }

  private fail(jobId: number, e: unknown): void {
    this.inboxes.delete(jobId);
    this.post({ type: 'failed', jobId, reason: reasonOf(e), detail: e instanceof Error ? e.message : String(e) });
  }

  /** Implements: F-001.R2, F-001.R3, F-001.R5, F-001.R8, F-001.R9; RULE-13 (fatal UTF-8, BOM kept). */
  private async load(jobId: number, source: Blob): Promise<void> {
    try {
      this.pending = null;
      // ignoreBOM keeps a leading byte-order mark as the first character (RULE-03, RULE-13).
      const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
      const scan = new LineBreakScanner();
      const builder = new MirrorBuilder();
      const fwd = new Forwarder(this, jobId);
      const total = source.size;
      let offset = 0;
      const slicer = new Slicer(this, jobId, () => fwd.flush());
      const decode = (bytes?: Uint8Array): string => {
        try {
          return bytes ? decoder.decode(bytes, { stream: true }) : decoder.decode();
        } catch (e) {
          throw e instanceof TypeError ? new EncodingError(e.message) : e;
        }
      };
      const take = (text: string) => {
        if (!text) return;
        scan.feed(text);
        builder.push(text);
        fwd.add(text);
      };
      while (offset < total) {
        const end = Math.min(total, offset + READ_BYTES);
        const bytes = new Uint8Array(await source.slice(offset, end).arrayBuffer());
        this.throwIfCancelled(jobId);
        take(decode(bytes));
        offset = end;
        await slicer.step(bytes.length, () => offset / total);
      }
      take(decode());
      fwd.flush();
      const mirror = builder.finish();
      this.pending = { jobId, mirror };
      this.post({ type: 'loaded', jobId, facts: factsOf(scan, mirror.length) });
    } catch (e) {
      this.fail(jobId, e);
    }
  }

  /** Implements: F-001.R4 (large paste path, ADR-0006 §2). */
  private async insertText(jobId: number, version: number, from: number, to: number): Promise<void> {
    const inbox = this.inboxes.get(jobId)!;
    try {
      this.pending = null;
      if (version !== this.version || to > this.mirror.length)
        throw new Error(`stale insert (v${version} ≠ v${this.version})`);
      const base = this.mirror;
      const scan = new LineBreakScanner();
      const builder = new MirrorBuilder();
      builder.pushMirror(base, 0, from);
      const slicer = new Slicer(this, jobId, () => undefined);
      for await (const text of inbox) {
        this.throwIfCancelled(jobId);
        scan.feed(text);
        builder.push(text);
        await slicer.step(text.length, () => 0);
      }
      this.throwIfCancelled(jobId);
      builder.pushMirror(base, to, base.length);
      const mirror = builder.finish();
      this.inboxes.delete(jobId);
      this.pending = { jobId, mirror };
      // Facts of the inserted text; `length` is the new document's length (a sanity check).
      this.post({ type: 'loaded', jobId, facts: factsOf(scan, mirror.length) });
    } catch (e) {
      this.fail(jobId, e);
    }
  }

  private async exportMirror(jobId: number, doc: Mirror, eol: '\n' | '\r\n'): Promise<void> {
    try {
      const enc = new TextEncoder();
      const parts: Uint8Array<ArrayBuffer>[] = [];
      let done = 0;
      const slicer = new Slicer(this, jobId, () => undefined);
      for (const chunk of doc.iter(eol)) {
        parts.push(enc.encode(chunk));
        done += chunk.length;
        await slicer.step(chunk.length, () => (doc.length ? done / doc.length : 1));
      }
      const blob = new Blob(parts, { type: 'application/json' });
      this.post({ type: 'blob', jobId, blob });
    } catch (e) {
      this.fail(jobId, e);
    }
  }
}
