// MOD-App: the RULE-02 very-large confirmation decision for tool operations whose result size is
// known before they run (beautify F-002.R7, re-indent F-004.R7). Pure, shared by every caller.
import { tierOf } from '../core';

/**
 * Implements: RULE-02 — a result over 100 MB needs the very-large confirmation first, unless the
 * document is already over 100 MB (the user confirmed when it got there).
 */
export function needsVeryLargeConfirm(currentBytes: number, resultBytes: number): boolean {
  return tierOf(resultBytes) === 'very-large' && tierOf(currentBytes) !== 'very-large';
}
