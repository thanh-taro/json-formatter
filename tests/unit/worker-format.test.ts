// MOD-Worker format jobs in Node (F-002.R6, F-003.R5; ADR-0005 §2): beautify/minify the mirror
// in slices, stream flat output chunks, build the pending mirror adopted on commit, report the
// facts the editor commits with, refuse invalid documents, and cancel without touching the mirror.
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
  const end = (jobId: number) => of(jobId).find((m) => m.type === 'formatted' || m.type === 'failed');
  const text = (jobId: number) =>
    of(jobId)
      .map((m) => (m.type === 'chunk' ? m.text : ''))
      .join('');
  const setText = (t: string, version: number) => {
    const len = engine.mirror.length;
    engine.handle({ type: 'edit', version, changes: ChangeSet.of({ from: 0, to: len, insert: t }, len).toJSON() });
  };
  return { engine, out, start, of, end, text, setText };
}

const utf8 = (s: string) => Buffer.byteLength(s);

describe('MOD-Worker format', () => {
  it('F-002.AC1 beautify streams the result, which becomes the mirror only on adopt', async () => {
    const h = harness();
    h.setText('{"a":[1,2],"b":{}}', 1);
    const id = h.start({
      kind: 'format',
      version: 1,
      mode: { kind: 'beautify', indent: { kind: 'spaces', width: 2 } },
      lineEnding: 'lf',
      nonBreakBytes: 18,
    });
    await h.engine.idle();
    const want = '{\n  "a": [\n    1,\n    2\n  ],\n  "b": {}\n}';
    expect(h.text(id)).toBe(want);
    expect(h.end(id)).toEqual({
      type: 'formatted',
      jobId: id,
      facts: {
        length: want.length,
        breaks: { lf: 6, crlf: 0, cr: 0 },
        nonBreakBytes: utf8(want.replace(/\n/g, '')),
        endsWithLineBreak: false,
      },
    });
    expect(h.engine.mirror.toString()).toBe('{"a":[1,2],"b":{}}'); // INV-03 until adopted
    h.engine.handle({ type: 'adopt', jobId: id, version: 2 });
    expect(h.engine.mirror.toString()).toBe(want);
  });

  it('F-002.AC9 a CRLF document reports its breaks as CRLF and keeps its final break', async () => {
    const h = harness();
    // the mirror holds one '\n' per break; the document's line ending is CRLF
    h.setText('{"a":1}\n', 1);
    const id = h.start({
      kind: 'format',
      version: 1,
      mode: { kind: 'beautify', indent: { kind: 'tab' } },
      lineEnding: 'crlf',
      nonBreakBytes: 7,
    });
    await h.engine.idle();
    expect(h.text(id)).toBe('{\n\t"a": 1\n}\n');
    expect(h.end(id)).toMatchObject({
      facts: { breaks: { lf: 0, crlf: 3, cr: 0 }, endsWithLineBreak: true, nonBreakBytes: 9 },
    });
  });

  it('F-003.AC1 minify reports no line breaks and the bytes of the compact text', async () => {
    const h = harness();
    const input = '{\n  "a": [ 1, 2 ],\n  "b": "x y"\n}';
    h.setText(input, 1);
    const id = h.start({
      kind: 'format',
      version: 1,
      mode: { kind: 'minify' },
      lineEnding: 'lf',
      nonBreakBytes: utf8(input.replace(/\n/g, '')),
    });
    await h.engine.idle();
    expect(h.text(id)).toBe('{"a":[1,2],"b":"x y"}');
    expect(h.end(id)).toMatchObject({
      facts: { length: 21, breaks: { lf: 0, crlf: 0, cr: 0 }, nonBreakBytes: 21, endsWithLineBreak: false },
    });
  });

  it('F-002.AC6 F-003.AC3 INV-03 an invalid document fails with "invalid" and nothing is pending', async () => {
    const h = harness();
    h.setText("{'a':1}", 1);
    const id = h.start({ kind: 'format', version: 1, mode: { kind: 'minify' }, lineEnding: 'lf', nonBreakBytes: 7 });
    await h.engine.idle();
    expect(h.end(id)).toMatchObject({ type: 'failed', reason: 'invalid' });
    h.engine.handle({ type: 'adopt', jobId: id, version: 2 });
    expect(h.out.at(-1)).toMatchObject({ type: 'failed', jobId: -1 }); // nothing to adopt
  });

  it('F-002.AC8 F-003.AC5 a large format runs in slices with progress and stops on cancel', async () => {
    const h = harness();
    const row = '{"id":1,"name":"x","ok":true},';
    const input = '[' + row.repeat(Math.ceil((12 << 20) / row.length)) + '0]';
    h.setText(input, 1);
    const id = h.start({
      kind: 'format',
      version: 1,
      mode: { kind: 'beautify', indent: { kind: 'spaces', width: 4 } },
      lineEnding: 'lf',
      nonBreakBytes: input.length,
    });
    // let a few slices run, then cancel
    for (let i = 0; i < 50 && !h.of(id).some((m) => m.type === 'progress'); i++)
      await new Promise((r) => setTimeout(r, 5));
    expect(h.of(id).some((m) => m.type === 'progress')).toBe(true);
    h.engine.handle({ type: 'cancel', jobId: id });
    await h.engine.idle();
    expect(h.end(id)).toMatchObject({ type: 'failed', reason: 'cancelled' });
    expect(h.engine.mirror.toString()).toBe(input);
    // every chunk posted is bounded (flat strings of about 1 M units)
    for (const m of h.of(id)) if (m.type === 'chunk') expect(m.text.length).toBeLessThanOrEqual(2 << 20);
  });

  it('F-002.AC10 ADR-0005 a 10,000-level document streams in bounded chunks with yields in between', async () => {
    const h = harness();
    const input = '['.repeat(10_000) + ']'.repeat(10_000);
    h.setText(input, 1);
    const id = h.start({
      kind: 'format',
      version: 1,
      mode: { kind: 'beautify', indent: { kind: 'spaces', width: 2 } },
      lineEnding: 'lf',
      nonBreakBytes: input.length,
    });
    await h.engine.idle();
    const chunks = h.of(id).filter((m) => m.type === 'chunk');
    expect(chunks.length).toBeGreaterThan(50);
    for (const m of chunks) if (m.type === 'chunk') expect(m.text.length).toBeLessThanOrEqual(2 << 20);
    expect(h.of(id).filter((m) => m.type === 'progress').length).toBeGreaterThan(1);
    expect(h.end(id)).toMatchObject({ type: 'formatted', facts: { breaks: { lf: 19_998 } } });
  });

  it('INV-05 a format request for a version that is no longer current is dropped', async () => {
    const h = harness();
    h.setText('[1]', 1);
    h.setText('[2]', 2);
    const id = h.start({ kind: 'format', version: 1, mode: { kind: 'minify' }, lineEnding: 'lf', nonBreakBytes: 3 });
    await h.engine.idle();
    expect(h.end(id)).toMatchObject({ type: 'failed', reason: 'cancelled' });
  });
});
