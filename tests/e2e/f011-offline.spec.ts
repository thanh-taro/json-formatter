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
});

const admin = async (request: APIRequestContext, p: string) => (await request.get(`${ADMIN}${p}`)).json();
const serverLog = async (request: APIRequestContext) => (await admin(request, '/log')) as { now: number; log: Entry[] };

/**
 * D-021: the only requests allowed after load are the browser's own fetches of the tool's own
 * files for the offline cache — the worker seeding (a `fetch`, destination "empty", which the
 * page itself cannot make under `connect-src 'none'`) and the worker-script update check.
 */
const allowedWorkerFetch = (e: Entry) =>
  e.method === 'GET' &&
  ((e.path === '/sw.js' && e.sw === 'script') ||
    (e.dest === 'empty' && (/^\/(\?theme=(dark|light))?$/.test(e.path) || /^\/assets\/[\w.-]+$/.test(e.path))));

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

/** Waits until the worker has stored the page and every build chunk (the seed finished). */
async function seeded(s: Scope) {
  await expect
    .poll(
      () =>
        s.evaluate(async () => {
          const meta = document.querySelector('meta[name="tk-chunks"]')?.getAttribute('content') ?? '';
          const want = ['/', ...meta.split(/\s+/).filter(Boolean)];
          const have = new Set<string>();
          for (const name of await caches.keys()) {
            for (const r of await (await caches.open(name)).keys()) have.add(new URL(r.url).pathname);
          }
          return want.filter((w) => !have.has(w));
        }),
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
});
