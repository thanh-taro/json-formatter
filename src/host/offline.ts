// MOD-Host — offline use, page side (ADR-0012): registers /sw.js after first render and posts
// the list of files the page already loaded, so the worker can store them from the HTTP cache.
// Registration failures are silent: the tool then simply works online only.
// Implements: F-011.R1, F-011.R2 (no requests of its own: the seed list names loaded files only),
// F-011.R3 (nothing here ever reloads the page).

/** Name of the build-time `<meta>` listing the build's JS/CSS chunks (vite plugin `tk-offline`). */
export const CHUNKS_META = 'tk-chunks';
const MAX_SEED_URLS = 64;

const isAsset = (pathname: string) => pathname.startsWith('/assets/') && pathname.length > 8;

/**
 * The seed list: the page's own document and every same-origin `/assets/*` file it loaded
 * (resource timing), plus the build's known chunks (the worker chunk, which not every engine
 * lists as a page resource, and any lazy chunk — all requested during load, ADR-0012). Fonts
 * appear only when loaded, so seeding never names a file the page did not need.
 */
export function seedList(
  documentUrl: string,
  resourceUrls: readonly string[],
  knownChunks: readonly string[],
  origin: string,
): string[] {
  const out = new Set<string>();
  const doc = new URL(documentUrl);
  if (doc.origin === origin) out.add(doc.pathname + doc.search);
  for (const raw of [...resourceUrls, ...knownChunks]) {
    let u: URL;
    try {
      u = new URL(raw, origin);
    } catch {
      continue;
    }
    if (u.origin === origin && isAsset(u.pathname)) out.add(u.pathname);
  }
  return [...out].slice(0, MAX_SEED_URLS);
}

async function register(): Promise<void> {
  const sw = navigator.serviceWorker;
  // `updateViaCache: "all"`: the browser's update check of /sw.js may be served by the HTTP
  // cache (max-age=86400), so Chromium and Firefox make no request after load (SP-iframe).
  await sw.register('/sw.js', { updateViaCache: 'all' });
  const ready = await sw.ready;
  await document.fonts?.ready;
  const meta = document.querySelector<HTMLMetaElement>(`meta[name="${CHUNKS_META}"]`);
  const urls = seedList(
    location.href,
    performance.getEntriesByType('resource').map((e) => e.name),
    (meta?.content ?? '').split(/\s+/).filter(Boolean),
    location.origin,
  );
  ready.active?.postMessage({ type: 'seed', urls });
}

let started = false;

/**
 * Starts offline support once, after the page has loaded (call after the first render).
 * No-op without service-worker support, in development, or when registration is refused
 * (storage partitioning, sandboxing).
 */
export function startOffline(): void {
  if (started || import.meta.env.DEV) return;
  started = true;
  try {
    if (!('serviceWorker' in navigator)) return;
  } catch {
    return;
  }
  const run = () => void register().catch(() => undefined);
  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run, { once: true });
}
