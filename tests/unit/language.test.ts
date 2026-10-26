// F-012 use the portal's language (RULE-19, RULE-16, ADR-0014): catalog, formatting and plurals,
// matching, resolution, settings messages, the copy generator, the boot script and the runtime
// controller. Titles cite the spec (adapters/tests.md).
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CATALOG,
  formatCount,
  formatSize,
  hintFor,
  language,
  LANGUAGES,
  MESSAGES,
  setLanguage,
  t,
  tCount,
  type MessageId,
} from '../../src/copy';
import {
  acceptLanguageMessage,
  acceptThemeMessage,
  LANGUAGE_MESSAGE,
  matchLanguage,
  resolveLanguage,
} from '../../src/host/contract';
// @ts-expect-error -- plain ESM build script without type declarations
import { parseCopy } from '../../scripts/gen-copy.mjs';
// @ts-expect-error -- plain ESM build script without type declarations
import { readBootScript } from '../../scripts/lib/boot.mjs';

const PARENT = { id: 'parent' };
const ORIGINS = ['https://tarokit.app'];
const msg = (data: unknown, over: Partial<{ origin: string; source: unknown }> = {}) => ({
  origin: 'https://tarokit.app',
  source: PARENT,
  data,
  ...over,
});
const placeholders = (s: string) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();

afterEach(() => {
  setLanguage('en-US');
});

describe('F-012 catalog', () => {
  it('F-012.AC12 every COPY ID that is not deprecated has a text in every language, same placeholders', () => {
    expect(LANGUAGES).toEqual(['en-US', 'vi-VN']);
    const ids = Object.keys(MESSAGES) as MessageId[];
    expect(ids.length).toBeGreaterThan(100);
    for (const lang of LANGUAGES) {
      expect(Object.keys(CATALOG[lang]).sort()).toEqual([...ids].sort());
      for (const id of ids) {
        expect(CATALOG[lang][id], `${lang} ${id}`).toBeTruthy();
        expect(placeholders(CATALOG[lang][id]), `${lang} ${id}`).toEqual(placeholders(MESSAGES[id]));
      }
    }
  });

  it('F-012.AC12 the generator refuses a missing translation or mismatched placeholders', () => {
    const head = '| ID | en-US | vi-VN | Notes |\n|---|---|---|---|\n';
    expect(() => parseCopy(head + '| **COPY-a.b** | Size {size} |  | |\n')).toThrow(/no vi-VN text/);
    expect(() => parseCopy(head + '| **COPY-a.b** | Size {size} | Cỡ {bytes} | |\n')).toThrow(/placeholders differ/);
    expect(() => parseCopy(head + '| **COPY-a.b** | Size {size} | Cỡ | |\n')).toThrow(/placeholders differ/);
    // Deprecated rows are skipped, even without a translation.
    expect(parseCopy(head + '| **COPY-a.b** | Old |  | deprecated |\n| **COPY-a.c** | X {n} | Y {n} | |\n')).toEqual({
      languages: ['en-US', 'vi-VN'],
      rows: [{ id: 'a.c', texts: { 'en-US': 'X {n}', 'vi-VN': 'Y {n}' }, params: ['n'] }],
    });
  });

  it('F-012.AC12 the generator reads the language columns from the table header', () => {
    const md = '| ID | vi-VN | en-US | Notes |\n|---|---|---|---|\n| **COPY-a.b** | Mở | Open | n |\n';
    expect(parseCopy(md)).toEqual({
      languages: ['vi-VN', 'en-US'],
      rows: [{ id: 'a.b', texts: { 'vi-VN': 'Mở', 'en-US': 'Open' }, params: [] }],
    });
    const other = '| ID | en-US | Notes |\n|---|---|---|\n| **COPY-a.c** | X | |\n';
    expect(() => parseCopy(md + '\n' + other)).toThrow(/differ/);
    expect(() => parseCopy('| ID | Text | Notes |\n|---|---|---|\n| **COPY-a.b** | X | |\n')).toThrow(
      /no language columns/,
    );
  });

  it('F-012.AC1 t() returns the vi-VN text when the active language is vi-VN', () => {
    setLanguage('vi-VN');
    expect(language.value).toBe('vi-VN');
    expect(t('action.beautify')).toBe('Làm đẹp');
    expect(t('status.cursor', { line: 3, column: 14 })).toBe('Dòng 3, cột 14');
    setLanguage('en-US');
    expect(t('action.beautify')).toBe('Beautify');
  });

  it('F-012.AC14 the tree value kinds are the same English words in every language', () => {
    for (const kind of ['object', 'array', 'string', 'number', 'boolean', 'null']) {
      const id = `tree.kind_${kind}` as MessageId;
      expect(CATALOG['vi-VN'][id]).toBe(kind);
      expect(CATALOG['en-US'][id]).toBe(kind);
    }
  });

  it('F-012.AC1 hints come from the active language', () => {
    setLanguage('vi-VN');
    expect(hintFor({ code: 'comment' })).toBe(CATALOG['vi-VN']['hint.comment']);
    expect(hintFor({ code: 'unclosed-container', params: { bracket: '[', line: 1234 } })).toBe(
      'Dấu [ mở ở dòng 1.234 chưa được đóng.',
    );
    expect(hintFor({ code: 'no-such-code' })).toBe(CATALOG['vi-VN']['hint.unexpected_character']);
  });
});

