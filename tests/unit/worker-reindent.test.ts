// MOD-Worker re-indent jobs (F-004, RULE-09): detection (plan or "not indented"), conversion
// into a pending mirror adopted on commit (INV-03), cancellation, stale versions.
import { ChangeSet } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { WorkerEngine } from '../../src/worker/engine';
import { reindentText } from '../../src/core';
import type { FromWorker, JobSpec } from '../../src/worker/protocol';

function harness(text: string) {
  const out: FromWorker[] = [];
  const engine = new WorkerEngine((m) => out.push(m));
  if (text) engine.handle({ type: 'edit', version: 1, changes: ChangeSet.of({ from: 0, insert: text }, 0).toJSON() });
  let id = 0;
  const start = (job: JobSpec) => {
    const jobId = ++id;
    engine.handle({ type: 'job', jobId, job });
    return jobId;
  };
  const of = (jobId: number) => out.filter((m) => 'jobId' in m && m.jobId === jobId);
  const last = (jobId: number) =>
    of(jobId)
      .filter((m) => m.type !== 'progress' && m.type !== 'chunk')
      .at(-1);
  const text_ = (jobId: number) =>
    of(jobId)
      .map((m) => (m.type === 'chunk' ? m.text : ''))
      .join('');
  return { engine, out, start, last, text: text_ };
}

const TWO = { kind: 'spaces', width: 2 } as const;
const FOUR = { kind: 'spaces', width: 4 } as const;

describe('MOD-Worker re-indent', () => {
  it('F-004.AC1 plan then convert: 4·n spaces become n tabs, adopted as the next version', async () => {
    const src = '{\n    "a": [\n        1\n    ]\n}';
    const h = harness(src);
    const plan = h.start({ kind: 'reindentPlan', version: 1, target: { kind: 'tab' } });
    await h.engine.idle();
    expect(h.last(plan)).toEqual({
      type: 'reindentPlan',
      jobId: plan,
      version: 1,
      unit: { tab: false, spaces: 4 },
      delta: -12,
      unchanged: false,
    });
    const conv = h.start({ kind: 'reindent', version: 1, target: { kind: 'tab' }, unit: { tab: false, spaces: 4 } });
    await h.engine.idle();
    const expected = '{\n\t"a": [\n\t\t1\n\t]\n}';
    expect(h.text(conv)).toBe(expected);
    expect(h.last(conv)).toMatchObject({ type: 'loaded', facts: { length: expected.length, breaks: { lf: 4 } } });
    expect(h.engine.mirror.toString()).toBe(src); // not before adopt (INV-03)
    h.engine.handle({ type: 'adopt', jobId: conv, version: 2 });
    expect(h.engine.mirror.toString()).toBe(expected);
  });

  it('F-004.AC6 a single-line document is reported as not indented', async () => {
    const h = harness('{"a":[1,2,3]}');
    const plan = h.start({ kind: 'reindentPlan', version: 1, target: FOUR });
    await h.engine.idle();
    expect(h.last(plan)).toEqual({ type: 'notIndented', jobId: plan });
  });

  it('F-004.AC4 F-004.R3 an invalid document is converted too', async () => {
    const h = harness('{\n  "a": 1,\n}');
    const conv = h.start({ kind: 'reindent', version: 1, target: FOUR, unit: { tab: false, spaces: 2 } });
    await h.engine.idle();
    expect(h.text(conv)).toBe('{\n    "a": 1,\n}');
  });

  it('F-004.AC7 INV-03 cancelling a conversion keeps the mirror and reports cancelled', async () => {
    const big = '[\n' + '  {"k": 1},\n'.repeat(400_000) + '  0\n]';
    const h = harness(big);
    const conv = h.start({ kind: 'reindent', version: 1, target: TWO, unit: { tab: false, spaces: 2 } });
    await new Promise((r) => setTimeout(r, 0));
    h.engine.handle({ type: 'cancel', jobId: conv });
    await h.engine.idle();
    expect(h.last(conv)).toMatchObject({ type: 'failed', reason: 'cancelled' });
    expect(h.engine.mirror.toString()).toBe(big);
  });

  it('F-004.R6 INV-05 a job for an older version is dropped as cancelled', async () => {
    const h = harness('[\n  1\n]');
    const plan = h.start({ kind: 'reindentPlan', version: 0, target: FOUR });
    await h.engine.idle();
    expect(h.last(plan)).toMatchObject({ type: 'failed', reason: 'cancelled' });
  });

  it('review m-5 a text over several slices ending in a whitespace-only line converts exactly', async () => {
    const src = '[\n' + '    {"k": [1, 2]},\n\t  "x",\n\n'.repeat(60_000) + '    0\n]\n   ';
    expect(src.length).toBeGreaterThan(1 << 20);
    const h = harness(src);
    const plan = h.start({ kind: 'reindentPlan', version: 1, target: TWO });
    await h.engine.idle();
    const p = h.last(plan);
    if (p?.type !== 'reindentPlan') throw new Error(`plan: ${p?.type}`);
    const conv = h.start({ kind: 'reindent', version: 1, target: TWO, unit: p.unit });
    await h.engine.idle();
    const expected = reindentText(src, TWO)!.text;
    expect(h.text(conv)).toBe(expected);
    expect(h.text(conv).endsWith('\n   ')).toBe(true);
    expect(p.delta).toBe(expected.length - src.length);
  });

  it('review m-6 a plan whose result equals the document is flagged unchanged', async () => {
    const h = harness('[\n  1,\n  [\n    2\n  ]\n]');
    const plan = h.start({ kind: 'reindentPlan', version: 1, target: TWO });
    await h.engine.idle();
    expect(h.last(plan)).toMatchObject({ type: 'reindentPlan', unchanged: true, delta: 0 });
  });

  it('RULE-01 review MJ-1 an invalid width reaching the worker is clamped, never stripping indentation', async () => {
    const h = harness('[\n  1\n]');
    const conv = h.start({
      kind: 'reindent',
      version: 1,
      target: { kind: 'spaces', width: Number.NaN },
      unit: { tab: false, spaces: 2 },
    });
    await h.engine.idle();
    expect(h.text(conv)).toBe('[\n  1\n]');
  });
});
