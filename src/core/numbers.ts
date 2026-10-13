// MOD-Core number classification (RULE-05 `unsafe-number`), promoted from SP-formatter
// (ADR-0005). Called only for numbers the tokenizer cannot prove safe on its fast path
// (more than 15 digits or an exponent).

const MAX_SAFE = 9007199254740991; // 2^53 − 1

/**
 * Implements: RULE-05 — true when `text` (a valid JSON number) is unsafe: an integer literal (no
 * fraction, no exponent) whose absolute value exceeds 2^53−1, more than 17 significant digits
 * (leading and trailing zeros are not significant), a value that overflows to infinity, or a
 * non-zero value that rounds to zero. `0.1`, `1.50`, `1e3` are safe.
 */
export function classifyNumber(text: string): boolean {
  const v = Number(text);
  if (!Number.isFinite(v)) return true;
  const e = text.search(/[eE]/);
  const mantissa = e >= 0 ? text.slice(0, e) : text;
  const isInteger = e < 0 && mantissa.indexOf('.') < 0;
  const digits = mantissa.replace(/[-.]/g, '').replace(/^0+/, '');
  if (v === 0 && /[1-9]/.test(digits)) return true;
  if (isInteger && Math.abs(v) > MAX_SAFE) return true;
  return digits.replace(/0+$/, '').length > 17;
}