describe('F-012.R6 number and size formatting', () => {
  it('F-012.AC8 vi-VN writes 1.234 lines and 1,5 MB; en-US writes 1,234 and 1.5 MB', () => {
    setLanguage('vi-VN');
    expect(formatCount(1234)).toBe('1.234');
    expect(formatSize(1_500_000)).toBe('1,5 MB');
    expect(tCount('status.size_lines', 1234, formatSize(1_500_000))).toBe('1,5 MB · 1.234 dòng');
    setLanguage('en-US');
    expect(formatCount(1234)).toBe('1,234');
    expect(formatSize(1_500_000)).toBe('1.5 MB');
    expect(tCount('status.size_lines', 1234, formatSize(1_500_000))).toBe('1.5 MB · 1,234 lines');
  });

  it('F-012.AC8 sizes keep their units and rounding in every language (1 MB = 1,000,000 bytes)', () => {
    const cases: [number, string, string][] = [
      [0, '0 B', '0 B'],
      [999, '999 B', '999 B'],
      [1000, '1.0 KB', '1,0 KB'],
      [48_699, '48.6 KB', '48,6 KB'],
      [999_999, '999.9 KB', '999,9 KB'],
      [48_650_000, '48.6 MB', '48,6 MB'],
      [1_234_500_000, '1234.5 MB', '1234,5 MB'],
    ];
    for (const [bytes, en, vi] of cases) {
      setLanguage('en-US');
      expect(formatSize(bytes)).toBe(en);
      setLanguage('vi-VN');
      expect(formatSize(bytes)).toBe(vi);
    }
  });

  it('F-012.AC9 en-US uses the singular when a count is 1; vi-VN has no plural change', () => {
    setLanguage('en-US');
    expect(tCount('status.size_lines', 1, '0 B')).toBe('0 B · 1 line');
    expect(tCount('status.valid_warnings', 1)).toBe('Valid JSON · 1 warning');
    expect(tCount('tree.count_keys', 1)).toBe('1 key');
    expect(tCount('tree.count_items', 1)).toBe('1 item');
    expect(tCount('tree.count_items', 2)).toBe('2 items');
    setLanguage('vi-VN');
    expect(tCount('status.size_lines', 1, '0 B')).toBe('0 B · 1 dòng');
    expect(tCount('status.valid_warnings', 1)).toBe('JSON hợp lệ · 1 cảnh báo');
    expect(tCount('tree.count_keys', 1)).toBe('1 khoá');
    expect(tCount('tree.count_items', 1)).toBe('1 phần tử');
    expect(tCount('tree.count_items', 2)).toBe('2 phần tử');
    expect(tCount('issue.more', 1)).toBe('…và 1 cảnh báo khác');
  });
});

