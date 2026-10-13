// MOD-Worker tree jobs in Node (F-006, ADR-0007 §1–§2, §5): the root and children of the mirror
// at a version, the standalone structural pass when validation built no skip table, refusal of
// invalid documents, stale versions dropped (INV-05), value Blobs of exact spans with the
// document's line ending (RULE-11), and the background checkpoint fill.
import { ChangeSet } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { kindName, type ContainerRef, type TreeItem } from '../../src/core';
import { WorkerEngine } from '../../src/worker/engine';
import type { FromWorker, JobSpec } from '../../src/worker/protocol';
import { withBigArray } from '../support/tree-oracle';

function harness() {
  const out: FromWorker[] = [];
  const engine = new WorkerEngine((m) => out.push(m));
  let id = 0;
  const start = (job: JobSpec) => {
    const jobId = ++id;
    engine.handle({ type: 'job', jobId, job });
    return jobId;
  };
  const end = (jobId: number) =>
    out.find(
      (m) =>
        'jobId' in m &&
        m.jobId === jobId &&
        (m.type === 'treeRoot' ||
          m.type === 'treeRows' ||
          m.type === 'failed' ||
          m.type === 'blob' ||
          m.type === 'validation'),
    );
  const setText = (text: string, version: number) => {
    const len = engine.mirror.length;
    engine.handle({ type: 'edit', version, changes: ChangeSet.of({ from: 0, to: len, insert: text }, len).toJSON() });
  };
  const run = async (job: JobSpec) => {
    const jobId = start(job);
    await engine.idle();
    return end(jobId);
  };
  const root = async (version: number): Promise<TreeItem> => {
    const m = await run({ kind: 'treeOpen', version });
    if (m?.type !== 'treeRoot') throw new Error(`no root: ${JSON.stringify(m)}`);
    return m.root;
  };
  const children = async (version: number, c: ContainerRef, from: number, count: number): Promise<TreeItem[]> => {
    const m = await run({ kind: 'treeChildren', version, container: c, from, count });
    if (m?.type !== 'treeRows') throw new Error(`no rows: ${JSON.stringify(m)}`);
    return m.rows;
  };
  return { engine, out, start, end, setText, run, root, children };
}

const ref = (it: TreeItem): ContainerRef => ({ s: it.s, e: it.e, n: it.n, kind: it.kind });

describe('MOD-Worker tree', () => {
  it('F-006.AC2 F-006.R2 root and children of the current version (standalone skip-table pass)', async () => {
    const h = harness();
    h.setText('{"user":{"id":12345678901234567890,"tags":["a"]}}', 1);
    const root = await h.root(1);
    expect(kindName(root.kind)).toBe('object');
    expect(root.n).toBe(1);
    const [user] = await h.children(1, ref(root), 0, 100);
    expect(user).toMatchObject({ k: 'user', n: 2 });
    const kids = await h.children(1, ref(user!), 0, 100);
    expect(kids.map((k) => [k.k, kindName(k.kind), k.v ?? k.n])).toEqual([
      ['id', 'number', '12345678901234567890'],
      ['tags', 'array', 1],
    ]);
  });

  it('ADR-0007 §1 reuses the skip table built during validation (no second pass)', async () => {
    const h = harness();
    const text = withBigArray(5_000, 20_000);
    h.setText(text, 1);
    await h.run({ kind: 'validate', version: 1, lineEnding: 'lf', skipTable: true });
    const before = h.out.length;
    const open = h.start({ kind: 'treeOpen', version: 1 });
    await h.engine.idle();
    // answered at once: no progress messages from a structural pass
    expect(h.out.slice(before).filter((m) => m.type === 'progress')).toHaveLength(0);
    const m = h.end(open);
    expect(m?.type).toBe('treeRoot');
  });

  it('F-006.R7 an invalid document is refused with `invalid`', async () => {
    const h = harness();
    h.setText('{"a": 1,}', 1);
    expect(await h.run({ kind: 'treeOpen', version: 1 })).toMatchObject({ type: 'failed', reason: 'invalid' });
    h.setText('[1, 2', 2);
    await h.run({ kind: 'validate', version: 2, lineEnding: 'lf' });
    expect(await h.run({ kind: 'treeOpen', version: 2 })).toMatchObject({ type: 'failed', reason: 'invalid' });
  });

  it('INV-05 queries for a version that is no longer current fail as cancelled', async () => {
    const h = harness();
    h.setText('[1, 2, 3]', 1);
    const root = await h.root(1);
    h.setText('[1, 2]', 2);
    expect(await h.run({ kind: 'treeChildren', version: 1, container: ref(root), from: 0, count: 3 })).toMatchObject({
      type: 'failed',
      reason: 'cancelled',
    });
    expect(await h.run({ kind: 'export', version: 1, eol: '\n', span: [0, 1] })).toMatchObject({
      type: 'failed',
      reason: 'cancelled',
    });
    const fresh = await h.root(2);
    expect(fresh.n).toBe(2);
  });

  it('RULE-11 F-006.AC6 a value Blob is the exact span, line breaks in the document ending', async () => {
    const h = harness();
    // the mirror holds one '\n' per break; the document's ending is CRLF
    h.setText('{"price": 1.50, "o": {\n  "a": [1,\n 2]\n}}', 1);
    const root = await h.root(1);
    const [price, o] = await h.children(1, ref(root), 0, 2);
    const blobOf = async (s: number, e: number, eol: '\n' | '\r\n') => {
      const m = await h.run({ kind: 'export', version: 1, eol, span: [s, e] });
      if (m?.type !== 'blob') throw new Error('no blob');
      return m.blob.text();
    };
    expect(await blobOf(price!.s, price!.e, '\r\n')).toBe('1.50');
    expect(await blobOf(o!.s, o!.e, '\r\n')).toBe('{\r\n  "a": [1,\r\n 2]\r\n}');
    expect(await blobOf(o!.s, o!.e, '\n')).toBe('{\n  "a": [1,\n 2]\n}');
  });

  it('F-006.AC9 ADR-0007 §2 a deep block of a 100,000-child array, then the background fill completes', async () => {
    const h = harness();
    h.setText(withBigArray(100_000), 1);
    const root = await h.root(1);
    const [, big] = await h.children(1, ref(root), 0, 2);
    expect(big!.n).toBe(100_000);
    const rows = await h.children(1, ref(big!), 73_400, 100);
    expect(rows).toHaveLength(100);
    expect(rows[0]!.i).toBe(73_400);
    expect(rows[0]!.v).toBeUndefined();
    expect(rows[0]!.n).toBe(2);
    // the fill runs in ≤ 8 ms slices after the query; wait for it
    for (let k = 0; k < 200; k++) {
      await new Promise((r) => setTimeout(r, 5));
      if (!(h.engine as unknown as { fillStack: unknown[] }).fillStack.length) break;
    }
    expect((h.engine as unknown as { fillStack: unknown[] }).fillStack).toHaveLength(0);
    const last = await h.children(1, ref(big!), 99_950, 100);
    expect(last).toHaveLength(50);
    expect(last.at(-1)!.i).toBe(99_999);
  });
});
