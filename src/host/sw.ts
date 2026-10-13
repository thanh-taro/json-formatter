// MOD-Host — the offline service worker, built to the stable, unhashed path /sw.js (MOD-Build).
// ADR-0012 "seedcached" design (promoted from SP-iframe): cache-only, hand-written, no
// dependency. It never fetches on its own initiative: no install-time precache, no periodic or
// background work. Its only fetches are the browser's own requests it forwards (page network
// first, asset cache misses) and seeding the files the page already loaded, read from the HTTP
// cache with `cache: "force-cache"` (NFR-01, D-021 exception: the tool's own files only).
// No `skipWaiting` / `clients.claim`: a new worker waits until every session of the old one has
// closed, and the page never reloads itself (F-011.R3).
// Classic script: this file must not import anything shared with the page (one bundle entry).
// Implements: F-011.R1, F-011.R2, F-011.R3, NFR-01 (D-021 exception only).
import { cacheKey, cacheName, prunable, routeOf, seedTargets, staleCaches } from './offline-policy';

/** Replaced in the built /sw.js by the build id (vite plugin `tk-offline`); "dev" otherwise. */
const BUILD_ID = '__TK_BUILD_ID__';
const CACHE = cacheName(BUILD_ID);

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
  readonly source: unknown;
}
interface WorkerScope {
  readonly location: { readonly origin: string };
  addEventListener(type: 'install' | 'activate', fn: (e: ExtendableEvent) => void): void;
  addEventListener(type: 'fetch', fn: (e: FetchEvent) => void): void;
  addEventListener(type: 'message', fn: (e: ExtendableMessageEvent) => void): void;
}
const scope = self as unknown as WorkerScope;
const ORIGIN = scope.location.origin;

const usable = (r: Response) => r.ok && r.type === 'basic' && !r.redirected;

// Install: carry the previous build's entries over (cache to cache, no network), so the tool
// still opens offline before the next online visit seeds this cache.
scope.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const target = await caches.open(CACHE);
      for (const name of staleCaches(await caches.keys(), CACHE)) {
        const old = await caches.open(name);
        for (const req of await old.keys()) {
          if (await target.match(req)) continue;
          const res = await old.match(req);
          if (res) await target.put(req, res);
        }
      }
    })(),
  );
});

// Activate: nothing of the old worker is in use any more (it had no clients left).
scope.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of staleCaches(await caches.keys(), CACHE)) await caches.delete(name);
    })(),
  );
});

scope.addEventListener('fetch', (event) => {
  const req = event.request;
  const route = routeOf(req, ORIGIN);
  if (!route) return;
  const key = cacheKey(new URL(req.url));
  if (route === 'page') {
    // Network first: a new version arrives with the next online opening (F-011.R3).
    event.respondWith(
      fetch(req).then(
        (res) => {
          if (usable(res)) {
            const copy = res.clone();
            event.waitUntil(caches.open(CACHE).then((c) => c.put(key, copy)));
          }
          return res;
        },
        async () => (await (await caches.open(CACHE)).match(key, { ignoreSearch: true })) ?? Response.error(),
      ),
    );
    return;
  }
  // Hashed assets are immutable: cache first; a miss is the browser's own request, kept.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(key);
      if (hit) return hit;
      const res = await fetch(req);
      if (usable(res)) event.waitUntil(cache.put(key, res.clone()));
      return res;
    })(),
  );
});

// Seeding: the page posts the files it already loaded; they come from the HTTP cache.
scope.addEventListener('message', (event) => {
  if (event.origin !== ORIGIN) return;
  const targets = seedTargets(event.data, ORIGIN);
  if (!targets.length) return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      for (const { href, key } of targets) {
        if (await cache.match(key)) continue;
        try {
          const res = await fetch(href, { cache: 'force-cache' });
          if (usable(res)) await cache.put(key, res);
        } catch {
          // offline or evicted: kept for the next visit
        }
      }
      const stale = prunable(
        (await cache.keys()).map((r) => r.url),
        targets.map((t) => t.key),
      );
      for (const key of stale) await cache.delete(key);
    })(),
  );
});
