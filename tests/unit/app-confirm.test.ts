// RULE-02 very-large confirmation decision shared by beautify (F-002.R7) and re-indent (F-004.R7).
import { describe, expect, it } from 'vitest';
import { needsVeryLargeConfirm } from '../../src/app/confirm';

const MB = 1_000_000;

describe('RULE-02 needsVeryLargeConfirm', () => {
  it('F-002.AC10 RULE-02 a result crossing 100 MB needs confirmation', () => {
    expect(needsVeryLargeConfirm(20_000, 200 * MB)).toBe(true);
    expect(needsVeryLargeConfirm(100 * MB, 100 * MB + 1)).toBe(true);
  });

  it('RULE-02 a result of at most 100 MB needs none', () => {
    expect(needsVeryLargeConfirm(50 * MB, 100 * MB)).toBe(false);
    expect(needsVeryLargeConfirm(10, 20)).toBe(false);
  });

  it('RULE-02 a document already over 100 MB is not confirmed again', () => {
    expect(needsVeryLargeConfirm(100 * MB + 1, 180 * MB)).toBe(false);
    expect(needsVeryLargeConfirm(150 * MB, 150 * MB)).toBe(false);
  });
});
