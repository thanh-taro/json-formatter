// The built /sw.js (MOD-Build, ADR-0012) run in a fake service-worker scope: the normal worker's
// seeding rules and the SW_KILL=1 kill switch. Each variant is built once into a temp folder.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '../..');
const O = 'https://json.tarokit.app';
const dirs: string[] = [];

async function buildVariant(kill: boolean): Promise<string> {
  const outDir = mkdtempSync(path.join(tmpdir(), 'tk-sw-'));
  dirs.push(outDir);
  const saved = process.env['SW_KILL'];
  if (kill) process.env['SW_KILL'] = '1';
  else delete process.env['SW_KILL'];
  try {
    await build({
      root: ROOT,
      configFile: path.join(ROOT, 'vite.config.ts'),
      logLevel: 'silent',
      build: { outDir, emptyOutDir: true },
    });
  } finally {
    if (saved === undefined) delete process.env['SW_KILL'];
    else process.env['SW_KILL'] = saved;
  }
  return outDir;
}

afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** In-memory Cache Storage keyed by absolute URL (enough for what /sw.js uses). */
function fakeCaches() {
  const store = new Map<string, Map<string, Response>>();
  const url = (k: string | { url: string }) => new URL(typeof k === 'string' ? k : k.url, O);
  const open = async (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    const c = store.get(name)!;
    return {
      match: async (k: string | { url: string }, opts?: { ignoreSearch?: boolean }) => {
        const u = url(k);
        if (opts?.ignoreSearch) u.search = '';
        return c.get(u.href)?.clone();
      },
      put: async (k: string | { url: string }, res: Response) => void c.set(url(k).href, res.clone()),
      keys: async () => [...c.keys()].map((u) => ({ url: u })),
      delete: async (k: string | { url: string }) => c.delete(url(k).href),
    };
  };
  return {
    store,
    api: {
      open,
      keys: async () => [...store.keys()],
      delete: async (name: string) => store.delete(name),
    },
  };
}

type Handler = (e: Record<string, unknown>) => void;

