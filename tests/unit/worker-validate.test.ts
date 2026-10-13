// MOD-Worker validation jobs in Node (F-005.R1, F-005.R7, INV-05; ADR-0005 §2, ADR-0007 §1):
// the job validates the mirror version it was asked for, in slices, drops stale work when the
// document changes, reuses the validation done while loading, and keeps the skip table.
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
  const end = (jobId: number) =>
    of(jobId).find((m) => m.type === 'validation' || m.type === 'failed' || m.type === 'loaded');
  /** Replaces the whole mirror with `text` as an edit at `version`. */
  const setText = (text: string, version: number) => {
    const len = engine.mirror.length;
    engine.handle({ type: 'edit', version, changes: ChangeSet.of({ from: 0, to: len, insert: text }, len).toJSON() });
  };
  const validate = (version: number, supersedes = true) =>
    start({ kind: 'validate', version, lineEnding: 'lf', ...(supersedes ? { supersedes: 'validate' } : {}) });
  return { engine, out, start, of, end, setText, validate };
}

describe('MOD-Worker validate', () => {
  it('F-005.R1 F-005.AC2 validates the current mirror and reports the error with its position', async () => {
    const h = harness();
    h.setText('{"a": 1,\n "b": 2,\n}', 1);
    const id = h.validate(1);
    await h.engine.idle();
    const msg = h.end(id);
    expect(msg).toMatchObject({ type: 'validation', version: 1, result: { validity: 'invalid' } });
    if (msg?.type !== 'validation') throw new Error('no result');
    expect(msg.result.issues).toEqual([
      { severity: 'error', code: 'trailing-comma', line: 2, column: 8, offset: 16, pos: 16, length: 1 },
    ]);
  });

  it('F-005.R4 F-005.AC5 a valid document reports its warnings with locations', async () => {
    const h = harness();
    h.setText('{"a":1,"a":2,"id":9007199254740993}', 1);
    const id = h.validate(1);
    await h.engine.idle();
    const msg = h.end(id);
    if (msg?.type !== 'validation') throw new Error('no result');
    expect(msg.result.validity).toBe('valid');
    expect(msg.result.issues.map((i) => [i.code, i.line, i.column])).toEqual([
      ['duplicate-key', 1, 8],
      ['unsafe-number', 1, 19],
    ]);
  });

  it('ENT-Issue a CRLF document reports code-point offsets with two per break', async () => {
    const h = harness();
    h.setText('[\n1,]', 1);
    const id = h.start({ kind: 'validate', version: 1, lineEnding: 'crlf' });
    await h.engine.idle();
    const msg = h.end(id);
    if (msg?.type !== 'validation') throw new Error('no result');
    expect(msg.result.issues[0]).toMatchObject({ line: 2, column: 2, offset: 4, pos: 3 });
  });

  it('INV-05 F-005.R7 a request for an older version than the mirror is dropped', async () => {
    const h = harness();
    h.setText('[1]', 1);
    h.setText('[1,', 2);
    const id = h.validate(1);
    await h.engine.idle();
    expect(h.end(id)).toMatchObject({ type: 'failed', reason: 'cancelled' });
  });

  it('INV-05 F-005.R7 a newer validation request supersedes a waiting or queued one', async () => {
    const h = harness();
    const big = '[' + '1,'.repeat(600_000) + '1]'; // > 1 M units: waits out the debounce
    h.setText(big, 1);
    const first = h.validate(1);
    const second = h.validate(1);
    h.setText('[2]', 2);
    const third = h.validate(2);
    await h.engine.idle();
    expect(h.end(first)).toMatchObject({ type: 'failed', reason: 'cancelled', detail: 'superseded' });
    expect(h.end(second)).toMatchObject({ type: 'failed', reason: 'cancelled', detail: 'superseded' });
    expect(h.end(third)).toMatchObject({ type: 'validation', version: 2, result: { validity: 'valid' } });
  });

  it('ADR-0005 review F-005 m4 the validation debounce does not hold the job slot', async () => {
    const h = harness();
    h.setText('[' + '1,'.repeat(600_000) + '1]', 1);
    const validation = h.validate(1);
    const exported = h.start({ kind: 'export', version: 1, eol: '\n' });
    await h.engine.idle();
    const order = h.out.filter((m) => m.type === 'blob' || m.type === 'validation').map((m) => m.type);
    expect(order).toEqual(['blob', 'validation']);
    expect(h.end(validation)?.type).toBe('validation');
    expect(h.of(exported).some((m) => m.type === 'blob')).toBe(true);
  });

  it('NFR-04 review F-005 M2 a replaced document is not retained through validation results', async () => {
    const v8 = await import('node:v8');
    const vm = await import('node:vm');
    v8.setFlagsFromString('--expose_gc');
    const gc = vm.runInNewContext('gc') as () => void;
    const h = harness();
    // A large-tier valid document: validated while loading, skip table built.
    const row = '{"id":12345,"name":"abcdefghijklmnopqrstuvwxyz"},';
    const text = '[' + row.repeat(Math.ceil(10_500_000 / row.length)) + '{}]';
    const load = h.start({ kind: 'loadFile', file: new Blob([text]) });
    await h.engine.idle();
    h.engine.handle({ type: 'adopt', jobId: load, version: 1 });
    expect(h.engine.skipTable).not.toBeNull();
    const old = new WeakRef(h.engine.mirror);
    // Replace it with a small invalid document and validate that.
    const next = h.start({ kind: 'loadFile', file: new Blob(['[1,']) });
    await h.engine.idle();
    h.engine.handle({ type: 'adopt', jobId: next, version: 2 });
    h.validate(2);
    await h.engine.idle();
    expect(h.engine.skipTable).toBeNull();
    h.out.length = 0; // the test's own message log holds forwarded text chunks
    // (deref() keeps its target alive until the current job ends, so collect in a fresh task)
    await new Promise((r) => setTimeout(r, 0));
    gc();
    await new Promise((r) => setTimeout(r, 0));
    expect(old.deref()).toBeUndefined();
  }, 30_000);

  it('F-005.R7 INV-05 a running validation stops within a slice when the document changes', async () => {
    const h = harness();
    const big = '[' + '"abcdefgh",'.repeat(500_000) + '1]'; // ~5.5 M units: debounced, several slices
    h.setText(big, 1);
    const id = h.validate(1);
    // edit as soon as the first slice has ended (progress posted), before the job finishes
    while (!h.of(id).some((m) => m.type === 'progress')) await new Promise((r) => setTimeout(r, 0));
    h.setText('[3]', 2);
    await h.engine.idle();
    expect(h.end(id)).toMatchObject({ type: 'failed', reason: 'cancelled' });
    expect(h.of(id).some((m) => m.type === 'validation')).toBe(false);
  });

  it('ADR-0005 large documents are validated in slices with progress', async () => {
    const h = harness();
    h.setText('[' + '"abcdefgh",'.repeat(400_000) + '1]', 1);
    const id = h.validate(1);
    await h.engine.idle();
    expect(h.of(id).filter((m) => m.type === 'progress').length).toBeGreaterThan(2);
    expect(h.end(id)).toMatchObject({ type: 'validation', result: { validity: 'valid' } });
  });

  it('ADR-0005 §2 a loaded file is validated while reading; the result is reused after adopt', async () => {
    const h = harness();
    const load = h.start({ kind: 'loadFile', file: new Blob(['{"a":1,"a":2}']) });
    await h.engine.idle();
    h.engine.handle({ type: 'adopt', jobId: load, version: 5 });
    const id = h.validate(5);
    await h.engine.idle();
    const msg = h.end(id);
    if (msg?.type !== 'validation') throw new Error('no result');
    expect(msg.result.issues.map((i) => i.code)).toEqual(['duplicate-key']);
    // reused: no validation slices were needed (no progress before the result)
    expect(h.of(id).filter((m) => m.type === 'progress')).toEqual([]);
  });

  it('ADR-0007 §1 the large tiers build the skip table during validation', async () => {
    const h = harness();
    const row = '{"id":12345,"name":"abcdefghijklmnopqrstuvwxyz"},';
    const text = '[' + row.repeat(Math.ceil(10_500_000 / row.length)) + '{}]';
    const load = h.start({ kind: 'loadFile', file: new Blob([text]) });
    await h.engine.idle();
    h.engine.handle({ type: 'adopt', jobId: load, version: 1 });
    const id = h.validate(1);
    await h.engine.idle();
    expect(h.end(id)).toMatchObject({ type: 'validation', result: { validity: 'valid' } });
    const table = h.engine.skipTable!;
    expect(table.mirror).toBe(h.engine.mirror);
    expect([table.table.starts[0], table.table.ends[0]]).toEqual([0, text.length]);
  }, 30_000);

  it('F-005.AC9 an empty mirror is empty with no issue', async () => {
    const h = harness();
    const id = h.validate(0);
    await h.engine.idle();
    expect(h.end(id)).toMatchObject({ type: 'validation', result: { validity: 'empty', issues: [] } });
  });
});
