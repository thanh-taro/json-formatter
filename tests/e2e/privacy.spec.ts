// F-009 privacy statement in CMP-StatusBar: badge always visible, dismissible details popover,
// icon-only at narrow widths.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { HOST, instrument } from './fixtures';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const DETAILS =
  'This tool runs entirely in your browser. Your JSON is never uploaded, logged, or stored, and the tool sends no analytics. Closing the page discards it.';

test.beforeEach(async ({ page }) => instrument(page));

test('F-009.AC1 the status area shows the privacy badge (standalone)', async ({ page }) => {
  await page.goto('/');
  const status = page.getByRole('contentinfo');
  await expect(status.getByRole('button', { name: 'Local only' })).toBeVisible();
  await expect(status.getByText('Local only', { exact: true })).toBeVisible();
});

test('F-009.AC1 the status area shows the privacy badge (embedded)', async ({ page }) => {
  await page.goto(`${HOST}/host.html?theme=light`);
  const frame = page.frameLocator('iframe[name="tool"]');
  await expect(frame.getByRole('contentinfo').getByRole('button', { name: 'Local only' })).toBeVisible();
});

for (const theme of ['dark', 'light'] as const) {
  test(`F-009.AC2 activating the badge shows the details, which can be dismissed (${theme})`, async ({ page }) => {
    await page.goto(`/?theme=${theme}`);
    const badge = page.getByRole('button', { name: 'Local only' });
    await expect(badge).toHaveAttribute('aria-expanded', 'false');
    await badge.click();
    const dialog = page.getByRole('dialog', { name: 'Your data stays in this browser' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(DETAILS);
    await expect(badge).toHaveAttribute('aria-expanded', 'true');
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    // Dismiss with the close button…
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
    await expect(badge).toHaveAttribute('aria-expanded', 'false');
    // …with Escape, from the keyboard…
    await badge.focus();
    await page.keyboard.press('Enter');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(badge).toBeFocused();
    // …and by activating the badge again or clicking elsewhere.
    await badge.click();
    await expect(dialog).toBeVisible();
    await badge.click();
    await expect(dialog).toBeHidden();
    await badge.click();
    await page.getByRole('region', { name: 'JSON document' }).click();
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => window.__csp)).toEqual([]);
  });
}

test.describe('narrow', () => {
  test.use({ viewport: { width: 390, height: 760 } });
  test('F-009.AC1 F-009.AC2 at narrow widths the badge is an icon named COPY-privacy.badge_label', async ({ page }) => {
    await page.goto('/?theme=dark');
    const badge = page.getByRole('button', { name: 'Your data stays in this browser' });
    await expect(badge).toBeVisible();
    await expect(page.getByText('Local only', { exact: true })).toBeHidden();
    const box = (await badge.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(24);
    expect(box.height).toBeGreaterThanOrEqual(24);
    await badge.click();
    const dialog = page.getByRole('dialog', { name: 'Your data stays in this browser' });
    await expect(dialog).toContainText(DETAILS);
    const d = (await dialog.boundingBox())!;
    expect(d.x).toBeGreaterThanOrEqual(0);
    expect(d.x + d.width).toBeLessThanOrEqual(390);
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});
