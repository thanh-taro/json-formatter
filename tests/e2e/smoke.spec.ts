// E2E smoke for the SCR-Formatter shell: renders, passes axe, no CSP violations, theme boot.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { BG, HOST, instrument } from './fixtures';
import { recordClipboard, useEveryM1Feature } from './m1-session';

test.beforeEach(async ({ page }) => instrument(page));

for (const theme of ['dark', 'light'] as const) {
  test(`smoke: SCR-Formatter shell renders with no CSP violations and no axe violations (${theme})`, async ({
    page,
  }) => {
    await page.goto(`/?theme=${theme}`);
    await expect(page.getByRole('toolbar', { name: 'Document actions' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'JSON document' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Empty');
    await expect(page.getByRole('toolbar').getByRole('button', { name: 'Open file' })).toBeEnabled();
    await expect(page.getByRole('toolbar').getByRole('button', { name: 'Beautify' })).toBeDisabled();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    expect(await page.evaluate(() => window.__csp)).toEqual([]);
  });
}

test('F-008.AC1 theme from the address is shown from the first frame when embedded', async ({ page }) => {
  await page.goto(`${HOST}/host.html?theme=light`);
  const frame = page.frameLocator('iframe[name="tool"]');
  await expect(frame.getByRole('toolbar', { name: 'Document actions' })).toBeVisible();
  const tool = page.frame({ name: 'tool' });
  expect(tool).not.toBeNull();
  const first = await tool!.evaluate(() => window.__firstFrame);
  expect(first).toEqual({ theme: 'light', bg: BG.light });
  expect(await tool!.evaluate(() => window.__csp)).toEqual([]);
});

test.describe('standalone, dark device', () => {
  test.use({ colorScheme: 'dark' });
  test('F-008.AC3 standalone tool follows the dark device preference', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('toolbar', { name: 'Document actions' })).toBeVisible();
    expect(await page.evaluate(() => window.__firstFrame)).toEqual({ theme: 'dark', bg: BG.dark });
  });
});

test('smoke: F-008.AC6 F-008.AC7 one session uses every M-1 feature, standalone and embedded', async ({ page }) => {
  test.setTimeout(120_000);
  await recordClipboard(page);
  await page.goto('/?theme=dark');
  await expect(page.locator('[data-screen="SCR-Formatter"]')).toHaveAttribute('data-busy', 'false');
  await useEveryM1Feature(page, page);
  await page.goto(`${HOST}/host.html?theme=light`);
  const frame = page.frameLocator('iframe[name="tool"]');
  await expect(frame.locator('[data-screen="SCR-Formatter"]')).toHaveAttribute('data-busy', 'false');
  await useEveryM1Feature(page, page.frame({ name: 'tool' })!);
});
