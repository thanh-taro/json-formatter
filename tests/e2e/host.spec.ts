// F-008 host integration (RULE-16, ADR-0008, ADR-0009, NFR-09): theme, sizing, messages,
// embedding refusal — against the production build and the stub host on a second origin.
import { expect, test, type Frame, type Page } from '@playwright/test';
import { BG, HOST, instrument, TOOL, UNLISTED } from './fixtures';

declare global {
  interface Window {
    __inbound?: { origin: string; data: unknown }[];
    __marker?: string;
    __host?: { received: { origin: string; data: unknown; fromTool: boolean }[] };
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
    .poll(() => tool.evaluate(() => window.__inbound?.filter((m) => m.origin === 'http://localhost:4175').length))
    .toBe(1);
  expect(await themeOf(tool)).toBe('dark');
  // The allowed host still can.
  await page.evaluate(() => window.setTheme?.('light'));
  await expect.poll(() => themeOf(tool)).toBe('light');
});

test('F-008.AC6 F-008.R5 INV-02 the only message to the host is one ready signal, without content', async ({
  page,
}) => {
  const tool = await embed(page, 'theme=dark');
  const frame = page.frameLocator('iframe[name="tool"]');
  // Every M-1 feature available in this build: theme changes, resizing, privacy details.
  await page.evaluate(() => window.setTheme?.('light'));
  await page.evaluate(() => window.setTheme?.('dark'));
  await page.evaluate(() => window.resizeTool?.(390, 760));
  await page.evaluate(() => window.resizeTool?.(1200, 760));
  const badge = frame.getByRole('button', { name: 'Local only' });
  await badge.click();
  await expect(frame.getByRole('dialog')).toBeVisible();
  await frame.getByRole('button', { name: 'Close' }).click();
  await expect(frame.getByRole('dialog')).toBeHidden();
  await tool.evaluate(() => new Promise((r) => setTimeout(r, 1000)));
  expect(await fromTool(page)).toEqual([{ origin: TOOL, data: { type: 'taro:ready' }, fromTool: true }]);
});

test('F-008.AC7 F-008.R6 standalone: the tool works without a host and sends nothing', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Document actions' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open file' })).toBeEnabled();
  await page.getByRole('button', { name: 'Local only' }).click();
  await expect(page.getByRole('dialog')).toContainText('This tool runs entirely in your browser.');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(await page.evaluate(() => window.__inbound)).toEqual([]);
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
});

test('F-008.AC8 NFR-09 a page on an unlisted origin cannot display the tool', async ({ page }) => {
  await page.goto(`${UNLISTED}/host.html?theme=dark`);
  await page.waitForTimeout(1500);
  const tool = page.frame({ name: 'tool' });
  const rendered = tool
    ? await tool.evaluate(() => !!document.querySelector('[data-screen="SCR-Formatter"]')).catch(() => false)
    : false;
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
