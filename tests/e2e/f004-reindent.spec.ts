// F-004 Change indentation without reflow — end to end on the production build (ADR-0010):
// re-indent with CMP-Toolbar's indent selector (RULE-09), one undo step (INV-04), the
// "nothing indented" notice, the busy policy with progress and cancel (D-005), and the RULE-02
// confirmation when the result would exceed 100 MB.
import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
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
  ROOT,
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
const reindentButton = (page: Page) => toolbar(page).getByRole('button', { name: COPY['action.reindent'] });

/** Chooses the indent style in the toolbar's indent selector and re-indents. */
async function reindent(page: Page, style: '2' | '4' | 'tab') {
  await toolbar(page).getByLabel(COPY['label.indent']).selectOption(style);
  await reindentButton(page).click();
}

async function setDoc(page: Page, text: string) {
  await paste(page, text);
  await expect.poll(() => docText(page)).toBe(text);
}

const axe = (page: Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();

/**
 * A valid JSON document of exactly `bytes` bytes indented with 1 space per level, 4 levels deep:
 * almost every line is `    "abcdefg",` (4 spaces), so re-indenting to 4 spaces grows it by
 * ~80 %. Returns the path and the exact size of that result.
 */
function oneSpaceFixture(bytes: number): { file: string; after: number } {
  const dir = path.join(ROOT, 'tests/fixtures/generated');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `indent1-${bytes}.json`);
  const head = '[\n [\n  [\n   [\n';
  const tail = '   ]\n  ]\n ]\n]\n';
  const line = '    "abcdefg",\n';
  const lastPrefix = '    "';
  const lastSuffix = '"\n';
  const fixed = head.length + tail.length + lastPrefix.length + lastSuffix.length;
  const count = Math.floor((bytes - fixed - 10) / line.length);
  const pad = bytes - fixed - count * line.length;
  // leading spaces: head 0+1+2+3, tail 3+2+1+0, every line 4, the last line 4
  const spaces = 6 + 6 + 4 * count + 4;
  const after = bytes + 3 * spaces;
  if (!(fs.existsSync(file) && fs.statSync(file).size === bytes)) {
    const fd = fs.openSync(file, 'w');
    fs.writeSync(fd, head);
    const block = line.repeat(10_000);
    let left = count;
    for (; left >= 10_000; left -= 10_000) fs.writeSync(fd, block);
    fs.writeSync(fd, line.repeat(left) + lastPrefix + 'x'.repeat(pad) + lastSuffix + tail);
    fs.closeSync(fd);
  }
  expect(fs.statSync(file).size).toBe(bytes);
  return { file, after };
}

