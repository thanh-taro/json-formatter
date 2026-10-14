// QA fix group A (UI and accessibility), end to end on the production build (ADR-0010):
// QA-001 CMP-Toolbar narrow overflow menu (COPY-action.more), QA-010 coarse-pointer targets
// (size.touchTarget), QA-011 reflow at size.minWidth (NFR-07, D-029), QA-012 forced colors,
// QA-013 focus return, QA-002..005 design conformance, QA-020 a11y minors, QA-021 notices link.
// Clipping is checked with bounding boxes against the viewport, never through Playwright's
// scroll-into-view (QA-001: clipped controls passed before because clicks scrolled them in).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { instrument } from './fixtures';
import {
  app,
  content,
  COPY,
  docText,
  drop,
  largeFixture,
  openFile,
  paste,
  reportShot,
  seamWorker,
  waitIdle,
} from './load-helpers';

const MB = 1_000_000;
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const shot = (page: Page, name: string) => reportShot(page, `../qa/fixes/A/${name}`);

const toolbar = (page: Page) => page.getByRole('toolbar', { name: COPY['label.toolbar'] });
const tbButton = (page: Page, id: keyof typeof COPY) =>
  toolbar(page).getByRole('button', { name: COPY[id] as string, exact: true });
const more = (page: Page) => tbButton(page, 'action.more');
const menu = (page: Page) => page.locator('.tk-menu');
const menuItem = (page: Page, id: keyof typeof COPY) =>
  menu(page).getByRole('button', { name: COPY[id] as string, exact: true });
const VALID = '{\n  "id": 1,\n  "items": [1, 2, 3],\n  "name": "order"\n}';

async function start(page: Page, theme: 'dark' | 'light' = 'dark') {
  await page.goto(`/?theme=${theme}`);
  await expect(content(page)).toBeVisible();
  await expect(app(page)).toHaveAttribute('data-busy', 'false');
}

async function load(page: Page, text: string) {
  await paste(page, text);
  await expect.poll(() => docText(page)).toBe(text);
}

async function coarse(browser: Browser, browserName: string, width: number, height = 760): Promise<BrowserContext> {
  return browser.newContext({
    viewport: { width, height },
    hasTouch: true,
    isMobile: browserName === 'chromium',
  });
}

/** Every visible control of `scope` lies inside [0, width] horizontally (no clipping, no scrolling). */
async function expectInside(scope: Locator, width: number) {
  const boxes = await scope.evaluateAll((els) =>
    els
      .filter((e) => (e as HTMLElement).offsetParent !== null || getComputedStyle(e).position === 'fixed')
      .map((e) => {
        const r = e.getBoundingClientRect();
        // a control clipped by an `overflow: hidden` ancestor is not visible either
        let clipped = false;
        for (let p = e.parentElement; p; p = p.parentElement) {
          const s = getComputedStyle(p);
          if (s.overflowX === 'visible') continue;
          const pr = p.getBoundingClientRect();
          if (r.left < pr.left - 0.5 || r.right > pr.right + 0.5) clipped = true;
        }
        return {
          name: e.getAttribute('aria-label') ?? e.textContent?.trim() ?? '',
          left: r.left,
          right: r.right,
          clipped,
        };
      }),
  );
  expect(boxes.length).toBeGreaterThan(0);
  for (const b of boxes) {
    expect.soft(b.left, `${b.name} left`).toBeGreaterThanOrEqual(0);
    expect.soft(b.right, `${b.name} right`).toBeLessThanOrEqual(width);
    expect.soft(b.clipped, `${b.name} clipped`).toBe(false);
  }
}

async function noHorizontalScroll(page: Page) {
  const { scroll, inner } = await page.evaluate(() => ({
    scroll: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    inner: window.innerWidth,
  }));
  expect(scroll).toBeLessThanOrEqual(inner);
}

test.beforeEach(async ({ page }) => {
  await instrument(page);
});

// ---- QA-001 ------------------------------------------------------------------------------------

