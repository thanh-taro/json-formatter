// F-011 Work offline — end to end on the production build with the ADR-0012 service worker.
// Offline is emulated by refusing connections at the e2e server (`/offline`), not with
// Playwright's `setOffline` (on WebKit it also blocks the worker's cache responses, SP-iframe).
// Requests are measured with the server-side request log (NFR-01, D-021).
import { expect, test, type APIRequestContext, type Frame, type Page } from '@playwright/test';
import { ADMIN, HOST, instrument } from './fixtures';
import { COPY, reportShot } from './load-helpers';

type Scope = Page | Frame;
interface Entry {
  t: number;
  method: string;
  path: string;
  dest: string | null;
  sw: string | null;
}

test.beforeEach(async ({ page, request }) => {
  await instrument(page);
  await request.get(`${ADMIN}/reset`);
});
test.afterEach(async ({ request }) => {
  await request.get(`${ADMIN}/offline?on=0`);
  await request.get(`${ADMIN}/publish?on=0`);
  await request.get(`${ADMIN}/sw-expired?on=0`);
});

const admin = async (request: APIRequestContext, p: string) => (await request.get(`${ADMIN}${p}`)).json();
const serverLog = async (request: APIRequestContext) => (await admin(request, '/log')) as { now: number; log: Entry[] };

/**
 * D-021: the only requests allowed after load are the browser's own fetches of the tool's own
 * files for the offline cache — the worker seeding (a `fetch`, destination "empty", which the
 * page itself cannot make under `connect-src 'none'`) and the worker-script update check.
 */
/** The page as the worker seeds it: its query only `theme` and/or `lang` (ADR-0014 §8). */
const PAGE_SEED = /^\/(\?(theme=(dark|light)|lang=[A-Za-z_-]+)(&(theme=(dark|light)|lang=[A-Za-z_-]+))?)?$/;

const allowedWorkerFetch = (e: Entry) =>
  e.method === 'GET' &&
  ((e.path === '/sw.js' && e.sw === 'script') ||
    (e.dest === 'empty' && (PAGE_SEED.test(e.path) || /^\/assets\/[\w.-]+$/.test(e.path))));

const app = (s: Scope) => s.locator('[data-screen="SCR-Formatter"]');
const validity = (s: Scope) => s.locator('.tk-statusbar__validity');
const button = (s: Scope, name: string) => s.getByRole('toolbar').getByRole('button', { name, exact: true });
const lines = async (s: Scope) => (await s.locator('.cm-line').allTextContents()).join('\n');

async function opened(s: Scope) {
  await expect(s.locator('.cm-content')).toBeVisible();
  await expect(app(s)).toHaveAttribute('data-busy', 'false');
}

async function paste(s: Scope, text: string) {
  await s.locator('.cm-content').evaluate((el, value) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', value);
    el.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true, composed: true }),
    );
  }, text);
}

/** The one cache of ADR-0012 (MOD-Host `CACHE_NAME`). */
const CACHE = 'json-formatter-v1';

/**
 * Waits until the worker has stored, in the one cache, every build chunk of this document and
 * then this very page (the seed finished; the page is stored last).
 */
async function seeded(s: Scope) {
  await expect
    .poll(
      () =>
        s.evaluate(async (name) => {
          const meta = document.querySelector('meta[name="tk-chunks"]')?.getAttribute('content') ?? '';
          const cache = await caches.open(name);
          const have = new Set((await cache.keys()).map((r) => new URL(r.url).pathname));
          const missing = meta.split(/\s+/).filter((w) => w && !have.has(w));
          const page = await (await cache.match('/'))?.text();
          if (!page?.includes(meta)) missing.push('/ (this version)');
          return missing;
        }, CACHE),
      { timeout: 15_000 },
    )
    .toEqual([]);
}

/** Paste, beautify and validate (F-011.AC1), plus minify — the M-1 core loop. */
async function useTheTool(s: Scope) {
  await paste(s, '{"a":[1,2],"b":{"c":true}}');
  await expect(validity(s)).toHaveAttribute('data-validity', 'valid');
  await expect(validity(s)).toContainText(COPY['status.valid']);
  await button(s, COPY['action.beautify']).click();
  await expect(app(s)).toHaveAttribute('data-busy', 'false');
  await expect.poll(() => lines(s)).toBe('{\n  "a": [\n    1,\n    2\n  ],\n  "b": {\n    "c": true\n  }\n}');
  await button(s, COPY['action.minify']).click();
  await expect.poll(() => lines(s)).toBe('{"a":[1,2],"b":{"c":true}}');
  await s.locator('.cm-content').press('End');
  await s.locator('.cm-content').pressSequentially(',');
  await expect(validity(s)).toHaveAttribute('data-validity', 'invalid');
  await expect(validity(s)).toContainText(COPY['status.invalid']);
}

