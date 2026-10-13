// MOD-Copy: generated catalog matches copy.md; t() fills placeholders.
import { describe, expect, it } from 'vitest';
import copyMd from '../../specs/30-experience/copy.md?raw';
import { MESSAGES, t, type MessageId } from '../../src/copy';

const rows = [...copyMd.matchAll(/^\|\s*\*\*COPY-([a-z0-9_]+\.[a-z0-9_]+)\*\*\s*\|([^|]*)\|([^|]*)\|/gm)];

describe('MOD-Copy', () => {
  it('smoke: every non-deprecated COPY ID is generated with its text', () => {
    const live = rows.filter((r) => !/deprecated/i.test(r[3] ?? ''));
    expect(live.length).toBeGreaterThan(0);
    for (const [, id, text] of live) {
      expect(MESSAGES[id as MessageId], id).toBe(text?.trim());
    }
    expect(Object.keys(MESSAGES)).toHaveLength(live.length);
  });

  it('smoke: deprecated strings are not generated', () => {
    expect('error.download' in MESSAGES).toBe(false);
  });

  it('smoke: t() fills placeholders and leaves plain strings alone', () => {
    expect(t('action.beautify')).toBe('Beautify');
    expect(t('status.cursor', { line: 3, column: 14 })).toBe('Ln 3, Col 14');
  });
});
