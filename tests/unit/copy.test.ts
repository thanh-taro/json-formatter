// MOD-Copy: generated catalog matches copy.md; t() fills placeholders.
import { describe, expect, it } from 'vitest';
import copyMd from '../../specs/30-experience/copy.md?raw';
import { formatCount, hintFor, MESSAGES, t, tCount, type MessageId } from '../../src/copy';

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

  it('F-005.R3 F-005.R4 every RULE-04 and RULE-05 code has its own hint', () => {
    const codes = [
      'trailing-comma',
      'comment',
      'single-quotes',
      'unquoted-key',
      'missing-comma',
      'missing-colon',
      'unclosed-string',
      'unexpected-character',
      'invalid-literal',
      'invalid-number',
      'invalid-escape',
      'control-character',
      'extra-content',
      'empty-document',
      'too-deep',
      'duplicate-key',
      'unsafe-number',
      'byte-order-mark',
    ];
    for (const code of codes)
      expect(hintFor({ code }), code).toBe(MESSAGES[`hint.${code.replace(/-/g, '_')}` as MessageId]);
    expect(new Set(codes.map((code) => hintFor({ code }))).size).toBe(codes.length);
    expect(hintFor({ code: 'unclosed-container', params: { bracket: '[', line: 12 } })).toBe(
      'The [ opened on line 12 is never closed.',
    );
    expect(hintFor({ code: 'unexpected-closing', params: { bracket: '}' } })).toBe(
      'This } has no matching opening bracket.',
    );
  });

  it('F-005.R6 counts use digit grouping and the singular when the count is 1', () => {
    expect(tCount('status.size_lines', 1_905_220, '48.6 MB')).toBe('48.6 MB · 1,905,220 lines');
    expect(tCount('status.size_lines', 1, '0 B')).toBe('0 B · 1 line');
    expect(tCount('status.size_lines_short', 14, '339 B')).toBe('339 B · 14 ln');
    expect(tCount('status.valid_warnings', 2)).toBe('Valid JSON · 2 warnings');
    expect(tCount('status.valid_warnings', 1)).toBe('Valid JSON · 1 warning');
    expect(tCount('issue.more', 204)).toBe('…and 204 more warnings');
    expect(tCount('issue.more', 1)).toBe('…and 1 more warning');
    expect(formatCount(10_001)).toBe('10,001');
  });

  it('smoke: t() fills placeholders and leaves plain strings alone', () => {
    expect(t('action.beautify')).toBe('Beautify');
    expect(t('status.cursor', { line: 3, column: 14 })).toBe('Ln 3, Col 14');
  });
});
