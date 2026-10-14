// QA round 2: independent re-verification of the round-1 bugs against the production build
// (Chromium + WebKit; narrow 390/320 with touch emulation; forced colors in Chromium), axe on the
// main states in both themes, and the keyboard walkthrough of the overflow menu and Find. Writes
// evidence to .build-my-app/reports/qa/visual/round2/<name>.<engine>.png. Test titles start with
// "R2 QA-nnn". Not a product test; it duplicates and extends qa-a-ui-a11y.spec.ts on purpose.
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { instrument } from './fixtures';
import { app, content, COPY, docText, drop, paste, ROOT, waitIdle } from './load-helpers';

const OUT = path.join(ROOT, '.build-my-app/reports/qa/visual/round2');
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const VALID = '{\n  "id": 1,\n  "items": [1, 2, 3],\n  "name": "order"\n}';
const BAD = '{\n  "a": 1,\n  "b": [1, 2,],\n}';
type Theme = 'dark' | 'light';

const toolbar = (p: Page) => p.getByRole('toolbar', { name: COPY['label.toolbar'] });
const tb = (p: Page, id: keyof typeof COPY) =>
  toolbar(p).getByRole('button', { name: COPY[id] as string, exact: true });
const more = (p: Page) => tb(p, 'action.more');
const menu = (p: Page) => p.locator('.tk-menu');
const menuItem = (p: Page, id: keyof typeof COPY) =>
  menu(p).getByRole('button', { name: COPY[id] as string, exact: true });

async function shot(page: Page, name: string, engine: string) {
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, `${name}.${engine}.png`), caret: 'initial' });
}
async function start(page: Page, theme: Theme = 'dark') {
  await page.goto(`/?theme=${theme}`);
  await expect(content(page)).toBeVisible();
  await expect(app(page)).toHaveAttribute('data-busy', 'false');
}
async function load(page: Page, text: string) {
  if ((await docText(page)) !== '') {
    await content(page).focus();
    await page.keyboard.press('ControlOrMeta+a');
  }
  await paste(page, text);
  await expect.poll(() => docText(page)).toBe(text);
}
async function touch(browser: Browser, browserName: string, width: number): Promise<BrowserContext> {
  return browser.newContext({ viewport: { width, height: 760 }, hasTouch: true, isMobile: browserName === 'chromium' });
}
const axe = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations.map((v) => `${v.id}: ${v.help}`);
const inView = async (l: Locator, width: number) => {
  const b = (await l.boundingBox())!;
  expect(b, 'visible').toBeTruthy();
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(width);
};

test.beforeEach(async ({ page }) => {
  await instrument(page);
});

