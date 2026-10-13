// MOD-Worker engine in Node: file reading (RULE-13), failures (F-001.R9), cancellation (INV-03),
// adopt, export and large-paste jobs — the same code the module worker runs.
import { ChangeSet } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { WorkerEngine } from '../../src/worker/engine';
import type { FromWorker, JobSpec } from '../../src/worker/protocol';

function harness() {
  const out: FromWorker[] = [];
  const engine = new WorkerEngine((m) => out.push(m));
  let id = 0;
  const start = (job: JobSpec) => {
    const jobId = ++id;
    engine.handle({ type: 'job', jobId, job });
    return jobId;
  };
  const of = (jobId: number) => out.filter((m) => 'jobId' in m && m.jobId === jobId);
  const end = (jobId: number) => of(jobId).find((m) => m.type === 'loaded' || m.type === 'failed' || m.type === 'blob');
  const text = (jobId: number) =>
    of(jobId)
      .map((m) => (m.type === 'chunk' ? m.text : ''))
      .join('');
  return { engine, out, start, of, end, text };
}

const blob = (...parts: (string | Uint8Array)[]) => new Blob(parts as BlobPart[]);

describe('MOD-Worker load', () => {
  it('F-001.AC2 F-001.AC3 a UTF-8 file is decoded, forwarded and becomes the mirror on adopt', async () => {
    const h = harness();
    const id = h.start({ kind: 'loadFile', file: blob('{"a":1}') });
    await h.engine.idle();
    expect(h.end(id)).toMatchObject({
      type: 'loaded',
      facts: { length: 7, nonBreakBytes: 7, breaks: { lf: 0, crlf: 0, cr: 0 } },
    });
    expect(h.text(id)).toBe('{"a":1}');
    expect(h.engine.mirror.toString()).toBe(''); // not before adopt (INV-03)
    h.engine.handle({ type: 'adopt', jobId: id, version: 1 });
    expect(h.engine.mirror.toString()).toBe('{"a":1}');
    expect(h.engine.version).toBe(1);
  });

  it('RULE-13 a leading byte-order mark is kept as the first character', async () => {
    const h = harness();
    const id = h.start({ kind: 'loadFile', file: blob(new Uint8Array([0xef, 0xbb, 0xbf]), '[1]') });
    await h.engine.idle();
    expect(h.text(id)).toBe('﻿[1]');
    expect(h.end(id)).toMatchObject({ type: 'loaded', facts: { nonBreakBytes: 6 } });
  });

  it('F-001.AC6 RULE-13 invalid UTF-8 fails with "encoding" and the mirror is unchanged', async () => {
    const h = harness();
    const ok = h.start({ kind: 'loadFile', file: blob('[1]') });
    await h.engine.idle();
    h.engine.handle({ type: 'adopt', jobId: ok, version: 1 });
    const bad = h.start({ kind: 'loadFile', file: blob('{"a":"', new Uint8Array([0xff, 0xfe]), '"}') });
    await h.engine.idle();
    expect(h.end(bad)).toMatchObject({ type: 'failed', reason: 'encoding' });
    expect(h.engine.mirror.toString()).toBe('[1]');
  });

  it('F-001.AC6 RULE-13 a multi-byte character split across 1 MB read windows is not an error', async () => {
    const h = harness();
    const text = 'a'.repeat((1 << 20) - 1) + 'é' + 'b';
    const id = h.start({ kind: 'loadFile', file: blob(text) });
    await h.engine.idle();
    expect(h.end(id)?.type).toBe('loaded');
    expect(h.text(id)).toBe(text);
  });

  it('F-001.AC10 F-001.R9 an allocation failure while reading fails with "too-large"', async () => {
    const h = harness();
    const huge = {
      size: 3 << 20,
      slice: () => ({
        arrayBuffer: () => Promise.reject(new RangeError('Array buffer allocation failed')),
      }),
    } as unknown as Blob;
    const id = h.start({ kind: 'loadFile', file: huge });
    await h.engine.idle();
    expect(h.end(id)).toMatchObject({ type: 'failed', reason: 'too-large' });
    expect(h.engine.mirror.length).toBe(0);
  });

  it('F-001.AC9 INV-03 cancelling a load stops within a slice and keeps the mirror', async () => {
    const h = harness();
    const first = h.start({ kind: 'loadFile', file: blob('{"keep":true}') });
    await h.engine.idle();
    h.engine.handle({ type: 'adopt', jobId: first, version: 1 });
    const big = blob('x'.repeat(12 << 20));
    const id = h.start({ kind: 'loadFile', file: big });
    // let a couple of slices run, then cancel
    while (h.of(id).filter((m) => m.type === 'progress').length < 2) await new Promise((r) => setTimeout(r, 1));
    h.engine.handle({ type: 'cancel', jobId: id });
    await h.engine.idle();
    expect(h.end(id)).toMatchObject({ type: 'failed', reason: 'cancelled' });
    expect(h.of(id).filter((m) => m.type === 'chunk').length).toBeLessThan(12);
    expect(h.engine.mirror.toString()).toBe('{"keep":true}');
    // adopting a cancelled job is refused
    h.engine.handle({ type: 'adopt', jobId: id, version: 2 });
    expect(h.engine.mirror.toString()).toBe('{"keep":true}');
  });

  it('F-001.R8 a load reports progress and posts chunks of at most ~1 M units', async () => {
    const h = harness();
    const id = h.start({ kind: 'loadFile', file: blob('y'.repeat(5 << 20)) });
    await h.engine.idle();
    const chunks = h.of(id).filter((m) => m.type === 'chunk');
    expect(Math.max(...chunks.map((c) => (c.type === 'chunk' ? c.text.length : 0)))).toBeLessThanOrEqual(2 << 20);
    const progress = h.of(id).filter((m) => m.type === 'progress');
    expect(progress.length).toBeGreaterThan(0);
  });

  it('RULE-17 load reports the line breaks so the dominant line ending can be recorded', async () => {
    const h = harness();
    const id = h.start({ kind: 'loadFile', file: blob('{\r\n"a":1,\n"b":2\r\n}\r\n') });
    await h.engine.idle();
    expect(h.end(id)).toMatchObject({ facts: { breaks: { lf: 1, crlf: 3, cr: 0 }, endsWithLineBreak: true } });
    h.engine.handle({ type: 'adopt', jobId: id, version: 1 });
    expect(h.engine.mirror.toString()).toBe('{\n"a":1,\n"b":2\n}\n');
  });
});