test.describe('QA-001 CMP-Toolbar narrow', () => {
  for (const width of [390, 320]) {
    test(`QA-001 CMP-Toolbar NFR-07 narrow ${width} coarse: no control is clipped and every action is reachable through COPY-action.more`, async ({
      browser,
      browserName,
    }) => {
      test.skip(browserName === 'firefox', 'Firefox has no mobile emulation');
      const context = await coarse(browser, browserName, width);
      const page = await context.newPage();
      await instrument(page);
      await start(page);
      await load(page, VALID);
      // the bar: Beautify, Minify, Text | Tree, Copy, More actions (design SCR-Formatter narrow)
      for (const id of ['action.beautify', 'action.minify', 'view.text', 'view.tree', 'action.more'] as const)
        await expect(tbButton(page, id)).toBeVisible();
      await expectInside(toolbar(page).locator('button, select, input'), width);
      const scroll = await toolbar(page).evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(scroll).toBeLessThanOrEqual(0);
      await noHorizontalScroll(page);
      // the overflow menu holds the rest
      await expect(more(page)).toHaveAttribute('aria-expanded', 'false');
      await more(page).click();
      await expect(more(page)).toHaveAttribute('aria-expanded', 'true');
      await expect(menu(page)).toBeVisible();
      for (const id of ['action.open', 'action.find', 'action.reindent', 'action.download', 'action.clear'] as const)
        await expect(menuItem(page, id)).toBeVisible();
      await expect(menu(page).getByRole('combobox', { name: COPY['label.indent'] })).toBeVisible();
      await expectInside(menu(page).locator('button, select'), width);
      await shot(page, `QA-001_menu-open_${width}.png`);
      // an action from the menu runs and closes the menu
      await menuItem(page, 'action.find').click();
      await expect(menu(page)).toBeHidden();
      await expect(page.getByRole('search')).toBeVisible();
      await shot(page, `QA-001_find-open_${width}.png`);
      expect(await page.evaluate(() => window.__csp)).toEqual([]);
      await context.close();
    });
  }

  test('QA-001 CMP-Toolbar keyboard: the menu opens with ArrowDown, arrows move, Escape returns to More actions', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 760 });
    await start(page);
    await load(page, VALID);
    await more(page).focus();
    await page.keyboard.press('ArrowDown');
    await expect(menuItem(page, 'action.open')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menuItem(page, 'action.find')).toBeFocused();
    await page.keyboard.press('End');
    await expect(menuItem(page, 'action.clear')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menuItem(page, 'action.open')).toBeFocused();
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(menu(page)).toBeHidden();
    await expect(more(page)).toBeFocused();
    // Enter opens the menu on its first item; the arrows pass the indent selector; Enter on an
    // item runs it and focus goes back to the menu button
    await page.keyboard.press('Enter');
    await expect(menuItem(page, 'action.open')).toBeFocused();
    await page.keyboard.press('ArrowDown'); // find
    await page.keyboard.press('ArrowDown'); // re-indent
    await page.keyboard.press('ArrowDown'); // indent selector
    await expect(menu(page).getByRole('combobox', { name: COPY['label.indent'] })).toBeFocused();
    await page.keyboard.press('ArrowDown'); // download
    await expect(menuItem(page, 'action.download')).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(menuItem(page, 'action.reindent')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(menu(page)).toBeHidden();
    await waitIdle(page);
    // F-004: after re-indenting, the editor has focus (never the page)
    await expect(content(page)).toBeFocused();
  });

  for (const width of [1280, 1000, 800, 640]) {
    test(`QA-001 CMP-Toolbar at ${width} px no toolbar control is clipped`, async ({ page }) => {
      await page.setViewportSize({ width, height: 700 });
      await start(page);
      await load(page, VALID);
      await expectInside(toolbar(page).locator('button, select, input'), width);
      if (width === 1280) await expect(more(page)).toHaveCount(0);
    });
  }
});

// ---- QA-010 ------------------------------------------------------------------------------------

