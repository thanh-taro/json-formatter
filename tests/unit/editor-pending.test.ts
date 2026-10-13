// MOD-Editor pending document: cancel while the final commit waits (review B1) and memory
// failures while appending (security review MAJOR-1) — INV-03, F-001.R8, F-001.R9.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TextBuilder } from '../../src/editor/builder';
import { createPending, DiscardedError } from '../../src/editor/pending';

afterEach(() => vi.restoreAllMocks());

describe('pending document', () => {
  it('F-001.AC9 INV-03 cancelling while the final commit waits for the builder ends at once', async () => {
    const committed = vi.fn(() => 1);
    const pending = createPending(committed);
    // far more than one 8 ms slice of work, so commit() has to wait for the builder
    for (let i = 0; i < 40; i++) pending.append('{"a": 1}\n'.repeat(100_000));
    const commit = pending.commit({});
    await new Promise((r) => setTimeout(r, 5));
    const t0 = performance.now();
    pending.discard();
    await expect(commit).rejects.toBeInstanceOf(DiscardedError);
    expect(performance.now() - t0).toBeLessThan(200);
    expect(committed).not.toHaveBeenCalled();
  });

  it('F-001.R8 a pending document commits the exact text once complete', async () => {
    const seen: string[] = [];
    const pending = createPending((text) => (seen.push(text.sliceString(0)), 7));
    pending.append('[1,\r');
    pending.append('\n2]');
    await expect(pending.commit({})).resolves.toBe(7);
    expect(seen).toEqual(['[1,\n2]']);
  });

  it('F-001.AC10 F-001.R9 a memory failure while appending fails the commit; no text is lost silently', async () => {
    const append = vi.spyOn(TextBuilder.prototype as unknown as { append: (p: string) => void }, 'append');
    append.mockImplementationOnce(() => {
      throw new RangeError('Invalid string length');
    });
    const committed = vi.fn(() => 1);
    const pending = createPending(committed);
    pending.append('[1, 2, 3]');
    await expect(pending.commit({})).rejects.toBeInstanceOf(RangeError);
    expect(() => pending.append('more')).toThrow(RangeError);
    expect(committed).not.toHaveBeenCalled();
  });

  it('F-001.R9 the builder keeps a piece queued when appending it fails', () => {
    const b = new TextBuilder();
    const append = vi.spyOn(b as unknown as { append: (p: string) => void }, 'append');
    append.mockImplementationOnce(() => {
      throw new RangeError('out of memory');
    });
    b.push('abc');
    expect(() => b.step()).toThrow(RangeError);
    expect(b.idle).toBe(false);
    expect(() => b.finish()).toThrow(RangeError);
  });
});
