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
  expectBusyControl,
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

  test('CMP-Notice D-032 COPY-notice.no_indent is removed when the next tool action starts', async ({ page }) => {
    await start(page);
    await setDoc(page, '{"a":1,"b":[1,2]}');
    await reindent(page, '2');
    const notice = page.locator('[data-notice-id="notice.no_indent"]');
    await expect(notice).toBeVisible();
    await toolbar(page).getByRole('button', { name: COPY['action.beautify'] }).click();
    await waitIdle(page);
    await expect.poll(() => docText(page)).toBe('{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}');
    await expect(notice).toHaveCount(0);
  });

  test('CMP-Notice D-032 COPY-notice.no_indent is removed when the document changes', async ({ page }) => {
    await start(page);
    await setDoc(page, '{"a":1}');
    await reindent(page, '2');
    const notice = page.locator('[data-notice-id="notice.no_indent"]');
    await expect(notice).toBeVisible();
    await content(page).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' ');
    await expect(notice).toHaveCount(0);
  });

  test('CMP-Toolbar D-031 a quick re-indent never disables or restyles toolbar controls', async ({ page }) => {
    await start(page);
    await setDoc(page, '{\n  "a": [\n    1\n  ]\n}');
    await page.evaluate(() => {
      const w = window as unknown as { __flips: string[] };
      w.__flips = [];
      // a disabled toolbar control, or the editor's busy styling, would be a visible flash
      const mo = new MutationObserver((ms) => {
        for (const m of ms) {
          const el = m.target as Element;
          if (m.attributeName === 'disabled' || el.classList.contains('tk-busy'))
            w.__flips.push(el.outerHTML.slice(0, 60));
        }
      });
      for (const el of document.querySelectorAll('[role=toolbar] button, [role=toolbar] select'))
        mo.observe(el, { attributes: true, attributeFilter: ['disabled'] });
      const host = document.querySelector('.tk-editor-host');
      mo.observe(host?.shadowRoot ?? document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
    });
    await reindent(page, '4');
    await expect.poll(() => docText(page)).toBe('{\n    "a": [\n        1\n    ]\n}');
    await waitIdle(page);
    expect(await page.evaluate(() => (window as unknown as { __flips: string[] }).__flips)).toEqual([]);
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
    // D-031: ignored (aria-disabled) but never styled as disabled
    for (const name of [COPY['action.open'], COPY['action.reindent'], COPY['action.beautify'], COPY['action.copy']])
      await expectBusyControl(toolbar(page).getByRole('button', { name }));
    await expectBusyControl(toolbar(page).getByLabel(COPY['label.indent']));
    // scrolling stays available
    await content(page).hover();
    await page.mouse.wheel(0, 4000);
    await expect.poll(() => page.locator('.cm-scroller').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await reportShot(page, 'F-004/progress.png');
    // review MJ-2: cancel during the conversion pass (detection is the first 25 %), once text
    // has already been streamed into the pending document
    await expect
      .poll(async () => Number(await page.getByRole('progressbar').getAttribute('aria-valuenow')), {
        timeout: 60_000,
        intervals: [50],
      })
      .toBeGreaterThanOrEqual(40);
    await bar.getByRole('button', { name: COPY['action.cancel'] }).click();
    await waitIdle(page);
    await expect(bar).toBeHidden();
    await page.locator('.cm-scroller').evaluate((el) => (el.scrollTop = 0));
    await expect(page.locator('.cm-line').first()).toHaveText('[');
    await expect(page.locator('.cm-line').nth(1)).toHaveText('  {"fixture": "reindent"},');
    await expect(app(page)).toHaveAttribute('data-bytes', String(50 * MB));
    // no undo entry was taken: one undo takes back the load itself
    await content(page).focus();
    await page.keyboard.press('ControlOrMeta+z');
    await waitIdle(page);
    await expect(app(page)).toHaveAttribute('data-bytes', '0', { timeout: 60_000 });
  });

  test('F-004.R2 RULE-17 review m-2 a CRLF document keeps CRLF line endings after re-indenting', async ({ page }) => {
    await start(page);
    const src = '[\r\n  1,\r\n  [\r\n    2\r\n  ]\r\n]\r\n';
    const out = '[\r\n    1,\r\n    [\r\n        2\r\n    ]\r\n]\r\n';
    await openFile(page, { name: 'crlf.json', mimeType: 'application/json', buffer: Buffer.from(src) });
    await waitIdle(page);
    await expect(app(page)).toHaveAttribute('data-line-ending', 'crlf');
    await reindent(page, '4');
    await expect.poll(() => docText(page)).toBe(out.replace(/\r\n/g, '\n').replace(/\n$/, '\n'));
    await expect(app(page)).toHaveAttribute('data-line-ending', 'crlf');
    await expect(app(page)).toHaveAttribute('data-bytes', String(Buffer.byteLength(out)));
    await expect(app(page)).toHaveAttribute('data-source-name', 'crlf.json');
  });

  test('F-004.R2 review m-6 a re-indent that changes nothing takes no undo step and shows no notice', async ({
    page,
  }) => {
    await start(page);
    const src = '[\n  1,\n  [\n    2\n  ]\n]';
    await setDoc(page, src);
    await reindent(page, '2');
    await waitIdle(page);
    await expect.poll(() => docText(page)).toBe(src);
    await expect(page.locator('[data-notice-id]')).toHaveCount(0);
    // a real re-indent next: undoing it returns to the paste, and one more undo empties the
    // document — had the no-op taken a step, the second undo would still show the paste
    await reindent(page, '4');
    await expect.poll(() => docText(page)).toBe('[\n    1,\n    [\n        2\n    ]\n]');
    await waitIdle(page);
    await content(page).focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => docText(page)).toBe(src);
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => docText(page)).toBe('');
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

  test('F-004.R7 RULE-02 a document already over 100 MB is re-indented without a second confirmation', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'documents over 100 MB are best effort (RULE-02); measured in Chromium only');
    test.setTimeout(300_000);
    const file = largeFixture('vlreindent', 101 * MB);
    await start(page);
    await openFile(page, file);
    const dialog = page.getByRole('dialog', { name: COPY['confirm.title'] });
    await dialog.getByRole('button', { name: COPY['action.continue'] }).click();
    await waitIdle(page);
    await expect(app(page)).toHaveAttribute('data-tier', 'very-large', { timeout: 120_000 });
    // the result grows (2 → 4 spaces) and stays over 100 MB: no confirmation this time
    await reindent(page, '4');
    await expect(page.locator('.cm-line').nth(1)).toHaveText('    {"fixture": "vlreindent"},', { timeout: 120_000 });
    await waitIdle(page);
    await expect(dialog).toBeHidden();
    await expect
      .poll(async () => Number(await app(page).getAttribute('data-bytes')), { timeout: 60_000 })
      .toBeGreaterThan(101 * MB);
  });
});