test.describe('F-004 re-indent', () => {
  test('F-004.AC1 4·n leading spaces become n tabs', async ({ page }) => {
    await start(page);
    await setDoc(page, '{\n    "a": {\n        "b": [\n            1\n        ]\n    }\n}');
    await reindent(page, 'tab');
    await expect.poll(() => docText(page)).toBe('{\n\t"a": {\n\t\t"b": [\n\t\t\t1\n\t\t]\n\t}\n}');
    await reportShot(page, 'F-004/reindented-tab.png');
  });

  test('F-004.AC2 each leading tab becomes 2 spaces', async ({ page }) => {
    await start(page);
    await setDoc(page, '{\n\t"a": {\n\t\t"b": 1\n\t}\n}');
    await reindent(page, '2');
    await expect.poll(() => docText(page)).toBe('{\n  "a": {\n    "b": 1\n  }\n}');
  });

  test('F-004.AC3 a compact array line keeps its layout and the number of lines is unchanged', async ({ page }) => {
    await start(page);
    const src = '{\n  "xs": [1, 2, 3],\n  "o": {\n    "k": true\n  }\n}';
    await setDoc(page, src);
    await expect(app(page)).toHaveAttribute('data-lines', '6');
    await reindent(page, '4');
    await expect.poll(() => docText(page)).toBe('{\n    "xs": [1, 2, 3],\n    "o": {\n        "k": true\n    }\n}');
    await expect(page.locator('.cm-line').nth(1)).toHaveText('    "xs": [1, 2, 3],');
    await expect(app(page)).toHaveAttribute('data-lines', '6');
    expect((await axe(page)).violations.map((v) => v.id)).toEqual([]);
    await reportShot(page, 'F-004/reindented-4-spaces.png');
  });

  test('F-004.AC4 an invalid document with a trailing comma is re-indented and keeps the comma', async ({ page }) => {
    await start(page);
    await setDoc(page, '{\n  "a": 1,\n  "b": 2,\n}');
    await expect(page.locator('.tk-statusbar__validity')).toHaveText(COPY['status.invalid']);
    await reindent(page, '4');
    await expect.poll(() => docText(page)).toBe('{\n    "a": 1,\n    "b": 2,\n}');
    await expect(page.locator('.tk-statusbar__validity')).toHaveText(COPY['status.invalid']);
  });

  test('F-004.AC5 INV-04 one undo restores the previous text exactly', async ({ page }) => {
    await start(page);
    const src = '[\n  1,\n  [\n    2\n  ]\n]';
    await setDoc(page, src);
    await reindent(page, 'tab');
    await expect.poll(() => docText(page)).toBe('[\n\t1,\n\t[\n\t\t2\n\t]\n]');
    await content(page).focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => docText(page)).toBe(src);
  });

  test('F-004.AC6 a minified document is unchanged and COPY-notice.no_indent is shown', async ({ page }) => {
    await start(page);
    await setDoc(page, '{"a":[1,2,3],"b":{"c":null}}');
    await reindent(page, '4');
    await expect(page.getByRole('status').filter({ hasText: COPY['notice.no_indent'] })).toBeVisible();
    await expect.poll(() => docText(page)).toBe('{"a":[1,2,3],"b":{"c":null}}');
    // nothing to undo from the re-indent: undo takes back the paste itself
    expect((await axe(page)).violations.map((v) => v.id)).toEqual([]);
    await reportShot(page, 'F-004/no-indent.png');
  });

  test('F-004.R1 RULE-01 the indent selector is shared and keeps its choice', async ({ page }) => {
    await start(page);
    await setDoc(page, '[\n  1\n]');
    const select = toolbar(page).getByLabel(COPY['label.indent']);
    await expect(select).toHaveValue('2');
    await reindent(page, '4');
    await expect.poll(() => docText(page)).toBe('[\n    1\n]');
    await expect(select).toHaveValue('4');
  });

  test('F-004.AC7 a 50 MB document shows progress, scrolls, blocks other actions and cancel keeps it', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const file = largeFixture('reindent', 50 * MB);
    await seamWorker(page, { slowMs: 40 });
    await start(page);
    await openFile(page, file);
    await waitIdle(page);
    await expect(app(page)).toHaveAttribute('data-bytes', String(50 * MB), { timeout: 60_000 });
    await reindent(page, 'tab');
    const bar = page.getByRole('status').filter({ hasText: /^Formatting… \d+%/ });
    await expect(bar).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('progressbar')).toBeVisible();
    // editing and all other actions are unavailable
    await expect(content(page)).toHaveAttribute('aria-readonly', 'true');
    for (const name of [COPY['action.open'], COPY['action.reindent'], COPY['action.beautify'], COPY['action.copy']])
      await expect(toolbar(page).getByRole('button', { name })).toBeDisabled();
    await expect(toolbar(page).getByLabel(COPY['label.indent'])).toBeDisabled();
    // scrolling stays available
    await content(page).hover();
    await page.mouse.wheel(0, 4000);
    await expect.poll(() => page.locator('.cm-scroller').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await reportShot(page, 'F-004/progress.png');
    await bar.getByRole('button', { name: COPY['action.cancel'] }).click();
    await waitIdle(page);
    await expect(bar).toBeHidden();
    await expect(page.locator('.cm-line').first()).toHaveText('[');
    await page.locator('.cm-scroller').evaluate((el) => (el.scrollTop = 0));
    await expect(page.locator('.cm-line').nth(1)).toHaveText('  {"fixture": "reindent"},');
    await expect(app(page)).toHaveAttribute('data-bytes', String(50 * MB));
  });

  test('F-004.AC8 RULE-02 a result over 100 MB asks first; Cancel changes nothing', async ({ page }) => {
    test.setTimeout(240_000);
    const { file, after } = oneSpaceFixture(60 * MB);
    expect(after).toBeGreaterThan(100 * MB);
    await start(page);
    await openFile(page, file);
    await waitIdle(page);
    await expect(app(page)).toHaveAttribute('data-bytes', String(60 * MB), { timeout: 60_000 });
    await reindent(page, '4');
    const dialog = page.getByRole('dialog', { name: COPY['confirm.title'] });
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    const size = `${(Math.floor(after / 100_000) / 10).toFixed(1)} MB`;
    await expect(dialog).toContainText(copy('confirm.very_large', { size }));
    await expect(page.locator('.cm-line').nth(4)).toHaveText('    "abcdefg",');
    await reportShot(page, 'F-004/confirm.png');
    await dialog.getByRole('button', { name: COPY['action.cancel'] }).click();
    await expect(dialog).toBeHidden();
    await waitIdle(page);
    await expect(page.locator('.cm-line').nth(4)).toHaveText('    "abcdefg",');
    await expect(app(page)).toHaveAttribute('data-bytes', String(60 * MB));
  });

  test('F-004.AC8 RULE-02 after Continue the re-indented result replaces the document', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'results over 100 MB are best effort (RULE-02); measured in Chromium only');
    test.setTimeout(300_000);
    const { file, after } = oneSpaceFixture(60 * MB);
    await start(page);
    await openFile(page, file);
    await waitIdle(page);
    await reindent(page, '4');
    const dialog = page.getByRole('dialog', { name: COPY['confirm.title'] });
    await dialog.getByRole('button', { name: COPY['action.continue'] }).click();
    await waitIdle(page);
    await expect(app(page)).toHaveAttribute('data-bytes', String(after), { timeout: 180_000 });
    await expect(app(page)).toHaveAttribute('data-tier', 'very-large');
    await expect(page.locator('.cm-line').nth(1)).toHaveText('    [');
    await expect(page.locator('.cm-line').nth(4)).toHaveText('                "abcdefg",');
  });
});
