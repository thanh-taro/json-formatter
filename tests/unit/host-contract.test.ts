// MOD-Host message contract (ADR-0008 §1, §3; RULE-16): pure checks, no DOM.
import { describe, expect, it } from 'vitest';
import {
  acceptThemeMessage,
  parseTheme,
  READY_MESSAGE,
  readyMessage,
  readyTargets,
  resolveTheme,
  THEME_MESSAGE,
} from '../../src/host/contract';

const HOST = 'https://tarokit.app';
const ALLOWED = [HOST] as const;
const parent = { name: 'parent window' };
const sibling = { name: 'sibling frame' };

describe('MOD-Host theme messages', () => {
  it('F-008.AC2 accepts a taro:theme message from an allowed origin and the parent window', () => {
    expect(
      acceptThemeMessage(
        { origin: HOST, source: parent, data: { type: THEME_MESSAGE, value: 'dark' } },
        ALLOWED,
        parent,
      ),
    ).toBe('dark');
    expect(
      acceptThemeMessage(
        { origin: HOST, source: parent, data: { type: 'taro:theme', value: 'light' } },
        ALLOWED,
        parent,
      ),
    ).toBe('light');
  });

  it('F-008.AC5 ignores a settings message from an origin not in the allowed list', () => {
    const data = { type: 'taro:theme', value: 'light' };
    expect(acceptThemeMessage({ origin: 'https://evil.example', source: parent, data }, ALLOWED, parent)).toBeNull();
    expect(
      acceptThemeMessage({ origin: 'https://tarokit.app.evil.example', source: parent, data }, ALLOWED, parent),
    ).toBeNull();
    expect(acceptThemeMessage({ origin: 'http://tarokit.app', source: parent, data }, ALLOWED, parent)).toBeNull();
    expect(acceptThemeMessage({ origin: 'null', source: parent, data }, ALLOWED, parent)).toBeNull();
  });

  it('F-008.AC5 ignores an allowed-origin message that does not come from the parent window', () => {
    const data = { type: 'taro:theme', value: 'light' };
    expect(acceptThemeMessage({ origin: HOST, source: sibling, data }, ALLOWED, parent)).toBeNull();
    expect(acceptThemeMessage({ origin: HOST, source: null, data }, ALLOWED, parent)).toBeNull();
  });

  it('F-008.AC5 NFR-09 accepts nothing when the allowed list is empty', () => {
    const data = { type: 'taro:theme', value: 'light' };
    expect(acceptThemeMessage({ origin: HOST, source: parent, data }, [], parent)).toBeNull();
  });

  it('RULE-16 ignores unknown types and unknown theme values (keeps the current theme)', () => {
    for (const data of [
      { type: 'taro:theme', value: 'sepia' },
      { type: 'taro:theme', value: 'DARK' },
      { type: 'taro:theme' },
      { type: 'taro:locale', value: 'dark' },
      { type: 'taro:ready' },
      'taro:theme dark',
      ['taro:theme', 'dark'],
      null,
      undefined,
      42,
    ]) {
      expect(
        acceptThemeMessage({ origin: HOST, source: parent, data }, ALLOWED, parent),
        JSON.stringify(data),
      ).toBeNull();
    }
  });

  it('RULE-16 parses only light and dark as theme values', () => {
    expect(parseTheme('light')).toBe('light');
    expect(parseTheme('dark')).toBe('dark');
    for (const v of [null, undefined, '', 'auto', 'Light', 1]) expect(parseTheme(v)).toBeNull();
  });
});

describe('MOD-Host theme resolution', () => {
  it('F-008.AC2 a valid host message wins over the address and the device', () => {
    expect(resolveTheme({ message: 'dark', address: 'light', device: 'light' })).toBe('dark');
  });

  it('F-008.AC1 the address theme wins over the device preference', () => {
    expect(resolveTheme({ message: null, address: 'dark', device: 'light' })).toBe('dark');
    expect(resolveTheme({ message: null, address: 'light', device: 'dark' })).toBe('light');
  });

  it('F-008.AC3 without host theme the device preference decides', () => {
    expect(resolveTheme({ message: null, address: null, device: 'dark' })).toBe('dark');
    expect(resolveTheme({ message: null, address: null, device: 'light' })).toBe('light');
  });
});

describe('MOD-Host ready signal', () => {
  it('F-008.AC6 the ready message carries only its type', () => {
    expect(readyMessage()).toEqual({ type: READY_MESSAGE });
    expect(READY_MESSAGE).toBe('taro:ready');
  });

  it('F-008.AC6 targets the allowed origin matching the referrer, never "*"', () => {
    expect(readyTargets('https://tarokit.app/', ALLOWED)).toEqual([HOST]);
    expect(readyTargets('https://tarokit.app/tools/json', ['https://a.example', HOST])).toEqual([HOST]);
  });

  it('F-008.AC6 falls back to every allowed origin when the referrer is missing or unlisted', () => {
    const list = ['https://a.example', HOST];
    expect(readyTargets('', list)).toEqual(list);
    expect(readyTargets('https://evil.example/', list)).toEqual(list);
    expect(readyTargets('not a url', list)).toEqual(list);
    expect(readyTargets('https://tarokit.app/', [])).toEqual([]);
    expect(readyTargets('', list)).not.toContain('*');
    expect(readyTargets('', ['*', HOST])).toEqual([HOST]);
  });
});
