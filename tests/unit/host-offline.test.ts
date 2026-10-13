// MOD-Host offline policy, MOD-Build offline output and the /sw.js header rule (ADR-0012,
// ADR-0009). The behaviour in browsers is covered by tests/e2e/f011-offline.spec.ts.
import { readFileSync } from 'node:fs';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import {
  cacheKey,
  cacheName,
  MAX_SEED_URLS,
  prunable,
  routeOf,
  seedTargets,
  staleCaches,
} from '../../src/host/offline-policy';
import { seedList } from '../../src/host/offline';
// @ts-expect-error -- plain ESM build script without type declarations
import { buildId, chunkList } from '../../scripts/lib/offline.mjs';
// @ts-expect-error -- plain ESM build script without type declarations
import { SW_CSP } from '../../scripts/gen-headers.mjs';

const O = 'https://json.tarokit.app';

describe('offline worker routing', () => {
  it('F-011.R1 pages are network first with an offline fallback; hashed assets cache first', () => {
    expect(routeOf({ method: 'GET', url: `${O}/?theme=dark`, mode: 'navigate' }, O)).toBe('page');
    expect(routeOf({ method: 'GET', url: `${O}/assets/index-abc.js`, mode: 'cors' }, O)).toBe('asset');
    expect(routeOf({ method: 'GET', url: `${O}/assets/font-x.woff2`, mode: 'cors' }, O)).toBe('asset');
  });

  it('F-011.R2 the worker leaves everything else alone', () => {
    expect(routeOf({ method: 'POST', url: `${O}/`, mode: 'navigate' }, O)).toBeNull();
    expect(routeOf({ method: 'GET', url: 'https://tarokit.app/assets/a.js', mode: 'cors' }, O)).toBeNull();
    expect(routeOf({ method: 'GET', url: `${O}/sw.js`, mode: 'same-origin' }, O)).toBeNull();
    expect(routeOf({ method: 'GET', url: `${O}/third-party-notices.txt`, mode: 'no-cors' }, O)).toBeNull();
    expect(routeOf({ method: 'GET', url: `${O}/assets/`, mode: 'cors' }, O)).toBeNull();
  });

  it('F-011.R1 a page is cached and matched without its query (the portal adds ?theme=)', () => {
    expect(cacheKey(new URL(`${O}/?theme=dark`))).toBe(`${O}/`);
    expect(cacheKey(new URL(`${O}/?theme=light#x`))).toBe(`${O}/`);
    expect(cacheKey(new URL(`${O}/assets/a.js?v=1`))).toBe(`${O}/assets/a.js`);
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

  it('NFR-01 the worker stores only the tool’s own files from a well-formed seed message', () => {
    expect(seedTargets({ type: 'seed', urls: ['/?theme=dark', '/', '/assets/a.js', '/sw.js'] }, O)).toEqual([
      { href: `${O}/?theme=dark`, key: `${O}/` },
      { href: `${O}/assets/a.js`, key: `${O}/assets/a.js` },
    ]);
    for (const bad of [
      null,
      'seed',
      { type: 'other', urls: ['/'] },
      { type: 'seed', urls: '/' },
      { type: 'seed', urls: ['https://evil.example/x', '//evil.example/y', 42] },
    ]) {
      expect(seedTargets(bad, O)).toEqual([]);
    }
    const many = Array.from({ length: 200 }, (_, i) => `/assets/${i}.js`);
    expect(seedTargets({ type: 'seed', urls: many }, O)).toHaveLength(MAX_SEED_URLS);
  });

  it('F-011.R3 after seeding, assets the current page does not use are pruned; pages are kept', () => {
    const cached = [`${O}/`, `${O}/assets/old.js`, `${O}/assets/new.js`, `${O}/assets/font.woff2`];
    expect(prunable(cached, [`${O}/`, `${O}/assets/new.js`, `${O}/assets/font.woff2`])).toEqual([`${O}/assets/old.js`]);
  });
});

describe('versioned caches', () => {
  it('F-011.R3 each build has its own cache; other builds’ caches are stale, foreign caches untouched', () => {
    expect(cacheName('abc123')).toBe('json-formatter-abc123');
    expect(
      staleCaches(['json-formatter-old', 'json-formatter-abc123', 'someone-else'], 'json-formatter-abc123'),
    ).toEqual(['json-formatter-old']);
  });

  it('F-011.R3 the build id follows the output and the chunk list names JS/CSS only', () => {
    const a = buildId(['assets/index-a.js', 'assets/x.css'], ['sw']);
    expect(a).toMatch(/^[0-9a-f]{12}$/);
    expect(buildId(['assets/x.css', 'assets/index-a.js'], ['sw'])).toBe(a);
    expect(buildId(['assets/index-b.js', 'assets/x.css'], ['sw'])).not.toBe(a);
    expect(chunkList(['assets/b.js', 'assets/a.css', 'assets/f.woff2', 'sw.js', 'assets/b.js.map'])).toEqual([
      '/assets/a.css',
      '/assets/b.js',
    ]);
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
  });
});
