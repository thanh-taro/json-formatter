// MOD-Host offline policy, MOD-Build offline output and the /sw.js header rule (ADR-0012,
// ADR-0009). The behaviour in browsers is covered by tests/e2e/f011-offline.spec.ts.
import { readFileSync } from 'node:fs';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import {
  CACHE_NAME,
  cacheKey,
  MAX_SEED_URLS,
  pageChunks,
  pageStorable,
  prunable,
  routeOf,
  seedPlan,
  staleCaches,
} from '../../src/host/offline-policy';
import { seedList } from '../../src/host/offline';
// @ts-expect-error -- plain ESM build script without type declarations
import { chunkList, swKill } from '../../scripts/lib/offline.mjs';
// @ts-expect-error -- plain ESM build script without type declarations
import { SW_CSP } from '../../scripts/gen-headers.mjs';

const O = 'https://json.tarokit.app';
const seed = (urls: unknown[]) => seedPlan({ type: 'seed', urls }, O);

describe('offline worker routing', () => {
  it('F-011.R1 the app page is network first with an offline fallback; hashed assets cache first', () => {
    expect(routeOf({ method: 'GET', url: `${O}/?theme=dark`, mode: 'navigate' }, O)).toBe('page');
    expect(routeOf({ method: 'GET', url: `${O}/index.html`, mode: 'navigate' }, O)).toBe('page');
    expect(routeOf({ method: 'GET', url: `${O}/assets/index-abc.js`, mode: 'cors' }, O)).toBe('asset');
    expect(routeOf({ method: 'GET', url: `${O}/assets/font-x.woff2`, mode: 'cors' }, O)).toBe('asset');
  });

  it('F-011.R2 the worker leaves everything else alone, including other navigated paths', () => {
    expect(routeOf({ method: 'POST', url: `${O}/`, mode: 'navigate' }, O)).toBeNull();
    expect(routeOf({ method: 'GET', url: 'https://tarokit.app/assets/a.js', mode: 'cors' }, O)).toBeNull();
    expect(routeOf({ method: 'GET', url: `${O}/sw.js`, mode: 'same-origin' }, O)).toBeNull();
    expect(routeOf({ method: 'GET', url: `${O}/third-party-notices.txt`, mode: 'navigate' }, O)).toBeNull();
    expect(routeOf({ method: 'GET', url: `${O}/anything`, mode: 'navigate' }, O)).toBeNull();
    expect(routeOf({ method: 'GET', url: `${O}/assets/`, mode: 'cors' }, O)).toBeNull();
    expect(routeOf({ method: 'GET', url: `${O}/assets/a.js?x=1`, mode: 'cors' }, O)).toBeNull();
    expect(routeOf({ method: 'GET', url: `blob:${O}/0b8e`, mode: 'cors' }, O)).toBeNull();
  });

  it('F-011.R1 the page has one key, matched without its query (the portal adds ?theme=)', () => {
    expect(cacheKey(new URL(`${O}/?theme=dark`), O)).toBe(`${O}/`);
    expect(cacheKey(new URL(`${O}/index.html?theme=light#x`), O)).toBe(`${O}/`);
    expect(cacheKey(new URL(`${O}/assets/a.js`), O)).toBe(`${O}/assets/a.js`);
  });
});

describe('seeding', () => {
  it('F-011.R2 the page names only files it already loaded, plus the build chunks', () => {
    expect(
      seedList(
        `${O}/?theme=dark`,
        [`${O}/assets/index-a.js`, `${O}/assets/font.woff2`, 'https://other.example/x.js', `${O}/sw.js`],
        ['/assets/index-a.js', '/assets/worker-b.js', '/assets/index-c.css'],
        O,
      ),
    ).toEqual([
      '/?theme=dark',
      '/assets/index-a.js',
      '/assets/font.woff2',
      '/assets/worker-b.js',
      '/assets/index-c.css',
    ]);
  });

  it('F-011.R1 the worker stores the assets first and the page last', () => {
    expect(seed(['/?theme=dark', '/assets/a.js', '/', '/assets/b.css', '/assets/a.js'])).toEqual({
      assets: [
        { href: `${O}/assets/a.js`, key: `${O}/assets/a.js` },
        { href: `${O}/assets/b.css`, key: `${O}/assets/b.css` },
      ],
      page: { href: `${O}/?theme=dark`, key: `${O}/` },
    });
    const many = Array.from({ length: 200 }, (_, i) => `/assets/${i}.js`);
    expect(seed(many).assets).toHaveLength(MAX_SEED_URLS);
  });

  it('PRN-01 NFR-01 hostile seed lists: only allow-listed http(s) tool files are ever stored', () => {
    for (const bad of [null, 'seed', { type: 'other', urls: ['/'] }, { type: 'seed', urls: '/' }]) {
      expect(seedPlan(bad, O)).toEqual({ assets: [], page: null });
    }
    expect(
      seed([
        `blob:${O}/7f3c-document-content`,
        `data:application/json,{"secret":1}`,
        `filesystem:${O}/temporary/doc.json`,
        'https://evil.example/assets/a.js',
        '//evil.example/assets/a.js',
        `http://json.tarokit.app/assets/a.js`, // other origin (scheme)
        '/sw.js',
        '/third-party-notices.txt',
        '/random',
        '/assets/',
        '/assets/sub/dir.js',
        '/assets/%2e%2e/secret.js',
        '/assets/..%2fsecret.js',
        '/assets/a.js?content=secret',
        '/assets/a.js/../../x',
        42,
      ]),
    ).toEqual({ assets: [], page: null });
    // `../` is resolved by the URL parser: it can only land on an allowed path or be dropped.
    expect(seed(['/assets/../index.html']).page).toEqual({ href: `${O}/index.html`, key: `${O}/` });
    // A page query other than the theme is not fetched (content never reaches a URL).
    expect(seed(['/?doc=secret']).page).toEqual({ href: `${O}/`, key: `${O}/` });
    expect(seed(['/?theme=dark&doc=secret']).page).toEqual({ href: `${O}/`, key: `${O}/` });
  });

  it('F-011.R3 after a seed, unused assets and anything off the allow-list are pruned; the page stays', () => {
    const cached = [
      `${O}/`,
      `${O}/assets/old.js`,
      `${O}/assets/new.js`,
      `${O}/assets/font.woff2`,
      `${O}/third-party-notices.txt`,
      `${O}/assets/a.js?x=1`,
    ];
    expect(prunable(cached, [`${O}/assets/new.js`, `${O}/assets/font.woff2`], O)).toEqual([
      `${O}/assets/old.js`,
      `${O}/third-party-notices.txt`,
      `${O}/assets/a.js?x=1`,
    ]);
  });
});

