// MOD-Host — offline cache policy as pure functions (no DOM, no worker globals), ADR-0012.
// Imported only by the service worker entry (`sw.ts`), so the bundler inlines it into /sw.js.
// Implements: F-011.R1, F-011.R2, F-011.R3, NFR-01 (D-021 exception only), PRN-01 (only the
// tool's own files are ever stored: the allow-list is enforced inside the worker).

/** Prefix of every Cache Storage name the tool owns. */
export const CACHE_PREFIX = 'json-formatter-';
/**
 * The one Cache Storage entry set (ADR-0012). Its version is the cache *schema*: bumped only
 * when the stored format changes, never per build, so every worker version reads and writes the
 * same entries and a new worker serves exactly what the previous one stored.
 */
export const CACHE_NAME = `${CACHE_PREFIX}v1`;
/** Upper bound of a seed list (the tool has a handful of files; anything larger is not ours). */
export const MAX_SEED_URLS = 64;

/** Caches of other schema versions, deleted when a worker activates. */
export function staleCaches(names: readonly string[], current = CACHE_NAME): string[] {
  return names.filter((n) => n.startsWith(CACHE_PREFIX) && n !== current);
}

const ASSET = /^\/assets\/[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

/** Hashed, immutable build output: one file name directly under /assets/, no dot segments. */
export function isAssetPath(pathname: string): boolean {
  return ASSET.test(pathname) && !pathname.includes('..');
}

/** The app page (the tool is served at the root of its own origin). */
export function isPagePath(pathname: string): boolean {
  return pathname === '/' || pathname === '/index.html';
}

const ownHttp = (u: URL, origin: string) => (u.protocol === 'https:' || u.protocol === 'http:') && u.origin === origin;

/**
 * The cache key of an allowed tool URL, or null when the URL must never be stored (other
 * schemes such as blob: or data:, other origins, any path off the allow-list). The page has one
 * key whatever its address: it is matched ignoring the query (`ignoreSearch`), because the
 * portal opens the tool with `?theme=` (MOD-Host note, portal ADR-0011).
 */
export function cacheKey(url: URL, origin: string): string | null {
  if (!ownHttp(url, origin)) return null;
  if (isPagePath(url.pathname)) return `${origin}/`;
  if (isAssetPath(url.pathname) && !url.search) return origin + url.pathname;
  return null;
}

export type Route = 'page' | 'asset' | null;

/**
 * How the worker answers a request: `page` network first with the stored page as offline
 * fallback; `asset` cache first; null — not intercepted (other origins, non-GET, other paths).
 */
export function routeOf(req: { method: string; url: string; mode: string }, origin: string): Route {
  if (req.method !== 'GET') return null;
  const u = new URL(req.url);
  if (!ownHttp(u, origin)) return null;
  if (req.mode === 'navigate') return isPagePath(u.pathname) ? 'page' : null;
  return isAssetPath(u.pathname) && !u.search ? 'asset' : null;
}

export interface SeedTarget {
  /** What is fetched (the address the page was loaded from, so its HTTP cache entry is reused). */
  readonly href: string;
  /** Where it is stored. */
  readonly key: string;
}

export interface SeedPlan {
  /** Assets first … */
  readonly assets: SeedTarget[];
  /** … and the page last, so a stored page never names assets that are not stored. */
  readonly page: SeedTarget | null;
}

/** The only query the page address may carry when fetched for seeding (portal ADR-0011). */
const PAGE_QUERY = /^(\?theme=(light|dark))?$/;

/**
 * Validates a `{ type: "seed", urls }` message from the page into the tool's own files to
 * store. Everything off the allow-list is dropped — blob:, data:, filesystem:, other origins,
 * other paths, assets with a query; the page address keeps only the `theme` query (any other
 * query is fetched without it). At most MAX_SEED_URLS entries, no duplicates by key.
 */
export function seedPlan(data: unknown, origin: string): SeedPlan {
  const empty: SeedPlan = { assets: [], page: null };
  if (typeof data !== 'object' || data === null) return empty;
  const { type, urls } = data as { type?: unknown; urls?: unknown };
  if (type !== 'seed' || !Array.isArray(urls)) return empty;
  const assets: SeedTarget[] = [];
  let page: SeedTarget | null = null;
  const keys = new Set<string>();
  for (const raw of urls.slice(0, MAX_SEED_URLS)) {
    if (typeof raw !== 'string') continue;
    let u: URL;
    try {
      u = new URL(raw, origin);
    } catch {
      continue;
    }
    u.hash = '';
    const key = cacheKey(u, origin);
    if (!key) continue;
    if (isPagePath(u.pathname)) {
      if (page) continue;
      if (!PAGE_QUERY.test(u.search)) u.search = '';
      page = { href: u.href, key };
      continue;
    }
    if (keys.has(key)) continue;
    keys.add(key);
    assets.push({ href: u.href, key });
  }
  return { assets, page };
}

/**
 * Entries to delete after a complete seed (per navigation, ADR-0012): assets the current page
 * does not use, and anything off the allow-list. The page entry is kept.
 */
export function prunable(cachedKeys: readonly string[], seeded: readonly string[], origin: string): string[] {
  const keep = new Set(seeded);
  return cachedKeys.filter((k) => {
    let u: URL;
    try {
      u = new URL(k);
    } catch {
      return true;
    }
    const key = cacheKey(u, origin);
    if (key !== k) return true;
    return !isPagePath(u.pathname) && !keep.has(k);
  });
}

const CHUNKS_META = /<meta\s+name="tk-chunks"\s+content="([^"]*)"/;

/**
 * The build chunks a page names in its `tk-chunks` meta (MOD-Build), as cache keys; null when
 * the page has no such list (then it cannot be checked and is never stored).
 */
export function pageChunks(html: string, origin: string): string[] | null {
  const m = CHUNKS_META.exec(html);
  if (!m) return null;
  const out: string[] = [];
  for (const p of (m[1] ?? '').split(/\s+/).filter(Boolean)) {
    let u: URL;
    try {
      u = new URL(p, origin);
    } catch {
      return null;
    }
    const key = cacheKey(u, origin);
    if (!key || !isAssetPath(u.pathname)) return null;
    out.push(key);
  }
  return out;
}

/**
 * Whether a fetched page may replace the stored one: every chunk it names is already in the
 * cache. The page fetched for seeding can be a newer HTML than the one that was loaded (the HTTP
 * cache may hold an unseeded version); storing it without its assets would open blank offline.
 */
export function pageStorable(html: string, cachedKeys: readonly string[], origin: string): boolean {
  const chunks = pageChunks(html, origin);
  if (!chunks) return false;
  const have = new Set(cachedKeys);
  return chunks.every((c) => have.has(c));
}