describe('RULE-19 matchLanguage', () => {
  it('F-012 edge cases: exact ignoring case, else same primary language, else unsupported', () => {
    expect(matchLanguage('vi-VN')).toBe('vi-VN');
    expect(matchLanguage('vi-vn')).toBe('vi-VN');
    expect(matchLanguage('vi')).toBe('vi-VN');
    expect(matchLanguage('VI')).toBe('vi-VN');
    expect(matchLanguage('en-US')).toBe('en-US');
    expect(matchLanguage('en-GB')).toBe('en-US');
    expect(matchLanguage('en')).toBe('en-US');
    expect(matchLanguage('fr-FR')).toBeNull();
    expect(matchLanguage('')).toBeNull();
    expect(matchLanguage(null)).toBeNull();
    expect(matchLanguage(42)).toBeNull();
  });
});

describe('RULE-19 resolveLanguage', () => {
  it('F-012.AC1 F-012.AC2 a supported address value wins over the browser', () => {
    expect(resolveLanguage({ message: null, address: 'vi-VN', browser: ['en-US'] })).toBe('vi-VN');
    expect(resolveLanguage({ message: null, address: 'en-US', browser: ['vi'] })).toBe('en-US');
  });
  it('F-012.AC3 the latest accepted host message wins over the address', () => {
    expect(resolveLanguage({ message: 'en-US', address: 'vi-VN', browser: [] })).toBe('en-US');
  });
  it('F-012.AC5 no address: first matching browser preference, else en-US', () => {
    const r = (browser: string[]) => resolveLanguage({ message: null, address: null, browser });
    expect(r(['vi'])).toBe('vi-VN');
    expect(r(['fr-FR', 'vi'])).toBe('vi-VN');
    expect(r(['fr-FR', 'en-GB', 'vi'])).toBe('en-US');
    expect(r(['fr-FR'])).toBe('en-US');
    expect(r([])).toBe('en-US');
  });
  it('F-012.AC6 an unsupported address value counts as absent', () => {
    expect(resolveLanguage({ message: null, address: 'fr-FR', browser: ['vi-VN'] })).toBe('vi-VN');
    expect(resolveLanguage({ message: null, address: 'fr-FR', browser: ['de'] })).toBe('en-US');
  });
});

describe('RULE-16 language settings messages', () => {
  it('F-012.AC3 accepts a supported language from the allowed parent', () => {
    expect(LANGUAGE_MESSAGE).toBe('taro:language');
    expect(acceptLanguageMessage(msg({ type: LANGUAGE_MESSAGE, value: 'en-US' }), ORIGINS, PARENT)).toBe('en-US');
    expect(acceptLanguageMessage(msg({ type: LANGUAGE_MESSAGE, value: 'vi' }), ORIGINS, PARENT)).toBe('vi-VN');
  });
  it('F-012.AC4 ignores other origins, other frames and unsupported values', () => {
    const data = { type: LANGUAGE_MESSAGE, value: 'en-US' };
    expect(acceptLanguageMessage(msg(data, { origin: 'https://evil.example' }), ORIGINS, PARENT)).toBeNull();
    expect(acceptLanguageMessage(msg(data, { source: { id: 'sibling' } }), ORIGINS, PARENT)).toBeNull();
    expect(acceptLanguageMessage(msg(data, { source: null }), ORIGINS, PARENT)).toBeNull();
    expect(acceptLanguageMessage(msg(data), [], PARENT)).toBeNull();
    expect(acceptLanguageMessage(msg({ type: LANGUAGE_MESSAGE, value: 'fr-FR' }), ORIGINS, PARENT)).toBeNull();
    expect(acceptLanguageMessage(msg({ type: LANGUAGE_MESSAGE }), ORIGINS, PARENT)).toBeNull();
    expect(acceptLanguageMessage(msg({ type: 'taro:lang', value: 'en-US' }), ORIGINS, PARENT)).toBeNull();
    expect(acceptLanguageMessage(msg('taro:language'), ORIGINS, PARENT)).toBeNull();
  });
  it('F-012 edge case: theme and language messages are independent', () => {
    const lang = msg({ type: LANGUAGE_MESSAGE, value: 'vi-VN' });
    const theme = msg({ type: 'taro:theme', value: 'dark' });
    expect(acceptThemeMessage(lang, ORIGINS, PARENT)).toBeNull();
    expect(acceptLanguageMessage(theme, ORIGINS, PARENT)).toBeNull();
    expect(acceptThemeMessage(theme, ORIGINS, PARENT)).toBe('dark');
    expect(acceptLanguageMessage(lang, ORIGINS, PARENT)).toBe('vi-VN');
  });
});

