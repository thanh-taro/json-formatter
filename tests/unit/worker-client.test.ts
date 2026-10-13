// Main-side WorkerClient: cancellation and the watchdog (ADR-0005 §4) with a fake worker.
import { describe, expect, it } from 'vitest';
import { JobFailure, WorkerClient } from '../../src/worker/client';
import type { FromWorker, ToWorker } from '../../src/worker/protocol';

class FakeWorker {
  sent: ToWorker[] = [];
  terminated = false;
  private listeners: ((e: MessageEvent<FromWorker>) => void)[] = [];
  postMessage(m: ToWorker) {
    this.sent.push(m);
  }
  addEventListener(type: string, l: (e: MessageEvent<FromWorker>) => void) {
    if (type === 'message') this.listeners.push(l);
  }
  emit(m: FromWorker) {
    for (const l of this.listeners) l({ data: m } as MessageEvent<FromWorker>);
  }
  terminate() {
    this.terminated = true;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('WorkerClient', () => {
  it('F-001.AC9 F-001.R8 cancel settles the job at once and tells the worker', async () => {
    const workers: FakeWorker[] = [];
    const client = new WorkerClient({ createWorker: () => (workers.push(new FakeWorker()), workers.at(-1)!) });
    const job = client.run({ kind: 'loadFile', file: new Blob(['x']) });
    job.cancel();
    await expect(job.result).rejects.toMatchObject({ reason: 'cancelled' });
    expect(workers[0]!.sent.map((m) => m.type)).toEqual(['job', 'cancel']);
    client.dispose();
  });

  it('F-001.R9 ADR-0005 a silent worker is restarted after the watchdog and the job fails "internal"', async () => {
    const workers: FakeWorker[] = [];
    let restarted = 0;
    const client = new WorkerClient({
      createWorker: () => (workers.push(new FakeWorker()), workers.at(-1)!),
      onRestart: () => restarted++,
      watchdogMs: 60,
      tickMs: 10,
    });
    const job = client.run({ kind: 'loadFile', file: new Blob(['x']) });
    const failure = await job.result.catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(JobFailure);
    expect((failure as JobFailure).reason).toBe('internal');
    expect(workers[0]!.terminated).toBe(true);
    expect(workers).toHaveLength(2);
    expect(restarted).toBe(1);
    client.dispose();
  });

  it('F-001.R8 a worker that keeps reporting progress is not restarted', async () => {
    const workers: FakeWorker[] = [];
    const client = new WorkerClient({
      createWorker: () => (workers.push(new FakeWorker()), workers.at(-1)!),
      watchdogMs: 60,
      tickMs: 10,
    });
    const chunks: string[] = [];
    const job = client.run({ kind: 'loadFile', file: new Blob(['x']) }, { onChunk: (t) => chunks.push(t) });
    for (let i = 0; i < 10; i++) {
      await sleep(20);
      workers[0]!.emit({ type: 'progress', jobId: job.jobId, fraction: i / 10 });
      workers[0]!.emit({ type: 'chunk', jobId: job.jobId, text: String(i) });
    }
    workers[0]!.emit({
      type: 'loaded',
      jobId: job.jobId,
      facts: { length: 10, nonBreakBytes: 10, endsWithLineBreak: false, breaks: { lf: 0, crlf: 0, cr: 0 } },
    });
    await expect(job.result).resolves.toMatchObject({ type: 'loaded' });
    expect(chunks.join('')).toBe('0123456789');
    expect(workers).toHaveLength(1);
    client.dispose();
  });
});