describe('which fetched page may be stored', () => {
  const page = (chunks: string) => `<head><meta name="tk-chunks" content="${chunks}" /></head>`;
  it('F-011.R1 a page is stored only when every chunk it names is cached', () => {
    expect(pageChunks(page('/assets/a.js /assets/b.css'), O)).toEqual([`${O}/assets/a.js`, `${O}/assets/b.css`]);
    expect(pageStorable(page('/assets/a.js'), [`${O}/`, `${O}/assets/a.js`], O)).toBe(true);
    expect(pageStorable(page('/assets/a.js /assets/b.js'), [`${O}/assets/a.js`], O)).toBe(false);
    expect(pageStorable('<head><title>no list</title></head>', [`${O}/assets/a.js`], O)).toBe(false);
    expect(pageStorable(page('https://evil.example/assets/a.js'), [], O)).toBe(false);
    expect(pageStorable(page('/sw.js'), [], O)).toBe(false);
  });
});

describe('one cache for every worker version', () => {
  it('F-011.R3 the cache name is fixed (schema version); activate removes only other schema caches', () => {
    expect(CACHE_NAME).toBe('json-formatter-v1');
    expect(staleCaches(['json-formatter-v0', CACHE_NAME, 'someone-else'])).toEqual(['json-formatter-v0']);
  });

  it('F-011.R2 the chunk list names JS/CSS only; the kill switch is a build flag', () => {
    expect(chunkList(['assets/b.js', 'assets/a.css', 'assets/f.woff2', 'sw.js', 'assets/b.js.map'])).toEqual([
      '/assets/a.css',
      '/assets/b.js',
    ]);
    expect(swKill({ SW_KILL: '1' })).toBe(true);
    expect(swKill({})).toBe(false);
  });
});

describe('/sw.js response headers (ADR-0009, ADR-0012)', () => {
  const headers = readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8');
  const rule = (pattern: string) => {
    const m = new RegExp(`^${pattern.replace(/[.*/]/g, '\\$&')}\\n((?:[ \\t]+.*\\n?)*)`, 'm').exec(headers);
    return (m?.[1] ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  };

  it('NFR-01 the worker script detaches the page CSP and may only connect to its own origin', () => {
    const sw = rule('/sw.js');
    expect(sw[0]).toBe('! Content-Security-Policy');
    expect(sw).toContain(`Content-Security-Policy: ${SW_CSP}`);
    expect(SW_CSP).toBe("default-src 'none'; connect-src 'self'");
    expect(rule('/*').join('\n')).toContain("connect-src 'none'");
  });

  it('F-011.R2 the worker script may be served from the HTTP cache for a day (updateViaCache all)', () => {
    const sw = rule('/sw.js');
    expect(sw).toContain('! Cache-Control');
    expect(sw).toContain('Cache-Control: public, max-age=86400');
  });
});

describe('lint: Cache Storage and fetch only in the worker', { timeout: 30_000 }, () => {
  const eslint = new ESLint();
  const errors = async (code: string, filePath: string) =>
    ((await eslint.lintText(code, { filePath }))[0]?.messages ?? []).map((m) => m.ruleId);

  it('NFR-01 the page side of MOD-Host still may not fetch or use caches', async () => {
    expect(await errors('void fetch("/x");', 'src/host/offline.ts')).toContain('no-restricted-globals');
    expect(await errors('void caches.open("x");', 'src/host/offline.ts')).toContain('no-restricted-globals');
    expect(await errors('void caches.open("x");', 'src/app/probe.ts')).toContain('no-restricted-globals');
  });

  it('NFR-01 the worker may use them, but no other storage', async () => {
    expect(await errors('void fetch("/x"); void caches.open("x");', 'src/host/sw.ts')).toEqual([]);
    expect(await errors('void indexedDB.open("x");', 'src/host/sw.ts')).toContain('no-restricted-globals');
    expect(await errors('void caches.open("x");', 'src/host/sw-kill.ts')).toEqual([]);
  });
});
