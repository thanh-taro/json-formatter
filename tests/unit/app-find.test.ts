// MOD-App find orchestration for CMP-SearchPanel (F-010): the count shown for the current term.
import { describe, expect, it } from 'vitest';
import { FindController } from '../../src/app/find';
import type { EditorHandle, FindSession, FindStatus } from '../../src/editor';

/** A fake editor whose find sessions report counts only when the test says so. */
function fakeEditor() {
  const sessions: { term: string; emit: (s: FindStatus) => void; closed: boolean }[] = [];
  const editor = {
    find(term: string) {
      const listeners: ((s: FindStatus) => void)[] = [];
      const entry = { term, emit: (s: FindStatus) => listeners.forEach((cb) => cb(s)), closed: false };
      sessions.push(entry);
      return {
        onCount: (cb: (s: FindStatus) => void) => listeners.push(cb),
        onFirst: () => undefined,
        next: () => undefined,
        previous: () => undefined,
        close: () => (entry.closed = true),
      } as unknown as FindSession;
    },
    focus: () => undefined,
  } as unknown as EditorHandle;
  return { editor, sessions };
}

describe('FindController', () => {
  it("F-010.R3 a new term never shows the previous term's count; nothing until its first result", () => {
    const { editor, sessions } = fakeEditor();
    const find = new FindController(
      () => editor,
      () => undefined,
    );
    find.show();
    find.setTerm('s');
    sessions[0]!.emit({ current: 1, total: 40, done: true });
    expect(find.status.value).toEqual({ current: 1, total: 40, done: true });
    find.setTerm('st');
    expect(sessions[0]!.closed).toBe(true);
    expect(find.status.value).toBeNull();
    // a late result of the old term is ignored
    sessions[0]!.emit({ current: 2, total: 40, done: true });
    expect(find.status.value).toBeNull();
    sessions[1]!.emit({ current: 1, total: 3, done: false });
    expect(find.status.value).toEqual({ current: 1, total: 3, done: false });
    // toggling match case is a new search too
    find.toggleMatchCase();
    expect(find.status.value).toBeNull();
  });

  it('F-010.R1 opening find shows the text view first (F-010 edge case: tree shown)', () => {
    const { editor } = fakeEditor();
    const calls: string[] = [];
    const find = new FindController(
      () => editor,
      () => calls.push('text'),
    );
    find.show();
    expect(calls).toEqual(['text']);
    expect(find.open.value).toBe(true);
  });
});
