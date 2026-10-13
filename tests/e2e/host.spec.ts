// F-008 host integration (RULE-16, ADR-0008, ADR-0009, NFR-09): theme, sizing, messages,
// embedding refusal — against the production build and the stub host on a second origin.
import { expect, test, type Frame, type Page } from '@playwright/test';
import { ADMIN, BG, HOST, instrument, TOOL, UNLISTED } from './fixtures';
import { expectNoRequestsAfter, logNow } from './network-log';
import { recordClipboard, SECRETS, useEveryM1Feature } from './m1-session';

declare global {
  interface Window {
    __inbound?: { origin: string; data: unknown }[];
    __marker?: string;
    __host?: { received: { origin: string; data: unknown; fromTool: boolean }[]; loads: number };
    setTheme?: (value: unknown) => void;
    postRaw?: (data: unknown) => void;
    resizeTool?: (w: number, h: number) => void;
    fireSibling?: (msg: unknown) => void;
  }
}

test.beforeEach(async ({ page }) => {
  await instrument(page);
  // Every message reaching any frame, so ignored messages can be shown to have arrived.
  await page.addInitScript(() => {
    window.__inbound = [];
    window.addEventListener('message', (e) => window.__inbound?.push({ origin: e.origin, data: e.data }));
  });
});

/** Opens the stub host and returns the tool frame once the tool has rendered and said ready. */
async function embed(page: Page, query: string): Promise<Frame> {
  await page.goto(`${HOST}/host.html?${query}`);
  await expect(
    page.frameLocator('iframe[name="tool"]').getByRole('toolbar', { name: 'Document actions' }),
  ).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__host?.received.filter((m) => m.fromTool).length)).toBe(1);
  const frame = page.frame({ name: 'tool' });
  expect(frame).not.toBeNull();
  return frame!;
}

const themeOf = (f: Frame) => f.evaluate(() => document.documentElement.getAttribute('data-theme'));
const bgOf = (f: Frame) => f.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
const fromTool = (page: Page) => page.evaluate(() => window.__host?.received.filter((m) => m.fromTool));

test.describe('embedded on a light device', () => {
  test.use({ colorScheme: 'light' });
  test('F-008.AC1 dark theme from the address shows from the first frame, no light frame first', async ({ page }) => {
    const tool = await embed(page, 'theme=dark');
    expect(await tool.evaluate(() => window.__firstFrame)).toEqual({ theme: 'dark', bg: BG.dark });
    expect(await themeOf(tool)).toBe('dark');
    expect(await tool.evaluate(() => window.__csp)).toEqual([]);
  });
});

test('F-008.AC2 host switches light to dark: the tool follows without reloading', async ({ page }) => {
  const tool = await embed(page, 'theme=light');
  expect(await themeOf(tool)).toBe('light');
  await tool.evaluate(() => (window.__marker = 'same document'));
  await page.evaluate(() => window.setTheme?.('dark'));
  await expect.poll(() => themeOf(tool)).toBe('dark');
  expect(await bgOf(tool)).toBe(BG.dark);
  await page.evaluate(() => window.setTheme?.('light'));
  await expect.poll(() => themeOf(tool)).toBe('light');
  expect(await bgOf(tool)).toBe(BG.light);
  expect(await tool.evaluate(() => window.__marker)).toBe('same document');
  expect(await tool.evaluate(() => window.__csp)).toEqual([]);
});

test('F-008.AC2 RULE-16 an unknown theme value from the host keeps the current theme', async ({ page }) => {
  const tool = await embed(page, 'theme=dark');
  await page.evaluate(() => {
    window.postRaw?.({ type: 'taro:theme', value: 'sepia' });
    window.postRaw?.({ type: 'taro:theme' });
    window.postRaw?.({ type: 'taro:other', value: 'light' });
    window.postRaw?.('taro:theme light');
  });
  // Four raw messages plus the host's reply to ready, all from the allowed host.
  await expect
    .poll(() => tool.evaluate((host) => window.__inbound?.filter((m) => m.origin === host).length, HOST))
    .toBe(5);
  expect(await themeOf(tool)).toBe('dark');
});