test('QA-010 NFR-06 CMP-Toolbar CMP-Notice CMP-Editor coarse pointer: every target is at least size.touchTarget (44 px)', async ({
  browser,
  browserName,
}) => {
  test.skip(browserName === 'firefox', 'Firefox has no mobile emulation');
  const context = await coarse(browser, browserName, 390);
  const page = await context.newPage();
  await instrument(page);
  await start(page);
  const big = async (l: Locator, what: string) => {
    const b = (await l.boundingBox())!;
    expect.soft(b.height, `${what} height`).toBeGreaterThanOrEqual(44);
    expect.soft(b.width, `${what} width`).toBeGreaterThanOrEqual(44);
  };
  await big(page.locator('.tk-editor__empty').getByRole('button', { name: COPY['action.open'] }), 'empty open');
  await load(page, '{"a":1,}');
  for (const b of await toolbar(page).locator('button:visible, .tk-select:visible').all())
    await big(b, 'toolbar control');
  await big(page.getByRole('button', { name: COPY['action.collapse_issues'] }), 'hide issues');
  await more(page).click();
  for (const b of await menu(page).locator('button:visible, .tk-select:visible').all()) await big(b, 'menu item');
  await page.keyboard.press('Escape');
  await drop(page, 'body', [], 'just text');
  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible();
  await big(alert.getByRole('button', { name: COPY['action.dismiss'] }), 'dismiss');
  await big(alert.getByRole('button', { name: COPY['action.open'] }), 'notice open');
  await shot(page, 'QA-010_coarse-notice.png');
  await context.close();
});

// ---- QA-011 ------------------------------------------------------------------------------------