describe('MOD-Worker edits, export and large paste', () => {
  it('F-001.R1 edits apply to the mirror; an export captures the mirror when requested', async () => {
    const h = harness();
    const id = h.start({ kind: 'loadFile', file: blob('[1,2]') });
    await h.engine.idle();
    h.engine.handle({ type: 'adopt', jobId: id, version: 1 });
    const exp = h.start({ kind: 'export', version: 1, eol: '\n' });
    h.engine.handle({ type: 'edit', version: 2, changes: ChangeSet.of({ from: 1, to: 2, insert: '9' }, 5).toJSON() });
    await h.engine.idle();
    const m = h.end(exp);
    expect(m?.type).toBe('blob');
    if (m?.type === 'blob') expect(await m.blob.text()).toBe('[1,2]');
    expect(h.engine.mirror.toString()).toBe('[9,2]');
  });

  it('F-001.AC11 a large paste replaces the selection in the mirror only when adopted', async () => {
    const h = harness();
    const id = h.start({ kind: 'loadFile', file: blob('[1,2,3]') });
    await h.engine.idle();
    h.engine.handle({ type: 'adopt', jobId: id, version: 1 });
    const paste = h.start({ kind: 'insertText', version: 1, from: 1, to: 6 });
    h.engine.handle({ type: 'text', jobId: paste, text: '"x",\r\n', end: false });
    h.engine.handle({ type: 'text', jobId: paste, text: '"y"', end: true });
    await h.engine.idle();
    expect(h.end(paste)).toMatchObject({ type: 'loaded', facts: { breaks: { crlf: 1 } } });
    expect(h.engine.mirror.toString()).toBe('[1,2,3]');
    h.engine.handle({ type: 'adopt', jobId: paste, version: 2 });
    expect(h.engine.mirror.toString()).toBe('["x",\n"y"]');
  });

  it('INV-03 a cancelled large paste leaves the mirror unchanged', async () => {
    const h = harness();
    const paste = h.start({ kind: 'insertText', version: 0, from: 0, to: 0 });
    h.engine.handle({ type: 'text', jobId: paste, text: 'abc', end: false });
    h.engine.handle({ type: 'cancel', jobId: paste });
    await h.engine.idle();
    expect(h.end(paste)).toMatchObject({ type: 'failed', reason: 'cancelled' });
    expect(h.engine.mirror.length).toBe(0);
  });

  it('ADR-0005 a change set that does not fit the mirror asks for a re-seed', () => {
    const h = harness();
    h.engine.handle({ type: 'edit', version: 1, changes: ChangeSet.of({ from: 0, to: 3 }, 3).toJSON() });
    expect(h.out.at(-1)).toMatchObject({ type: 'failed', jobId: -1, reason: 'internal' });
    h.engine.handle({ type: 'seed', phase: 'begin', version: 5 });
    h.engine.handle({ type: 'seed', phase: 'chunk', version: 5, text: 'abc' });
    h.engine.handle({ type: 'seed', phase: 'end', version: 5 });
    expect(h.engine.mirror.toString()).toBe('abc');
    expect(h.engine.version).toBe(5);
  });

  it('F-001.R4 review M6 text for a failed or unknown paste job is not kept in the worker', async () => {
    const h = harness();
    // stale version: the job fails at once
    const paste = h.start({ kind: 'insertText', version: 5, from: 0, to: 0 });
    await h.engine.idle();
    expect(h.end(paste)).toMatchObject({ type: 'failed', reason: 'internal' });
    h.engine.handle({ type: 'text', jobId: paste, text: 'x'.repeat(1000), end: false });
    h.engine.handle({ type: 'text', jobId: 999, text: 'y', end: true });
    expect((h.engine as unknown as { inboxes: Map<number, unknown> }).inboxes.size).toBe(0);
  });

  it('INV-03 review M6 a paste cancelled while queued releases its text', async () => {
    const h = harness();
    const exp = h.start({ kind: 'export', version: 0, eol: '\n' });
    const paste = h.start({ kind: 'insertText', version: 0, from: 0, to: 0 });
    h.engine.handle({ type: 'text', jobId: paste, text: 'abc', end: false });
    h.engine.handle({ type: 'cancel', jobId: paste });
    await h.engine.idle();
    expect(h.end(exp)?.type).toBe('blob');
    expect(h.end(paste)).toMatchObject({ type: 'failed', reason: 'cancelled' });
    const internals = h.engine as unknown as { inboxes: Map<number, unknown>; cancelled: Set<number> };
    expect(internals.inboxes.size).toBe(0);
    expect(internals.cancelled.size).toBe(0);
  });

  it('ADR-0005 review M1 edits and jobs that arrive during a re-seed wait for its end', async () => {
    const h = harness();
    h.engine.handle({ type: 'seed', phase: 'begin', version: 3 });
    h.engine.handle({ type: 'seed', phase: 'chunk', version: 3, text: '[1]' });
    h.engine.handle({ type: 'edit', version: 4, changes: ChangeSet.of({ from: 1, to: 2, insert: '2' }, 3).toJSON() });
    const exp = h.start({ kind: 'export', version: 4, eol: '\n' });
    expect(h.out.filter((m) => m.type === 'failed')).toEqual([]);
    h.engine.handle({ type: 'seed', phase: 'end', version: 3 });
    await h.engine.idle();
    expect(h.engine.mirror.toString()).toBe('[2]');
    expect(h.engine.version).toBe(4);
    const m = h.end(exp);
    if (m?.type === 'blob') expect(await m.blob.text()).toBe('[2]');
    else expect.fail('no export');
  });

  it('ADR-0005 review m1 adopting a job the worker does not have asks for a re-seed', () => {
    const h = harness();
    h.engine.handle({ type: 'adopt', jobId: 42, version: 9 });
    expect(h.out.at(-1)).toMatchObject({ type: 'failed', jobId: -1, reason: 'internal' });
  });

  it('F-001.R1 queued work with the same supersede key is replaced by newer work', async () => {
    const h = harness();
    const running = h.start({ kind: 'export', version: 0, eol: '\n' });
    const stale = h.start({ kind: 'export', version: 0, eol: '\n', supersedes: 'validate' });
    const fresh = h.start({ kind: 'export', version: 0, eol: '\n', supersedes: 'validate' });
    await h.engine.idle();
    expect(h.end(running)?.type).toBe('blob');
    expect(h.end(stale)).toMatchObject({ type: 'failed', reason: 'cancelled', detail: 'superseded' });
    expect(h.end(fresh)?.type).toBe('blob');
  });

  it('INV-03 review round 3 a superseded paste job releases its text', async () => {
    const h = harness();
    const running = h.start({ kind: 'export', version: 0, eol: '\n' });
    const stale = h.start({ kind: 'insertText', version: 0, from: 0, to: 0, supersedes: 'paste' });
    h.engine.handle({ type: 'text', jobId: stale, text: 'abc', end: false });
    const fresh = h.start({ kind: 'export', version: 0, eol: '\n', supersedes: 'paste' });
    await h.engine.idle();
    expect(h.end(running)?.type).toBe('blob');
    expect(h.end(stale)).toMatchObject({ type: 'failed', reason: 'cancelled' });
    expect(h.end(fresh)?.type).toBe('blob');
    expect((h.engine as unknown as { inboxes: Map<number, unknown> }).inboxes.size).toBe(0);
  });

  it('F-001 edge case a file the browser cannot read fails with "unreadable"', async () => {
    const h = harness();
    const gone = {
      size: 10,
      slice: () => ({ arrayBuffer: () => Promise.reject(new DOMException('moved', 'NotReadableError')) }),
    } as unknown as Blob;
    const id = h.start({ kind: 'loadFile', file: gone });
    await h.engine.idle();
    expect(h.end(id)).toMatchObject({ type: 'failed', reason: 'unreadable' });
  });
});