test.describe('F-011 offline', () => {
  test('F-011.AC1 after one online visit the tool opens with no connection and works (standalone)', async ({
    page,
    request,
  }) => {
    await page.goto('/?theme=dark');
    await opened(page);
    await seeded(page);

    await admin(request, '/offline?on=1');
    await page.goto('/?theme=light');
    await opened(page);
    // The connection really was refused: the page came from the offline cache.
    const { log } = await serverLog(request);
    expect(log.map((e) => e.path)).toContain('/?theme=light');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await useTheTool(page);
    expect(await page.evaluate(() => window.__csp)).toEqual([]);
    await reportShot(page, 'F-011-offline-standalone.png');
  });

  test('F-011.AC1 after one online visit the tool opens with no connection and works (embedded)', async ({
    page,
    request,
  }) => {
    await page.goto(`${HOST}/host.html?theme=dark`);
    let frame = page.frame({ name: 'tool' })!;
    await opened(frame);
    await seeded(frame);

    // The portal page stays reachable; only the tool's origin refuses connections.
    await admin(request, '/offline?on=1');
    await page.reload();
    frame = page.frame({ name: 'tool' })!;
    await opened(frame);
    const { log } = await serverLog(request);
    expect(log.map((e) => e.path).filter((p) => p === '/?theme=dark').length).toBeGreaterThanOrEqual(2);
    await useTheTool(frame);
    // The host integration still works offline: the ready signal reached the portal.
    expect(
      await page.evaluate(() =>
        (window as unknown as { __host: { received: { data: { type?: string } }[] } }).__host.received.map(
          (m) => m.data.type,
        ),
      ),
    ).toContain('taro:ready');
    await reportShot(page, 'F-011-offline-embedded.png');
  });

  test('F-011.AC2 NFR-01 a whole session makes no requests after the page finished opening', async ({
    page,
    request,
    browserName,
  }) => {
    const afterLoad: Entry[] = [];
    // First opening (registers the worker and seeds it).
    await page.goto('/?theme=dark');
    await opened(page);
    await seeded(page);
    let mark = (await serverLog(request)).now;
    await useTheTool(page);
    await page.waitForTimeout(3000);
    afterLoad.push(...(await serverLog(request)).log.filter((e) => e.t > mark));

    // Second opening (controlled by the worker; the browser checks /sw.js after load).
    await page.goto('/?theme=dark');
    await opened(page);
    await page.waitForLoadState('load');
    mark = (await serverLog(request)).now;
    await useTheTool(page);
    await page.waitForTimeout(3000);
    afterLoad.push(...(await serverLog(request)).log.filter((e) => e.t > mark));

    test.info().annotations.push({
      type: 'requests after load',
      description: JSON.stringify(afterLoad.map((e) => `${e.method} ${e.path} dest=${e.dest} sw=${e.sw}`)),
    });
    if (browserName === 'webkit') {
      // WebKit ignores updateViaCache and its worker fetch skips the page's HTTP cache (ADR-0012):
      // only the D-021 exception is allowed.
      expect(afterLoad.filter((e) => !allowedWorkerFetch(e))).toEqual([]);
    } else {
      expect(afterLoad).toEqual([]);
    }
  });

  test('F-011.AC3 a new version never reloads the open session and is used from the next opening', async ({
    page,
    context,
    request,
  }) => {
    await page.goto('/?theme=dark');
    await opened(page);
    await seeded(page);
    await paste(page, '{"keep": "me"}');
    await expect(validity(page)).toHaveAttribute('data-validity', 'valid');
    await page.evaluate(() => ((window as unknown as { __session: string }).__session = 'open'));

    await admin(request, '/publish?on=1');
    await page.waitForTimeout(3000);
    // Nothing reloaded: same document, same content, still the old version.
    expect(await page.evaluate(() => (window as unknown as { __session?: string }).__session)).toBe('open');
    expect(await lines(page)).toBe('{"keep": "me"}');
    await expect(page.locator('meta[name="tk-test-version"]')).toHaveCount(0);

    // Opened again online: the new version is used.
    const next = await context.newPage();
    await instrument(next);
    await next.goto('/');
    await opened(next);
    await expect(next.locator('meta[name="tk-test-version"]')).toHaveAttribute('content', '2');
    const { log } = await serverLog(request);
    expect(log.some((e) => e.path.startsWith('/assets/v2-'))).toBe(true);
    await useTheTool(next);

    // Still no reload of the session that was open, and the new version also works offline.
    expect(await page.evaluate(() => (window as unknown as { __session?: string }).__session)).toBe('open');
    await seeded(next);
    await admin(request, '/offline?on=1');
    await next.goto('/?theme=light');
    await opened(next);
    await expect(next.locator('meta[name="tk-test-version"]')).toHaveAttribute('content', '2');
    await useTheTool(next);
  });

  test('F-011.AC3 F-011.AC1 after a deploy with a changed /sw.js and new asset hashes, one online opening makes the new version work offline', async ({
    playwright,
    browserName,
    request,
  }, info) => {
    // A persistent profile: WebKit's ephemeral contexts lose Cache Storage when a worker is
    // replaced, which no real browser profile does.
    const context = await playwright[browserName].launchPersistentContext(info.outputPath('profile'), {
      baseURL: test.info().project.use.baseURL!,
    });
    await admin(request, '/sw-expired?on=1');
    const first = await context.newPage();
    await first.goto('/?theme=dark');
    await opened(first);
    await seeded(first);

    await admin(request, '/publish?on=1');
    const mark = (await serverLog(request)).now;
    const second = await context.newPage();
    await second.goto('/?theme=dark');
    await opened(second);
    await expect(second.locator('meta[name="tk-test-version"]')).toHaveAttribute('content', '2');
    await seeded(second);
    // The browser's update check installs the changed worker; it waits while sessions are open.
    await expect
      .poll(
        () =>
          second.evaluate(async () => {
            const reg = await navigator.serviceWorker.getRegistration();
            await reg?.update().catch(() => undefined);
            return !!reg?.waiting;
          }),
        { timeout: 15_000 },
      )
      .toBe(true);
    const { log } = await serverLog(request);
    expect(log.some((e) => e.t > mark && e.path === '/sw.js')).toBe(true);
    // Every session closes, so the new worker takes over; then the connection is gone.
    await first.close();
    await second.close();
    await admin(request, '/offline?on=1');
    const third = await context.newPage();
    await third.goto('/?theme=light');
    await opened(third);
    await expect(third.locator('meta[name="tk-test-version"]')).toHaveAttribute('content', '2');
    await expect
      .poll(() =>
        third.evaluate(async () => {
          const reg = await navigator.serviceWorker.getRegistration();
          return {
            active: reg?.active?.state ?? null,
            waiting: !!reg?.waiting,
            controlled: !!navigator.serviceWorker.controller,
          };
        }),
      )
      .toEqual({ active: 'activated', waiting: false, controlled: true });
    // The page and all its assets loaded: styles, fonts, and the worker chunk (the tool works).
    expect(
      await third.evaluate(async () => {
        await document.fonts.ready;
        return [...document.fonts].filter((f) => f.status === 'error').length;
      }),
    ).toBe(0);
    await expect(third.locator('.tk-statusbar')).toBeVisible();
    await useTheTool(third);
    await context.close();
  });

  test('F-011.AC1 a newer page in the HTTP cache whose assets were never loaded does not replace the stored page', async ({
    page,
    request,
  }) => {
    await page.goto('/?theme=dark');
    await opened(page);
    await seeded(page);
    // A new version is published; this session asks the worker to seed an address it never
    // loaded, so the page fetched for seeding is the new HTML whose assets are not cached.
    await admin(request, '/publish?on=1');
    const mark = (await serverLog(request)).now;
    await page.evaluate(async () =>
      (await navigator.serviceWorker.ready).active?.postMessage({ type: 'seed', urls: ['/?theme=light'] }),
    );
    await expect
      .poll(async () => (await serverLog(request)).log.some((e) => e.t > mark && e.path === '/?theme=light'))
      .toBe(true);
    await page.waitForTimeout(500);
    const storedPage = await page.evaluate(async (name) => (await (await caches.open(name)).match('/'))?.text(), CACHE);
    expect(storedPage).toBeTruthy();
    expect(storedPage).not.toContain('tk-test-version');
    // Offline, the stored (loaded) version opens complete and works.
    await admin(request, '/offline?on=1');
    await page.goto('/?theme=dark');
    await opened(page);
    await expect(page.locator('meta[name="tk-test-version"]')).toHaveCount(0);
    await useTheTool(page);
  });
});