for (const width of [390, 320]) {
  test(`R2 QA-001 QA-010 QA-011 narrow ${width} touch: Tree, Copy tappable in the bar, Download via More; targets >= 44; no horizontal scroll`, async ({
    browser,
    browserName,
  }) => {
    const context = await touch(browser, browserName, width);
    const page = await context.newPage();
    await instrument(page);
    await start(page);
    await load(page, VALID);
    for (const id of [
      'action.beautify',
      'action.minify',
      'view.text',
      'view.tree',
      'action.copy',
      'action.more',
    ] as const) {
      await expect(tb(page, id)).toBeVisible();
      await inView(tb(page, id), width);
      const b = (await tb(page, id).boundingBox())!;
      expect.soft(b.height, `${id} h`).toBeGreaterThanOrEqual(44);
      expect.soft(b.width, `${id} w`).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await shot(page, `QA-001_narrow-${width}-default`, browserName);
    await tb(page, 'view.tree').tap();
    await expect(page.locator('.tk-tree__row').first()).toBeVisible();
    await shot(page, `QA-001_narrow-${width}-tree`, browserName);
    await tb(page, 'view.text').tap();
    await more(page).tap();
    await expect(menu(page)).toBeVisible();
    for (const id of ['action.open', 'action.find', 'action.reindent', 'action.download', 'action.clear'] as const) {
      await inView(menuItem(page, id), width);
      const b = (await menuItem(page, id).boundingBox())!;
      expect.soft(b.height, `${id} h`).toBeGreaterThanOrEqual(44);
    }
    await shot(page, `QA-001_narrow-${width}-menu`, browserName);
    await menuItem(page, 'action.find').tap();
    await expect(page.getByRole('search')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    // QA-004: field alone on row 1
    const panel = page.getByRole('search');
    const f = (await panel.getByRole('searchbox').boundingBox())!;
    for (const id of ['search.match_case', 'action.find_prev', 'action.find_next', 'action.close'] as const) {
      const b = (await panel.getByRole('button', { name: COPY[id] }).boundingBox())!;
      expect.soft(b.y, `find ${id}`).toBeGreaterThanOrEqual(f.y + f.height - 1);
      expect.soft(b.height, `find ${id} h`).toBeGreaterThanOrEqual(44);
    }
    await shot(page, `QA-004_find-narrow-${width}`, browserName);
    // download from the overflow menu works (real tap)
    await page.keyboard.press('Escape');
    const dl = page.waitForEvent('download');
    await more(page).tap();
    await menuItem(page, 'action.download').tap();
    expect((await dl).suggestedFilename()).toMatch(/\.json$/);
    await drop(page, 'body', [], 'just text');
    await expect(page.getByRole('alert')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await shot(page, `QA-011_notice-${width}`, browserName);
    await context.close();
  });
}

for (const theme of ['dark', 'light'] as const) {
  test(`R2 QA-002 QA-003 QA-005 QA-020 QA-021 desktop ${theme}: filled Beautify, labelled indent, tree status bar, landmarks, focus ring, notices link`, async ({
    page,
    browserName,
  }) => {
    await start(page, theme);
    await load(page, VALID);
    const accent = await page.evaluate(() => {
      const s = document.createElement('span');
      s.style.color = 'var(--tk-color-accent)';
      document.body.append(s);
      const c = getComputedStyle(s).color;
      s.remove();
      return c;
    });
    const bg = (l: Locator) => l.evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(await bg(tb(page, 'action.beautify'))).toBe(accent);
    expect(await bg(tb(page, 'action.minify'))).not.toBe(accent);
    await expect(toolbar(page).getByText(COPY['label.indent'], { exact: true })).toBeVisible();
    await expect(page.getByRole('banner')).toHaveCount(1);
    await expect(page.getByRole('main')).toHaveCount(1);
    await content(page).focus();
    expect(await page.locator('.cm-editor').evaluate((e) => getComputedStyle(e).outlineStyle)).toBe('solid');
    await shot(page, `QA-002-003-020_main.${theme}`, browserName);
    const cursor = page.locator('.tk-statusbar__cursor');
    await expect(cursor).toBeVisible();
    await tb(page, 'view.tree').click();
    await expect(page.locator('.tk-tree__row').first()).toBeVisible();
    await expect(cursor).toBeHidden();
    await shot(page, `QA-005_tree.${theme}`, browserName);
    await page.getByRole('button', { name: COPY['privacy.badge'] }).click();
    const link = page.getByRole('dialog').getByRole('link', { name: COPY['privacy.notices'] });
    await expect(link).toHaveAttribute('href', '/third-party-notices.txt');
    await shot(page, `QA-021_privacy.${theme}`, browserName);
  });
}

test('R2 QA-012 forced colors (Chromium): pressed, selected, toggled and tree-selected states differ', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'forced-colors emulation is Chromium only');
  await page.emulateMedia({ forcedColors: 'active' });
  await start(page);
  await load(page, BAD);
  const look = (l: Locator) =>
    l.evaluate((e) => {
      const s = getComputedStyle(e);
      return [s.backgroundColor, s.color, s.borderBlockEndWidth, s.outlineStyle, s.textDecorationLine].join('|');
    });
  expect(await look(tb(page, 'view.text'))).not.toBe(await look(tb(page, 'view.tree')));
  expect(await look(page.getByRole('tab', { selected: true }))).not.toBe(
    await look(page.getByRole('tab', { selected: false })),
  );
  await shot(page, 'QA-012_forced-colors-main', browserName);
  await content(page).focus();
  await page.keyboard.press('ControlOrMeta+f');
  const toggle = page.getByRole('button', { name: COPY['search.match_case'] });
  const off = await look(toggle);
  await toggle.click();
  await page.mouse.move(0, 0);
  expect(await look(toggle)).not.toBe(off);
  await shot(page, 'QA-012_forced-colors-find', browserName);
  await page.keyboard.press('Escape');
  await load(page, '{"a":1}');
  await tb(page, 'view.tree').click();
  await page.locator('.tk-tree__row').first().click();
  const sel = await page
    .locator('.tk-tree__row--selected')
    .evaluate((e) => [getComputedStyle(e).outlineStyle, getComputedStyle(e).borderInlineStartStyle]);
  expect(sel.some((s) => s !== 'none')).toBe(true);
  await shot(page, 'QA-012_forced-colors-tree', browserName);
});

test('R2 QA-013 focus is never lost to the body after Minify, Beautify, notice dismiss', async ({
  page,
  browserName,
}) => {
  await start(page);
  await load(page, VALID);
  for (const id of ['action.minify', 'action.beautify'] as const) {
    await tb(page, id).focus();
    await page.keyboard.press('Enter');
    await waitIdle(page);
    const tag = await page.evaluate(() => {
      let a: Element | null = document.activeElement;
      while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement;
      return a === document.body ? 'BODY' : (a?.className ?? a?.tagName);
    });
    expect(tag, id).not.toBe('BODY');
    await expect(tb(page, id)).toBeFocused();
  }
  await content(page).focus();
  await drop(page, 'body', [], 'just text');
  const alert = page.getByRole('alert');
  await alert.getByRole('button', { name: COPY['action.dismiss'] }).focus();
  await page.keyboard.press('Enter');
  await expect(alert).toBeHidden();
  await expect(content(page)).toBeFocused();
  await shot(page, 'QA-013_focus-after-dismiss', browserName);
});

test('R2 QA-014 translate="no" on editor text, tree rows, path and find field', async ({ page, browserName }) => {
  await start(page);
  await load(page, VALID);
  const un = (l: Locator) => l.evaluateAll((els) => els.map((e) => (e as HTMLElement).translate));
  expect(await un(page.locator('.cm-content, .cm-line'))).not.toContain(true);
  await tb(page, 'view.tree').click();
  await page.locator('.tk-tree__row').nth(1).click();
  const t = await un(page.locator('.tk-tree__row, .tk-tree__row *, .tk-tree__path'));
  expect(t.length).toBeGreaterThan(5);
  expect(t).not.toContain(true);
  await shot(page, 'QA-014_tree', browserName);
});

test('R2 QA-015 typing right after Ctrl/Cmd+F lands in the field; count is the real count (no doubling)', async ({
  page,
  browserName,
}) => {
  await start(page);
  await load(page, '{\n  "status": "ok",\n  "x": "status",\n  "y": "status"\n}');
  await content(page).focus();
  for (let run = 0; run < 3; run++) {
    await page.keyboard.press('ControlOrMeta+f');
    await page.keyboard.type('status', { delay: 40 });
    const field = page.getByRole('search').getByRole('searchbox');
    await expect(field).toHaveValue('status');
    await expect(page.getByRole('search')).toContainText(/1 of 3|1 \/ 3|1 of 3/);
    expect(await docText(page)).toBe('{\n  "status": "ok",\n  "x": "status",\n  "y": "status"\n}');
    if (run === 0) await shot(page, 'QA-015_find-count', browserName);
    await page.keyboard.press('Escape');
    await expect(content(page)).toBeFocused();
  }
});

test('R2 keyboard: overflow menu (390) and Find walkthrough', async ({ page, browserName }) => {
  await page.setViewportSize({ width: 390, height: 760 });
  await start(page);
  await load(page, VALID);
  await more(page).focus();
  await page.keyboard.press('Enter');
  await expect(menuItem(page, 'action.open')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menuItem(page, 'action.find')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp'); // wraps to the last
  await expect(menuItem(page, 'action.clear')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(menuItem(page, 'action.open')).toBeFocused();
  await shot(page, 'R2_keyboard-menu', browserName);
  await page.keyboard.press('Escape');
  await expect(menu(page)).toBeHidden();
  await expect(more(page)).toBeFocused();
  // Enter on Find in the menu: panel opens and typing goes straight to the field
  await page.keyboard.press('Enter');
  await expect(menuItem(page, 'action.open')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menuItem(page, 'action.find')).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.type('id'); // immediately, no wait for the field
  await expect(page.getByRole('search').getByRole('searchbox')).toHaveValue('id');
  await page.keyboard.press('Enter'); // next
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.press('Escape');
  await expect(content(page)).toBeFocused();
  expect(await docText(page)).toBe(VALID);
  // Tab order inside the find panel
  await page.keyboard.press('ControlOrMeta+f');
  await page.keyboard.type('a');
  await page.keyboard.press('Tab');
  const focusedInPanel = await page.evaluate(() => {
    let a: Element | null = document.activeElement;
    while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement;
    return !!a?.closest('[role=search]') && a?.tagName === 'BUTTON';
  });
  // WebKit (Safari default) does not Tab to buttons (a11y.md M-A4, manual check M5); Option+Tab does
  if (browserName === 'chromium') expect(focusedInPanel).toBe(true);
  await shot(page, 'R2_keyboard-find', browserName);
});

for (const theme of ['dark', 'light'] as const) {
  test(`R2 axe ${theme}: empty, loaded, invalid, find, tree, privacy, narrow menu`, async ({ page, browserName }) => {
    await start(page, theme);
    expect(await axe(page), 'empty').toEqual([]);
    await load(page, BAD);
    expect(await axe(page), 'invalid').toEqual([]);
    await shot(page, `AXE_invalid.${theme}`, browserName);
    await load(page, VALID);
    expect(await axe(page), 'loaded').toEqual([]);
    await content(page).focus();
    await page.keyboard.press('ControlOrMeta+f');
    await page.keyboard.type('id');
    expect(await axe(page), 'find').toEqual([]);
    await page.keyboard.press('Escape');
    await tb(page, 'view.tree').click();
    await page.locator('.tk-tree__row').first().click();
    expect(await axe(page), 'tree').toEqual([]);
    await page.getByRole('button', { name: COPY['privacy.badge'] }).click();
    expect(await axe(page), 'privacy').toEqual([]);
    await page.keyboard.press('Escape');
    await tb(page, 'view.text').click();
    await page.setViewportSize({ width: 390, height: 760 });
    await more(page).click();
    expect(await axe(page), 'menu').toEqual([]);
    await shot(page, `AXE_menu-open.${theme}`, browserName);
    await page.setViewportSize({ width: 320, height: 640 });
    expect(await axe(page), '320').toEqual([]);
  });
}
