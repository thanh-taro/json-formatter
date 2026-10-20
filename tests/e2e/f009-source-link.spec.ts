// F-009.R3 source link in CMP-StatusBar (D-033): always visible, icon only, named
// COPY-privacy.source_label, opens the source repository in a new tab without a referrer and
// leaves the document alone. GitHub is never contacted: the new tab's request is stubbed.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { HOST, instrument } from './fixtures';
import { content, COPY, docText, paste } from './load-helpers';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const LABEL = COPY['privacy.source_label'];
/** F-009.R3: the address is part of the requirement, so the test states it. */
const SOURCE_URL = 'https://github.com/thanh-taro/json-formatter';

test.beforeEach(async ({ page }) => instrument(page));

/** The link is inside the status bar, after the privacy statement, and the bar does not scroll. */
async function expectSourceLink(page: Page) {
  const status = page.getByRole('contentinfo');
  const link = status.getByRole('link', { name: LABEL });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', SOURCE_URL);
  await expect(link).toHaveAttribute('title', LABEL);
  const badge = (await status
    .getByRole('button', { name: COPY['privacy.badge_label'] })
    .or(status.getByRole('button', { name: COPY['privacy.badge'] }))
    .boundingBox())!;
  const box = (await link.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(badge.x + badge.width - 1);
  expect(box.width).toBeGreaterThanOrEqual(24);
  expect(box.height).toBeGreaterThanOrEqual(24);
  const overflow = await page.locator('.tk-statusbar').evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test('F-009.AC3 the status area shows the source link (standalone, desktop width)', async ({ page }) => {
  await page.goto('/');
  await expectSourceLink(page);
  // D-035: the GitHub mark is followed by COPY-privacy.source.
  await expect(page.getByRole('contentinfo').getByText(COPY['privacy.source'], { exact: true })).toBeVisible();
});

test('F-009.AC3 the status area shows the source link (embedded)', async ({ page }) => {
  await page.goto(`${HOST}/host.html?theme=light`);
  const frame = page.frameLocator('iframe[name="tool"]');
  const link = frame.getByRole('contentinfo').getByRole('link', { name: LABEL });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', SOURCE_URL);
});

test.describe('narrow', () => {
  test.use({ viewport: { width: 320, height: 640 } });
  test('F-009.AC3 at 320 px the source link stays visible next to the privacy icon', async ({ page }) => {
    await page.goto('/?theme=dark');
    await paste(page, '{"a":1,"b":[1,2]}');
    await expectSourceLink(page);
    // Narrow: the link shortens to its mark, still named COPY-privacy.source_label.
    await expect(page.getByRole('contentinfo').getByText(COPY['privacy.source'], { exact: true })).toBeHidden();
    const results = await new AxeBuilder({ page }).include('.tk-statusbar').withTags(AXE_TAGS).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});

test('F-009.AC4 the source link opens the repository in a new tab, without referrer, document unchanged', async ({
  page,
  context,
}) => {
  await context.route(`${SOURCE_URL}**`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>repo</title>' }),
  );
  await page.goto('/');
  await paste(page, '{"a":1}');
  await expect.poll(() => docText(page)).toBe('{"a":1}');

  const popup = page.waitForEvent('popup');
  await page.getByRole('contentinfo').getByRole('link', { name: LABEL }).click();
  const tab = await popup;
  await tab.waitForLoadState();
  expect(tab.url()).toBe(SOURCE_URL);
  expect(await tab.evaluate(() => ({ referrer: document.referrer, opener: window.opener === null }))).toEqual({
    referrer: '',
    opener: true,
  });
  await tab.close();

  // The tool is where the user left it: same document, and the paste is still the step undo reverts.
  expect(page.url()).not.toContain('github.com');
  expect(await docText(page)).toBe('{"a":1}');
  await content(page).focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => docText(page)).toBe('');
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
});
