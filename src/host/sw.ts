// MOD-Host — the offline service worker, built to the stable, unhashed path /sw.js (MOD-Build).
// ADR-0012 "seedcached" design (promoted from SP-iframe): cache-only, hand-written, no
// dependency. It never fetches on its own initiative: no install-time precache, no periodic or
// background work. Its only fetches are the browser's own requests it forwards (the page,
// network first; asset cache misses) and seeding the files the page already loaded, read from
// the HTTP cache with `cache: "force-cache"` (NFR-01, D-021 exception: the tool's own files).
// One fixed cache (schema-versioned, not per build), shared by every worker version; pruned per
// navigation after seeding. Only allow-listed tool files are ever stored (PRN-01).
// No `skipWaiting` / `clients.claim`: a new worker waits until every session of the old one has
// closed, and the page never reloads itself (F-011.R3).
// Classic script: this file must not import anything shared with the page (one bundle entry).
// Implements: F-011.R1, F-011.R2, F-011.R3, NFR-01 (D-021 exception only), PRN-01.
import { CACHE_NAME, cacheKey, prunable, routeOf, seedPlan, staleCaches } from './offline-policy';

// Minimal service-worker typings (the DOM lib is in scope; WebWorker types would clash).
interface ExtendableEvent extends Event {
  waitUntil(p: Promise<unknown>): void;
}
interface FetchEvent extends ExtendableEvent {
  readonly request: Request;
  respondWith(r: Response | Promise<Response>): void;
}
interface ExtendableMessageEvent extends ExtendableEvent {
  readonly data: unknown;
  readonly origin: string;
}
interface WorkerScope {
  readonly location: { readonly origin: string };
  addEventListener(type: 'activate', fn: (e: ExtendableEvent) => void): void;
  addEventListener(type: 'fetch', fn: (e: FetchEvent) => void): void;
  addEventListener(type: 'message', fn: (e: ExtendableMessageEvent) => void): void;
}
const scope = self as unknown as WorkerScope;
const ORIGIN = scope.location.origin;

const usable = (r: Response) => r.ok && r.type === 'basic' && !r.redirected;

// Activate: only caches of an older schema are removed; the shared cache stays.
scope.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of staleCaches(await caches.keys(), CACHE_NAME)) await caches.delete(name);
    })(),
  );
});

scope.addEventListener('fetch', (event) => {
  const req = event.request;
  const route = routeOf(req, ORIGIN);
  if (!route) return;
  const key = cacheKey(new URL(req.url), ORIGIN);
  if (!key) return;
  if (route === 'page') {
    // Network first, so a new version arrives with the next online opening (F-011.R3). The page
    // is stored by the seed, after its assets — never here (m1, review 1).
    event.respondWith(
      fetch(req).catch(
        async () => (await (await caches.open(CACHE_NAME)).match(key, { ignoreSearch: true })) ?? Response.error(),
      ),
    );
    return;
  }
  // Hashed assets are immutable: cache first; a miss is the browser's own request, kept.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const hit = await cache.match(key);
      if (hit) return hit;
      const res = await fetch(req);
      if (usable(res)) event.waitUntil(cache.put(key, res.clone()));
      return res;
    })(),
  );
});

// Seeding: the page posts the files it already loaded; they come from the HTTP cache. Assets
// first, the page last (always replaced); pruning only after a complete seed.
scope.addEventListener('message', (event) => {
  if (event.origin !== ORIGIN) return;
  const { assets, page } = seedPlan(event.data, ORIGIN);
  if (!page) return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const store = async (href: string, key: string) => {
        try {
          const res = await fetch(href, { cache: 'force-cache' });
          if (!usable(res)) return false;
          await cache.put(key, res);
          return true;
        } catch {
          return false; // offline or evicted: kept for the next visit
        }
      };
      for (const { href, key } of assets) {
        if (!(await cache.match(key)) && !(await store(href, key))) return;
      }
      if (!(await store(page.href, page.key))) return;
      const keys = (await cache.keys()).map((r) => r.url);
      const seeded = assets.map((a) => a.key);
      for (const key of prunable(keys, seeded, ORIGIN)) await cache.delete(key);
    })(),
  );
});