describe('F-012 boot script (page language before first paint)', () => {
  /** Runs the inlined boot script against a fake page and returns the attributes it set. */
  function boot(search: string, languages: string[]): Record<string, string> {
    const attrs: Record<string, string> = {};
    const fakeDocument = { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) } };
    const run = new Function('location', 'navigator', 'document', 'matchMedia', readBootScript() as string);
    run({ search }, { languages, language: languages[0] }, fakeDocument, () => ({ matches: false }));
    return attrs;
  }
  it('F-012.AC1 F-012.AC2 sets the page language from the address', () => {
    expect(boot('?lang=vi-VN', ['en-US'])['lang']).toBe('vi-VN');
    expect(boot('?theme=dark&lang=en-US', ['vi'])['lang']).toBe('en-US');
  });
  it('F-012.AC5 F-012.AC6 falls back to the browser preferences, then en-US, like resolveLanguage', () => {
    const cases: [string, string[]][] = [
      ['', ['vi']],
      ['', ['fr-FR', 'vi']],
      ['?lang=fr-FR', ['vi-VN']],
      ['?lang=vi-vn', []],
      ['', ['fr-FR', 'en-GB', 'vi']],
      ['', ['fr-FR']],
      ['', ['de']],
      ['', []],
    ];
    for (const [search, browser] of cases) {
      const address = new URLSearchParams(search).get('lang');
      expect(boot(search, browser)['lang'], `${search} ${browser.join()}`).toBe(
        resolveLanguage({ message: null, address, browser }),
      );
    }
  });
  it('F-012.AC12 the boot script supports exactly the catalog languages', () => {
    for (const l of LANGUAGES) expect(boot(`?lang=${l}`, [])['lang']).toBe(l);
    expect(boot('', [])['lang']).toBe(LANGUAGES[0]);
  });
  it('F-008.AC1 the boot script keeps the theme behaviour', () => {
    expect(boot('?theme=light&lang=vi-VN', [])['data-theme']).toBe('light');
    expect(boot('?lang=vi-VN', [])['data-theme']).toBe('dark');
  });
});

describe('F-012 runtime language controller (src/host/language.ts)', () => {
  it('F-012.AC1 F-012.AC3 sets the language and page language at start and on a host message', async () => {
    const attrs: Record<string, string> = {};
    let writes = 0;
    const fakeDocument = {
      documentElement: {
        getAttribute: (k: string) => attrs[k] ?? null,
        setAttribute: (k: string, v: string) => {
          writes++;
          attrs[k] = v;
        },
      },
    };
    vi.stubGlobal('location', { search: '?theme=dark&lang=vi-VN' });
    vi.stubGlobal('navigator', { languages: ['en-US'], language: 'en-US' });
    vi.stubGlobal('document', fakeDocument);
    try {
      const { setHostLanguage } = await import('../../src/host/language');
      expect(language.value).toBe('vi-VN');
      expect(attrs['lang']).toBe('vi-VN');
      setHostLanguage('en-US');
      expect(language.value).toBe('en-US');
      expect(attrs['lang']).toBe('en-US');
      // F-012 edge case: the same value again is applied with no visible change.
      const before = writes;
      setHostLanguage('en-US');
      expect(writes).toBe(before);
      expect(attrs['lang']).toBe('en-US');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
