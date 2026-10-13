// MOD-Host — the offline kill switch, built to /sw.js instead of `sw.ts` by `SW_KILL=1 pnpm build`
// (MOD-Build). A browser that still runs the offline worker picks it up at its next update check
// (at most ~24 h with `max-age=86400`). It takes over without waiting, deletes the tool's caches
// and unregisters itself. It has no fetch handler, so requests go to the network meanwhile. The
// page never reloads (F-011.R3), and pages of that build register no worker at all.
// Implements: ADR-0012 recovery path (F-011 review 1, security m3).
import { CACHE_PREFIX } from './offline-policy';

interface ExtendableEvent extends Event {
  waitUntil(p: Promise<unknown>): void;
}
interface KillScope {
  readonly registration: { unregister(): Promise<boolean> };
  skipWaiting(): Promise<void>;
  addEventListener(type: 'install' | 'activate', fn: (e: ExtendableEvent) => void): void;
}
const scope = self as unknown as KillScope;

scope.addEventListener('install', (event) => event.waitUntil(scope.skipWaiting()));
scope.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (name.startsWith(CACHE_PREFIX)) await caches.delete(name);
      await scope.registration.unregister();
    })(),
  );
});