for (const [width, height] of [
  [320, 256],
  [320, 640],
  [640, 512],
] as const) {
  test(`QA-011 NFR-07 NFR-06 at ${width}x${height} CSS px nothing scrolls horizontally (WCAG reflow)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await start(page);
    await noHorizontalScroll(page);
    await load(page, '{\n  "a": 1,\n  "b": [1, 2,],\n  "long": "' + 'x'.repeat(300) + '"\n}');
    await expect(page.getByRole('region', { name: COPY['label.issues'] })).toBeVisible();
    await noHorizontalScroll(page);
    await expectInside(page.locator('.tk-formatter button:visible, .tk-formatter select:visible'), width);
    await content(page).focus();
    await page.keyboard.press('ControlOrMeta+f');
    await page.getByRole('searchbox').fill('a');
    await noHorizontalScroll(page);
    await expectInside(page.getByRole('search').locator('button, input'), width);
    if (width === 320 && height === 640) await shot(page, 'QA-011_320-find.png');
    await page.keyboard.press('Escape');
    await drop(page, 'body', [], 'just text');
    await expect(page.getByRole('alert')).toBeVisible();
    await noHorizontalScroll(page);
    await expectInside(page.getByRole('alert').locator('button'), width);
    if (width === 320 && height === 640) await shot(page, 'QA-011_320-notice.png');
  });
}

// ---- QA-012 ------------------------------------------------------------------------------------

test('QA-012 NFR-06 forced colors: pressed, selected and focus states are distinguishable with system colors', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'forced-colors emulation is Chromium only');
  await page.emulateMedia({ forcedColors: 'active' });
  await start(page);
  await load(page, '{"a":1,}');
  const look = (l: Locator) =>
    l.evaluate((e) => {
      const s = getComputedStyle(e);
      return [s.backgroundColor, s.color, s.borderBlockEndWidth, s.outlineStyle].join('|');
    });
  // view switch: pressed differs from not pressed
  expect(await look(tbButton(page, 'view.text'))).not.toBe(await look(tbButton(page, 'view.tree')));
  // issue tabs: selected differs from not selected
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(2);
  const selected = page.getByRole('tab', { selected: true });
  const other = page.getByRole('tab', { selected: false });
  expect(await look(selected)).not.toBe(await look(other));
  // find match case toggle
  await content(page).focus();
  await page.keyboard.press('ControlOrMeta+f');
  const toggle = page.getByRole('button', { name: COPY['search.match_case'] });
  const off = await look(toggle);
  await toggle.click();
  await page.mouse.move(0, 0);
  expect(await look(toggle)).not.toBe(off);
  await page.keyboard.press('Escape');
  await shot(page, 'QA-012_forced-colors.png');
  // tree: the selected row is outlined
  await content(page).focus();
  await page.keyboard.press('ControlOrMeta+a');
  await load(page, '{"a":1}');
  await tbButton(page, 'view.tree').click();
  const row = page.locator('.tk-tree__row').first();
  await row.click();
  await expect(page.locator('.tk-tree__row--selected')).toHaveCount(1);
  const sel = await page
    .locator('.tk-tree__row--selected')
    .evaluate((e) => [getComputedStyle(e).outlineStyle, getComputedStyle(e).borderInlineStartStyle]);
  expect(sel.some((s) => s !== 'none')).toBe(true);
  await shot(page, 'QA-012_forced-colors-tree.png');
});

// ---- QA-013 ------------------------------------------------------------------------------------

test.describe('QA-013 focus return', () => {
  for (const id of ['action.minify', 'action.beautify', 'action.reindent'] as const) {
    test(`QA-013 NFR-06 after ${COPY[id]} focus returns to the toolbar control or the editor`, async ({ page }) => {
      await seamWorker(page, { slowMs: 60 });
      await start(page);
      await load(page, VALID);
      const button = tbButton(page, id);
      await button.focus();
      await page.keyboard.press('Enter');
      await expect(app(page)).toHaveAttribute('data-busy', 'true');
      await waitIdle(page);
      // re-indent hands focus to the editor (controller, F-004); the others keep their button
      await expect(id === 'action.reindent' ? content(page) : button).toBeFocused();
    });
  }

  test('QA-013 NFR-06 CMP-ConfirmDialog cancelling a very large open returns focus to Open file', async ({ page }) => {
    test.setTimeout(240_000);
    const file = largeFixture('verylarge', 150 * MB);
    await start(page);
    await load(page, '{"small": true}');
    await openFile(page, file);
    const dialog = page.getByRole('dialog', { name: COPY['confirm.title'] });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: COPY['action.cancel'] }).press('Enter');
    await expect(dialog).toBeHidden();
    await expect(tbButton(page, 'action.open')).toBeFocused();
  });

  test('QA-013 NFR-06 CMP-Notice dismissing a notice returns focus to the editor', async ({ page }) => {
    await start(page);
    await load(page, VALID);
    await content(page).focus();
    await drop(page, 'body', [], 'just text');
    const alert = page.getByRole('alert');
    const dismiss = alert.getByRole('button', { name: COPY['action.dismiss'] });
    await dismiss.focus();
    await page.keyboard.press('Enter');
    await expect(alert).toBeHidden();
    await expect(content(page)).toBeFocused();
    // Escape on a notice too
    await drop(page, 'body', [], 'just text');
    await alert.getByRole('button', { name: COPY['action.dismiss'] }).focus();
    await page.keyboard.press('Escape');
    await expect(alert).toBeHidden();
    await expect(content(page)).toBeFocused();
  });
});

// ---- QA-002..005 -------------------------------------------------------------------------------

test('QA-002 style.md Beautify is the only filled control (accent / onAccent)', async ({ page }) => {
  await start(page);
  await load(page, VALID);
  const accent = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--tk-color-accent)';
    document.body.append(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  });
  const bg = (l: Locator) => l.evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(await bg(tbButton(page, 'action.beautify'))).toBe(accent);
  expect(await bg(tbButton(page, 'action.minify'))).not.toBe(accent);
  await shot(page, 'QA-002_beautify-filled.png');
});

test('QA-003 CMP-Toolbar the indent selector shows a visible COPY-label.indent next to its value', async ({ page }) => {
  await start(page);
  await load(page, VALID);
  const label = toolbar(page).getByText(COPY['label.indent'], { exact: true });
  await expect(label).toBeVisible();
  // shown, not only an accessible name
  expect((await label.boundingBox())!.width).toBeGreaterThan(10);
  const select = toolbar(page).getByRole('combobox', { name: COPY['label.indent'] });
  await expect(select).toBeVisible();
  const box = (await select.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(24);
  await shot(page, 'QA-003_indent-selector.png');
});

test('QA-004 F-010.R1 CMP-SearchPanel narrow: the field alone on the first row; match case, count, previous, next and close below', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 760 });
  await start(page);
  await load(page, VALID);
  await content(page).focus();
  await page.keyboard.press('ControlOrMeta+f');
  const panel = page.getByRole('search');
  const field = panel.getByRole('searchbox');
  await field.fill('id');
  const f = (await field.boundingBox())!;
  for (const id of ['search.match_case', 'action.find_prev', 'action.find_next', 'action.close'] as const) {
    const b = (await panel.getByRole('button', { name: COPY[id] }).boundingBox())!;
    expect(b.y, id).toBeGreaterThanOrEqual(f.y + f.height - 1);
  }
  await shot(page, 'QA-004_find-narrow.png');
});

test('QA-005 CMP-StatusBar the tree view shows no cursor position', async ({ page }) => {
  await start(page);
  await load(page, VALID);
  const cursor = page.locator('.tk-statusbar__cursor');
  await expect(cursor).toBeVisible();
  await tbButton(page, 'view.tree').click();
  await expect(page.locator('.tk-tree__row').first()).toBeVisible();
  await expect(cursor).toBeHidden();
  await shot(page, 'QA-005_tree-statusbar.png');
  await tbButton(page, 'view.text').click();
  await expect(cursor).toBeVisible();
});

// ---- QA-020 ------------------------------------------------------------------------------------

test.describe('QA-020 a11y minors', () => {
  test('QA-020 SCR-Formatter the toolbar sits in a banner landmark (axe region)', async ({ page }) => {
    await start(page);
    await expect(page.getByRole('banner').getByRole('toolbar')).toBeVisible();
    const results = await new AxeBuilder({ page }).withRules(['region']).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });

  test('QA-020 CMP-Editor shows a focus ring when focused', async ({ page }) => {
    await start(page);
    await load(page, VALID);
    await content(page).focus();
    const outline = await page
      .locator('.cm-editor')
      .evaluate((e) => [getComputedStyle(e).outlineStyle, getComputedStyle(e).outlineWidth]);
    expect(outline[0]).toBe('solid');
    expect(outline[1]).toBe('2px');
    await shot(page, 'QA-020_editor-focus.png');
  });

  test('QA-020 F-005.AC6 activating an issue or the invalid status moves focus to the editor', async ({ page }) => {
    await start(page);
    await load(page, '{\n  "a": 1,\n}');
    const issue = page.locator('.tk-issue').first();
    await issue.focus();
    await page.keyboard.press('Enter');
    await expect(content(page)).toBeFocused();
    await page.locator('.tk-statusbar__jump').focus();
    await page.keyboard.press('Enter');
    await expect(content(page)).toBeFocused();
    // the issue code is not part of the row's accessible name
    await expect(issue).not.toHaveAccessibleName(/trailing-comma/);
  });
});

// ---- QA-021 ------------------------------------------------------------------------------------

test('QA-021 F-009.R2 the privacy details link to the open-source notices (COPY-privacy.notices)', async ({
  page,
  request,
}) => {
  await start(page);
  await page.getByRole('button', { name: COPY['privacy.badge'] }).click();
  const dialog = page.getByRole('dialog', { name: COPY['privacy.badge_label'] });
  const link = dialog.getByRole('link', { name: COPY['privacy.notices'] });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', '/third-party-notices.txt');
  await expect(link).toHaveAttribute('target', '_blank');
  const res = await request.get('/third-party-notices.txt');
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain('third-party notices');
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  await shot(page, 'QA-021_privacy-notices.png');
});
