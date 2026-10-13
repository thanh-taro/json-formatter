// Main-side WorkerClient (MOD-Worker public surface, ADR-0005 §3–4): wraps the protocol in
// promise-returning jobs with cancellation and a watchdog. The worker can die silently (WebKit
// under memory pressure), so while a job runs — or a cancel is unacknowledged — some message
// must arrive at least every second; otherwise (or on an `error` event) the worker is
// terminated and restarted, every running job fails with `internal`, and the owner re-seeds
// the mirror (callers discard their pending documents, INV-03).
import type { LineEnding, ValidationResult } from '../core';
import type { ChangeSetJSON, FailReason, FromWorker, JobSpec, TextFacts, ToWorker } from './protocol';

export class JobFailure extends Error {
  constructor(
    readonly reason: FailReason,
    detail?: string,
  ) {
    super(detail ? `${reason}: ${detail}` : reason);
  }
}

export interface JobHooks {
  onChunk?: (text: string) => void;
  onProgress?: (fraction: number) => void;
}

/** Result of a job: facts for load/insert jobs, a Blob for export jobs, a validation result. */
export type JobResult =
  | { type: 'loaded'; facts: TextFacts }
  | { type: 'blob'; blob: Blob }
  | { type: 'validation'; version: number; result: ValidationResult };

export interface Job {
  readonly jobId: number;
  readonly result: Promise<JobResult>;
  cancel(): void;
}

interface WorkerLike {
  postMessage(message: ToWorker, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<FromWorker>) => void): void;
  addEventListener(type: 'error' | 'messageerror', listener: (event: Event) => void): void;
  terminate(): void;
}

export interface WorkerClientOptions {
  createWorker?: () => WorkerLike;
  /** Called after a restart; the owner re-seeds the mirror with `seed`. */
  onRestart?: () => void;
  watchdogMs?: number;
  tickMs?: number;
}

interface Running {
  hooks: JobHooks;
  settled: boolean;
  resolve: (r: JobResult) => void;
  reject: (e: JobFailure) => void;
}

function defaultWorker(): WorkerLike {
  return new Worker(new URL('./index.ts', import.meta.url), { type: 'module', name: 'json-formatter' });
}

export class WorkerClient {
  private worker: WorkerLike;
  private nextId = 1;
  private readonly running = new Map<number, Running>();
  private lastMessageAt = performance.now();
  private lastTickAt = performance.now();
  private readonly timer: ReturnType<typeof setInterval>;
  private readonly watchdogMs: number;
  private readonly createWorker: () => WorkerLike;
  /** Number of restarts so far (diagnostics and tests). */
  restarts = 0;

  constructor(private readonly options: WorkerClientOptions = {}) {
    this.createWorker = options.createWorker ?? defaultWorker;
    this.watchdogMs = options.watchdogMs ?? 1000;
    this.worker = this.start();
    const tickMs = options.tickMs ?? 250;
    this.timer = setInterval(() => this.check(tickMs), tickMs);
  }

  dispose(): void {
    clearInterval(this.timer);
    this.worker.terminate();
  }

  private start(): WorkerLike {
    const w = this.createWorker();
    w.addEventListener('message', (e: MessageEvent<FromWorker>) => {
      if (w === this.worker) this.receive(e.data);
    });
    w.addEventListener('error', () => {
      if (w === this.worker) this.restart('worker error');
    });
    w.addEventListener('messageerror', () => {
      if (w === this.worker) this.restart('message could not be read');
    });
    return w;
  }

  // Implements: ADR-0005 §4 watchdog — a message at least every second while work is outstanding.
  private check(tickMs: number): void {
    const now = performance.now();
    const late = now - this.lastTickAt > tickMs * 2; // the main thread itself was blocked
    this.lastTickAt = now;
    if (late || this.running.size === 0) {
      if (this.running.size === 0) this.lastMessageAt = now;
      return;
    }
    if (now - this.lastMessageAt > this.watchdogMs) this.restart('no progress');
  }

  private restart(why: string): void {
    this.restarts++;
    this.worker.terminate();
    const failed = [...this.running.values()];
    this.running.clear();
    this.worker = this.start();
    this.lastMessageAt = performance.now();
    for (const r of failed) this.settle(r, new JobFailure('internal', why));
    this.options.onRestart?.();
  }

