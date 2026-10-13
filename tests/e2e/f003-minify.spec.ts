// F-003 Minify a document — end to end on the production build (ADR-0010): RULE-08 layout,
// lossless numbers (INV-01), refusal of invalid documents with the error focused (INV-03), one
// undo step (INV-04), and the busy policy with progress and cancel on 50 MB (D-005).
import { expect, test, type Page } from '@playwright/test';
import { instrument } from './fixtures';
import {
  app,
  content,
  COPY,
  copy,
  docText,
  largeFixture,
  openFile,
  paste,
  reportShot,
  seamWorker,
  waitIdle,
} from './load-helpers';

const MB = 1_000_000;

test.beforeEach(async ({ page }) => {
  await instrument(page);
});

async function start(page: Page) {
  await page.goto('/?theme=dark');
  await expect(content(page)).toBeVisible();
  await expect(app(page)).toHaveAttribute('data-busy', 'false');
}

const toolbar = (page: Page) => page.getByRole('toolbar');
const minifyButton = (page: Page) => toolbar(page).getByRole('button', { name: COPY['action.minify'], exact: true });
const validity = (page: Page) => page.locator('.tk-statusbar__validity');

async function pasted(page: Page, text: string, state: 'valid' | 'invalid' = 'valid') {
  await paste(page, text);
  await expect(validity(page)).toHaveAttribute('data-validity', state);
}

async function minify(page: Page) {
  await minifyButton(page).click();
  await waitIdle(page);
}

test.describe('F-003 minify', () => {
  test('F-003.AC1 minifies to the most compact equivalent text', async ({ page }) => {
    await start(page);
    await pasted(page, '{\n  "a": [ 1, 2 ],\n  "b": "x y"\n}');
    await minify(page);
    await expect.poll(() => docText(page)).toBe('{"a":[1,2],"b":"x y"}');
    await expect(app(page)).toHaveAttribute('data-lines', '1');
    await reportShot(page, 'F-003/minified.png');
  });

  test('F-003.AC2 numbers appear exactly as written', async ({ page }) => {
    await start(page);
    await pasted(page, '[\n  9007199254740993,\n  1.50\n]');
    await minify(page);
    await expect.poll(() => docText(page)).toBe('[9007199254740993,1.50]');
  });

  test('F-003.AC3 INV-03 an invalid document is unchanged; the single-quotes error is shown and focused', async ({
    page,
  }) => {
    await start(page);
    await pasted(page, "{'a':1}", 'invalid');
    await page.keyboard.press('ControlOrMeta+End');
    await minifyButton(page).click();
    await waitIdle(page);
    await expect.poll(() => docText(page)).toBe("{'a':1}");
    await expect(page.getByRole('region', { name: COPY['label.issues'] })).toContainText('single-quotes');
    await expect(content(page)).toBeFocused();
    await expect(page.locator('.tk-statusbar')).toContainText(copy('status.cursor', { line: 1, column: 2 }));
    await reportShot(page, 'F-003/invalid-refused.png');
  });

  test('F-003.AC4 INV-04 one undo restores the previous text exactly', async ({ page }) => {
    await start(page);
    const before = '[\n  1,\n  {"a": "x  y"}\n]\n';
    await pasted(page, before);
    await minify(page);
    await expect.poll(() => docText(page)).toBe('[1,{"a":"x  y"}]');
    await content(page).focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => docText(page)).toBe(before);
  });
});

test.describe('F-003 slow worker', () => {
  // the worker's messages arrive late, so the operation is still running while we look at it
  test.beforeEach(async ({ page }) => {
    await seamWorker(page, { slowMs: 30 });
  });

  test('F-003.AC5 50 MB: progress, scroll and cancel work; editing and other actions are unavailable', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const file = largeFixture('minify', 50 * MB);
    await start(page);
    await openFile(page, file);
    await waitIdle(page);
    await expect(validity(page)).toHaveAttribute('data-validity', 'valid', { timeout: 60_000 });
    await minifyButton(page).click();
    const bar = page.getByRole('status').filter({ hasText: /Formatting… \d+%/ });
    await expect(bar).toBeVisible({ timeout: 10_000 });
    await expect(content(page)).toHaveAttribute('aria-readonly', 'true');
    for (const name of [COPY['action.beautify'], COPY['action.minify'], COPY['action.open']])
      await expect(toolbar(page).getByRole('button', { name, exact: true })).toBeDisabled();
    const scrolled = await page.locator('.cm-scroller').evaluate((el) => {
      el.scrollTop = 1500;
      return el.scrollTop;
    });
    expect(scrolled).toBeGreaterThan(0);
    await bar.getByRole('button', { name: COPY['action.cancel'] }).click();
    await waitIdle(page);
    await expect(bar).toBeHidden();
    await expect(app(page)).toHaveAttribute('data-bytes', String(50 * MB));
    await page.locator('.cm-scroller').evaluate((el) => (el.scrollTop = 0));
    await expect(page.locator('.cm-line').nth(1)).toHaveText('  {"fixture": "minify"},');
  });
});
