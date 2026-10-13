// MOD-Host — offline cache policy as pure functions (no DOM, no worker globals), ADR-0012.
// Imported only by the service worker entry (`sw.ts`), so the bundler inlines it into /sw.js.
// Implements: F-011.R1, F-011.R2, F-011.R3, NFR-01 (D-021 exception only).

/** Prefix of every Cache Storage name the tool owns; the suffix is the build id. */
export const CACHE_PREFIX = 'json-formatter-';
/** Upper bound of a seed list (the tool has a handful of files; anything larger is not ours). */
export const MAX_SEED_URLS = 64;

/** The one versioned cache of a build (ADR-0012 "one versioned Cache Storage entry set"). */
export function cacheName(buildId: string): string {
  return CACHE_PREFIX + buildId;
}

/** Caches of other builds, deleted when a new worker activates (no open session uses them). */
export function staleCaches(names: readonly string[], current: string): string[] {
  return names.filter((n) => n.startsWith(CACHE_PREFIX) && n !== current);
}

/** Hashed, immutable build output. */
export function isAssetPath(pathname: string): boolean {
  return pathname.startsWith('/assets/') && pathname.length > '/assets/'.length;
}

/**
 * The cache key of a tool URL: origin + path, without query or fragment. Pages are matched
 * ignoring the query (`ignoreSearch`), because the portal opens the tool with `?theme=`
 * (MOD-Host note, portal ADR-0011); embedded and standalone opening share one entry.
 */
export function cacheKey(url: URL): string {
  return url.origin + url.pathname;
}

export type Route = 'page' | 'asset' | null;

/**
 * How the worker answers a request: `page` network first with the cached copy as offline
 * fallback; `asset` cache first; null — not intercepted (other origins, non-GET, /sw.js, …).
 */
export function routeOf(req: { method: string; url: string; mode: string }, origin: string): Route {
  if (req.method !== 'GET') return null;
  const u = new URL(req.url);
  if (u.origin !== origin) return null;
  if (req.mode === 'navigate') return 'page';
  return isAssetPath(u.pathname) ? 'asset' : null;
}

export interface SeedTarget {
  /** What is fetched (with the query, so the HTTP cache entry of the load is reused). */
  readonly href: string;
  /** Where it is stored. */
  readonly key: string;
}

/**
 * Validates a `{ type: "seed", urls }` message from the page into the tool's own files to store:
 * same-origin, http(s), at most MAX_SEED_URLS, no duplicates by key; never /sw.js itself.
 * Anything else yields an empty list (the message is ignored).
 */
export function seedTargets(data: unknown, origin: string): SeedTarget[] {
  if (typeof data !== 'object' || data === null) return [];
  const { type, urls } = data as { type?: unknown; urls?: unknown };
  if (type !== 'seed' || !Array.isArray(urls)) return [];
  const out: SeedTarget[] = [];
  const keys = new Set<string>();
  for (const raw of urls.slice(0, MAX_SEED_URLS)) {
    if (typeof raw !== 'string') continue;
    let u: URL;
    try {
      u = new URL(raw, origin);
    } catch {
      continue;
    }
    if (u.origin !== origin || u.pathname === '/sw.js') continue;
    u.hash = '';
    const key = cacheKey(u);
    if (keys.has(key)) continue;
    keys.add(key);
    out.push({ href: u.href, key });
  }
  return out;
}

/**
 * Asset entries the current page does not use (pruned per navigation, after seeding — not in
 * `activate`, ADR-0012). Pages are kept: the latest one is the offline fallback.
 */
export function prunable(cachedKeys: readonly string[], seeded: readonly string[]): string[] {
  const keep = new Set(seeded);
  return cachedKeys.filter((k) => isAssetPath(new URL(k).pathname) && !keep.has(k));
}