/** Loads a built worker script into a fake scope; returns its handlers and the fakes. */
function runWorker(code: string, responses: Record<string, () => Response>) {
  const handlers = new Map<string, Handler>();
  const caches = fakeCaches();
  const log = { fetches: [] as string[], unregistered: false, skipWaiting: false, active: 0, maxActive: 0 };
  const scope = {
    location: { origin: O },
    addEventListener: (type: string, fn: Handler) => handlers.set(type, fn),
    registration: { unregister: async () => (log.unregistered = true) },
    skipWaiting: async () => void (log.skipWaiting = true),
  };
  const fetchStub = async (href: string) => {
    log.fetches.push(href);
    log.active++;
    log.maxActive = Math.max(log.maxActive, log.active);
    await new Promise((r) => setTimeout(r, 5));
    log.active--;
    const make = responses[new URL(href).pathname + new URL(href).search] ?? responses[new URL(href).pathname];
    if (!make) throw new TypeError('offline');
    return make();
  };
  new Function('self', 'caches', 'fetch', code)(scope, caches.api, fetchStub);
  /** Dispatches an extendable event and waits for everything it passed to waitUntil. */
  const dispatch = async (type: string, extra: Record<string, unknown> = {}) => {
    const waits: Promise<unknown>[] = [];
    handlers.get(type)?.({ ...extra, waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  };
  return { handlers, caches, log, dispatch };
}

const html = (chunks: string[], marker: string) =>
  `<!doctype html><html><head><meta name="tk-chunks" content="${chunks.join(' ')}" /><title>${marker}</title></head></html>`;
const ok = (body: string, type = 'text/html') => {
  const r = new Response(body, { status: 200, headers: { 'Content-Type': type } });
  Object.defineProperty(r, 'type', { value: 'basic' });
  return r;
};
const stored = async (w: ReturnType<typeof runWorker>, key: string) =>
  (await (await w.caches.api.open('json-formatter-v1')).match(key))?.text();

describe('the built offline worker', { timeout: 120_000 }, () => {
  let code = '';
  beforeAll(async () => {
    code = readFileSync(path.join(await buildVariant(false), 'sw.js'), 'utf8');
  });

  it('F-011.R1 a fetched page whose chunks are not all cached never replaces the stored page', async () => {
    const pageA = html(['/assets/a.js'], 'A');
    let current = pageA;
    const w = runWorker(code, {
      '/?theme=dark': () => ok(current),
      '/assets/a.js': () => ok('a', 'text/javascript'),
    });
    const seed = (urls: string[]) => w.dispatch('message', { origin: O, data: { type: 'seed', urls } });
    await seed(['/?theme=dark', '/assets/a.js']);
    expect(await stored(w, `${O}/`)).toBe(pageA);

    // The HTTP cache returns a newer HTML B whose chunk was never loaded or seeded.
    current = html(['/assets/b.js'], 'B');
    await seed(['/?theme=dark', '/assets/a.js']);
    expect(await stored(w, `${O}/`)).toBe(pageA);
    expect(await stored(w, `${O}/assets/a.js`)).toBe('a'); // not pruned either

    // A page without a chunk list cannot be checked: also kept out.
    current = '<!doctype html><title>no meta</title>';
    await seed(['/?theme=dark', '/assets/a.js']);
    expect(await stored(w, `${O}/`)).toBe(pageA);
  });

  it('F-011.R3 a matching new page is stored after its assets, and stale assets are pruned', async () => {
    const w = runWorker(code, {
      '/': () => ok(html(['/assets/a.js'], 'A')),
      '/?theme=light': () => ok(html(['/assets/b.js'], 'B')),
      '/assets/a.js': () => ok('a', 'text/javascript'),
      '/assets/b.js': () => ok('b', 'text/javascript'),
    });
    const seed = (urls: string[]) => w.dispatch('message', { origin: O, data: { type: 'seed', urls } });
    await seed(['/', '/assets/a.js']);
    await seed(['/?theme=light', '/assets/b.js']);
    expect(await stored(w, `${O}/`)).toContain('<title>B</title>');
    expect(await stored(w, `${O}/assets/b.js`)).toBe('b');
    expect(await stored(w, `${O}/assets/a.js`)).toBeUndefined();
  });

  it('F-011.R2 concurrent seeds run one at a time; foreign messages are ignored', async () => {
    const w = runWorker(code, {
      '/': () => ok(html(['/assets/a.js', '/assets/c.css'], 'A')),
      '/assets/a.js': () => ok('a', 'text/javascript'),
      '/assets/c.css': () => ok('c', 'text/css'),
    });
    await Promise.all([
      w.dispatch('message', { origin: O, data: { type: 'seed', urls: ['/', '/assets/a.js', '/assets/c.css'] } }),
      w.dispatch('message', { origin: O, data: { type: 'seed', urls: ['/', '/assets/a.js', '/assets/c.css'] } }),
      w.dispatch('message', { origin: 'https://evil.example', data: { type: 'seed', urls: ['/'] } }),
    ]);
    expect(w.log.maxActive).toBe(1);
    // The second seed found both assets cached: only the pages were fetched again.
    expect(w.log.fetches.filter((f) => f.endsWith('/assets/a.js'))).toHaveLength(1);
  });

  it('F-011.R2 it has no install-time work and never fetches on activate', async () => {
    const w = runWorker(code, {});
    expect(w.handlers.has('install')).toBe(false);
    await w.caches.api.open('json-formatter-v0');
    await w.caches.api.open('json-formatter-v1');
    await w.caches.api.open('other-app');
    await w.dispatch('activate');
    expect(await w.caches.api.keys()).toEqual(['json-formatter-v1', 'other-app']);
    expect(w.log.fetches).toEqual([]);
  });
});

describe('the SW_KILL=1 build (MOD-Build kill switch)', { timeout: 120_000 }, () => {
  let out = '';
  beforeAll(async () => {
    out = await buildVariant(true);
  });

  it('ADR-0012 the kill worker takes over, deletes the tool caches and unregisters', async () => {
    const w = runWorker(readFileSync(path.join(out, 'sw.js'), 'utf8'), {});
    expect(w.handlers.has('fetch')).toBe(false);
    expect(w.handlers.has('message')).toBe(false);
    await w.dispatch('install');
    expect(w.log.skipWaiting).toBe(true);
    await w.caches.api.open('json-formatter-v1');
    await w.caches.api.open('json-formatter-v0');
    await w.caches.api.open('other-app');
    await w.dispatch('activate');
    expect(await w.caches.api.keys()).toEqual(['other-app']);
    expect(w.log.unregistered).toBe(true);
    expect(w.log.fetches).toEqual([]);
  });

  it('ADR-0012 pages of the kill build register no worker and list no chunks', () => {
    expect(readFileSync(path.join(out, 'index.html'), 'utf8')).not.toContain('tk-chunks');
    const js = readdirSync(path.join(out, 'assets'))
      .filter((f) => f.endsWith('.js'))
      .map((f) => readFileSync(path.join(out, 'assets', f), 'utf8'))
      .join('\n');
    expect(js).not.toContain('/sw.js');
  });
});