test.describe('embedded without a host theme', () => {
  test.use({ colorScheme: 'light' });
  test('F-008.R2 a host that never sends a theme gets the device preference, followed live', async ({ page }) => {
    const tool = await embed(page, 'theme=none');
    expect(await themeOf(tool)).toBe('light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => themeOf(tool)).toBe('dark');
  });
});

/** Lets the tool frame run a rendering update, where media-query change events are dispatched. */
const nextFrames = (f: Frame) =>
  f.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

test.describe('embedded on a dark device', () => {
  test.use({ colorScheme: 'dark' });
  test('F-008.AC2 F-008.R1 a device change does not override the address or host theme', async ({ page }) => {
    const tool = await embed(page, 'theme=dark');
    // Address wins over the device.
    await page.emulateMedia({ colorScheme: 'light' });
    expect(await tool.evaluate(() => matchMedia('(prefers-color-scheme: light)').matches)).toBe(true);
    await nextFrames(tool);
    expect(await themeOf(tool)).toBe('dark');
    // A host message wins over the device.
    await page.evaluate(() => window.setTheme?.('light'));
    await expect.poll(() => themeOf(tool)).toBe('light');
    await page.emulateMedia({ colorScheme: 'dark' });
    expect(await tool.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)).toBe(true);
    await nextFrames(tool);
    expect(await themeOf(tool)).toBe('light');
  });
});

test.describe('standalone, dark device', () => {
  test.use({ colorScheme: 'dark' });
  test('F-008.AC3 standalone tool shows the dark theme of the device and follows changes', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('toolbar', { name: 'Document actions' })).toBeVisible();
    expect(await page.evaluate(() => window.__firstFrame)).toEqual({ theme: 'dark', bg: BG.dark });
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});

test('F-008.AC4 the tool fills the host area after resizes, with no page scrollbar of its own', async ({ page }) => {
  const tool = await embed(page, 'theme=dark');
  for (const [w, h] of [
    [1200, 760],
    [360, 480],
    [800, 600],
    [1600, 1000],
  ] as const) {
    await page.evaluate((size) => window.resizeTool?.(size.w, size.h), { w, h });
    await expect.poll(() => tool.evaluate(() => [innerWidth, innerHeight])).toEqual([w, h]);
    const m = await tool.evaluate(() => {
      const root = document.documentElement;
      const shell = document.querySelector('[data-screen="SCR-Formatter"]')!.getBoundingClientRect();
      const status = document.querySelector('.tk-statusbar')!.getBoundingClientRect();
      return {
        scroll: [root.scrollWidth - root.clientWidth, root.scrollHeight - root.clientHeight],
        shell: [shell.width, shell.height],
        statusBottom: status.bottom,
      };
    });
    expect(m.scroll, `${w}×${h}`).toEqual([0, 0]);
    expect(m.shell, `${w}×${h}`).toEqual([w, h]);
    expect(m.statusBottom, `${w}×${h}`).toBe(h);
  }
});

test('F-008.AC5 NFR-09 a theme message from an unlisted origin is ignored', async ({ page }) => {
  const tool = await embed(page, 'theme=dark&sibling=1');
  await expect(page.frameLocator('iframe[name="sibling"]').locator('body')).toBeAttached();
  await page.evaluate(() => window.fireSibling?.({ type: 'taro:theme', value: 'light' }));
  await expect
    .poll(() => tool.evaluate((origin) => window.__inbound?.filter((m) => m.origin === origin).length, UNLISTED))
    .toBe(1);
  expect(await themeOf(tool)).toBe('dark');
  // The allowed host still can.
  await page.evaluate(() => window.setTheme?.('light'));
  await expect.poll(() => themeOf(tool)).toBe('light');
});

/** Host-driven features while embedded: theme changes and resizing. */
async function useHostFeatures(page: Page) {
  await page.evaluate(() => window.setTheme?.('light'));
  await page.evaluate(() => window.setTheme?.('dark'));
  await page.evaluate(() => window.resizeTool?.(390, 760));
  await page.evaluate(() => window.resizeTool?.(1200, 760));
  await expect(page.frameLocator('iframe[name="tool"]').getByRole('button', { name: 'Local only' })).toBeVisible();
}