  private settle(r: Running, outcome: JobResult | JobFailure): void {
    if (r.settled) return;
    r.settled = true;
    if (outcome instanceof JobFailure) r.reject(outcome);
    else r.resolve(outcome);
  }

  private receive(msg: FromWorker): void {
    this.lastMessageAt = performance.now();
    switch (msg.type) {
      case 'ready':
      case 'adopted':
        return;
      case 'progress': {
        const r = this.running.get(msg.jobId);
        if (r && !r.settled) r.hooks.onProgress?.(msg.fraction);
        return;
      }
      case 'chunk': {
        const r = this.running.get(msg.jobId);
        if (r && !r.settled) r.hooks.onChunk?.(msg.text);
        return;
      }
      case 'loaded':
      case 'blob':
      case 'validation': {
        const r = this.running.get(msg.jobId);
        this.running.delete(msg.jobId);
        if (r)
          this.settle(
            r,
            msg.type === 'loaded'
              ? { type: 'loaded', facts: msg.facts }
              : msg.type === 'blob'
                ? { type: 'blob', blob: msg.blob }
                : { type: 'validation', version: msg.version, result: msg.result },
          );
        return;
      }
      case 'failed': {
        if (msg.jobId === -1) {
          this.restart(msg.detail ?? 'mirror out of sync');
          return;
        }
        const r = this.running.get(msg.jobId);
        this.running.delete(msg.jobId);
        if (r) this.settle(r, new JobFailure(msg.reason, msg.detail));
        return;
      }
    }
  }

  private send(msg: ToWorker, transfer?: Transferable[]): void {
    this.worker.postMessage(msg, transfer ?? []);
  }

  /** Starts a job. Load jobs stream `onChunk`; every job reports `onProgress`. */
  run(job: JobSpec, hooks: JobHooks = {}): Job {
    const jobId = this.nextId++;
    let entry!: Running;
    const result = new Promise<JobResult>((resolve, reject) => {
      entry = { hooks, settled: false, resolve, reject };
    });
    if (this.running.size === 0) this.lastMessageAt = performance.now();
    this.running.set(jobId, entry);
    this.send({ type: 'job', jobId, job });
    return {
      jobId,
      result,
      // Implements: F-001.R8 — cancel settles at once (UI idle), the worker stops within one slice.
      cancel: () => {
        // Also sent after a result arrived: the worker then drops the job's pending mirror.
        this.send({ type: 'cancel', jobId });
        this.settle(entry, new JobFailure('cancelled'));
        // stays in `running` until the worker acknowledges, so the watchdog covers a lost cancel
      },
    };
  }

  /** Streams input text of an `insertText` job. */
  sendText(jobId: number, text: string, end: boolean): void {
    this.send({ type: 'text', jobId, text, end });
  }

  edit(version: number, changes: ChangeSetJSON): void {
    this.send({ type: 'edit', version, changes });
  }

  /** The pending result of `jobId` becomes the mirror at `version`. */
  adopt(jobId: number, version: number): void {
    this.send({ type: 'adopt', jobId, version });
  }

  /** UTF-8 Blob of the mirror as it is now (captured when the worker receives the request), its
   * line breaks written as `eol` — always explicit (undo snapshots use '\n', export uses the
   * document's line ending, ADR-0006 §3). */
  exportBlob(version: number, eol: '\n' | '\r\n'): Promise<Blob> {
    return this.run({ kind: 'export', version, eol }).result.then((r) =>
      r.type === 'blob' ? r.blob : Promise.reject(new JobFailure('internal')),
    );
  }

  /**
   * Implements: F-005.R1 — validates the document at `version`. A newer request supersedes a
   * queued one, and the worker drops a running one when the document changes (both settle as
   * `cancelled`); the caller still ignores results for versions it no longer shows (INV-05).
   */
  validate(version: number, lineEnding: LineEnding): Promise<{ version: number; result: ValidationResult }> {
    return this.run({ kind: 'validate', version, lineEnding, supersedes: 'validate' }).result.then((r) =>
      r.type === 'validation' ? r : Promise.reject(new JobFailure('internal', `unexpected ${r.type}`)),
    );
  }

  seed(phase: 'begin' | 'chunk' | 'end', version: number, text?: string): void {
    this.send(text === undefined ? { type: 'seed', phase, version } : { type: 'seed', phase, version, text });
  }
}