/** Opens the tool standalone and waits until it is idle and the page has loaded. */
async function standalone(page: Page) {
  await page.goto('/?theme=dark');
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect(page.locator('[data-screen="SCR-Formatter"]')).toHaveAttribute('data-busy', 'false');
  await page.waitForLoadState('load');
}

test('F-008.AC6 F-008.R5 INV-02 using every M-1 feature embedded, the only message to the host is one ready signal, without content', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await recordClipboard(page);
  const tool = await embed(page, 'theme=dark');
  await useHostFeatures(page);
  // Every user-facing M-1 feature, each checked to work.
  await useEveryM1Feature(page, tool);
  // Settle: a final host message round trip; anything the tool sent before it has arrived.
  await page.evaluate(() => window.setTheme?.('light'));
  await expect.poll(() => themeOf(tool)).toBe('light');
  const sent = await fromTool(page);
  expect(sent).toEqual([{ origin: TOOL, data: { type: 'taro:ready' }, fromTool: true }]);
  for (const secret of SECRETS) expect(JSON.stringify(sent)).not.toContain(secret);
});

test('F-008.AC7 F-008.R6 standalone: every M-1 feature works without a host, and nothing is sent', async ({ page }) => {
  test.setTimeout(90_000);
  await recordClipboard(page);
  await standalone(page);
  await useEveryM1Feature(page, page);
  expect(await page.evaluate(() => window.__inbound)).toEqual([]);
});

test.describe('NFR-01 a full M-1 session makes no requests after load', () => {
  test.beforeEach(async ({ page, request }) => {
    test.setTimeout(90_000);
    await recordClipboard(page);
    await request.get(`${ADMIN}/reset`);
  });

  test('NFR-01 F-008.AC6 embedded, first visit', async ({ page, request }) => {
    const tool = await embed(page, 'theme=dark');
    await page.waitForLoadState('load');
    const mark = await logNow(request);
    await useHostFeatures(page);
    await useEveryM1Feature(page, tool);
    await expectNoRequestsAfter(request, mark);
  });

  test('NFR-01 F-008.AC7 standalone, first visit', async ({ page, request }) => {
    await standalone(page);
    const mark = await logNow(request);
    await useEveryM1Feature(page, page);
    await expectNoRequestsAfter(request, mark);
  });

  test('NFR-01 F-008.AC7 standalone, returning visit (offline cache in control)', async ({ page, request }) => {
    await standalone(page);
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.ready.then((r) => !!r.active))).toBe(true);
    await standalone(page);
    expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    const mark = await logNow(request);
    await useEveryM1Feature(page, page);
    await expectNoRequestsAfter(request, mark);
  });
});

/** Waits until the stub host's tool frame fired `load` (also for a refused frame). */
async function frameLoaded(page: Page): Promise<boolean> {
  await expect.poll(() => page.evaluate(() => window.__host?.loads ?? 0)).toBeGreaterThanOrEqual(1);
  const tool = page.frame({ name: 'tool' });
  if (!tool) return false;
  return tool.evaluate(() => !!document.querySelector('[data-screen="SCR-Formatter"]')).catch(() => false);
}

test('F-008.AC8 NFR-09 a page on an unlisted origin cannot display the tool', async ({ page, request }) => {
  // Positive control: on the allowed host, the same page shape shows the tool by its load event.
  await page.goto(`${HOST}/host.html?theme=dark`);
  expect(await frameLoaded(page)).toBe(true);

  await request.get(`${ADMIN}/reset`);
  await page.goto(`${UNLISTED}/host.html?theme=dark`);
  const rendered = await frameLoaded(page);
  // The tool document was really served to the unlisted page, and the browser refused it.
  const { log } = (await (await request.get(`${ADMIN}/log`)).json()) as { log: { path: string }[] };
  expect(log.map((e) => e.path)).toContain('/?theme=dark');
  expect(rendered).toBe(false);
  expect(await fromTool(page)).toEqual([]);
});

test('NFR-09 the page is served with frame-ancestors limited to the host and no X-Frame-Options', async ({
  request,
}) => {
  const res = await request.get(`${TOOL}/`);
  const csp = res.headers()['content-security-policy'] ?? '';
  expect(csp).toContain(`frame-ancestors ${HOST}`);
  expect(csp).toContain("connect-src 'none'");
  expect(res.headers()['x-frame-options']).toBeUndefined();
});
