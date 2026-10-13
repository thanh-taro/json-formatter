// F-002 Beautify a document — end to end on the production build (ADR-0010): RULE-07 layout with
// every indent style of the CMP-Toolbar selector (RULE-01), lossless output (INV-01), refusal of
// invalid documents with the error focused (INV-03), one undo step (INV-04), the busy policy
// with progress and cancel on 50 MB (D-005), CRLF documents, and the RULE-02 confirmation.
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
  seamWorker,
  smallFixture,
  waitIdle,
} from './load-helpers';

const MB = 1_000_000;

test.beforeEach(async ({ page }) => {
  await instrument(page);
});

async function start(page: Page, theme: 'dark' | 'light' = 'dark') {
  await page.goto(`/?theme=${theme}`);
  await expect(content(page)).toBeVisible();
  await expect(app(page)).toHaveAttribute('data-busy', 'false');
}

const toolbar = (page: Page) => page.getByRole('toolbar');
const beautifyButton = (page: Page) =>
  toolbar(page).getByRole('button', { name: COPY['action.beautify'], exact: true });
const indentSelect = (page: Page) => toolbar(page).getByRole('combobox', { name: COPY['label.indent'] });
const validity = (page: Page) => page.locator('.tk-statusbar__validity');
const statusBar = (page: Page) => page.locator('.tk-statusbar');
const issues = (page: Page) => page.getByRole('region', { name: COPY['label.issues'] });

/** Pastes `text` and waits until it has been validated as `state`. */
async function pasted(page: Page, text: string, state: 'valid' | 'invalid' = 'valid') {
  await paste(page, text);
  await expect(validity(page)).toHaveAttribute('data-validity', state);
}

async function beautify(page: Page) {
  await beautifyButton(page).click();
  await waitIdle(page);
}

test.describe('F-002 beautify', () => {
  test('F-002.AC1 F-002.R2 beautifies a minified object with the default 2-space indent', async ({ page }) => {
    await start(page);
    await expect(indentSelect(page)).toHaveValue('2');
    await expect(indentSelect(page).locator('option:checked')).toHaveText(COPY['indent.spaces2']);
    await pasted(page, '{"a":[1,2],"b":{}}');
    await beautify(page);
    await expect.poll(() => docText(page)).toBe('{\n  "a": [\n    1,\n    2\n  ],\n  "b": {}\n}');
    await expect(validity(page)).toHaveAttribute('data-validity', 'valid');
    expect(await page.evaluate(() => window.__csp)).toEqual([]);
    await reportShot(page, 'F-002/beautified.png');
  });

  test('F-002.AC2 indent style tab indents every nesting level with exactly one tab', async ({ page }) => {
    await start(page);
    await pasted(page, '{"a":{"b":[1,{"c":true}]}}');
    await indentSelect(page).selectOption('tab');
    await beautify(page);
    await expect
      .poll(() => docText(page))
      .toBe('{\n\t"a": {\n\t\t"b": [\n\t\t\t1,\n\t\t\t{\n\t\t\t\t"c": true\n\t\t\t}\n\t\t]\n\t}\n}');
  });

  test('F-002.AC3 RULE-01 a custom indent of 3 spaces adds exactly 3 spaces per level', async ({ page }) => {
    await start(page);
    await pasted(page, '[[1,[2]],3]');
    await indentSelect(page).selectOption('custom');
    const width = toolbar(page).getByRole('spinbutton', { name: copy('indent.custom', { n: 3 }) });
    await expect(width).toHaveValue('3');
    // CMP-Toolbar: one Tab stop; the field is reached with the arrow keys like the other controls
    await expect(width).toHaveAttribute('tabindex', '-1');
    await indentSelect(page).focus();
    await indentSelect(page).press('ArrowRight');
    await expect(width).toBeFocused();
    // the field's name follows its value, so address it by role alone from here on
    const field = toolbar(page).getByRole('spinbutton');
    await field.press('ArrowUp'); // Up/Down change the width
    await expect(field).toHaveValue('4');
    await expect(indentSelect(page)).toHaveValue('custom');
    await field.press('ArrowDown');
    await expect(field).toHaveValue('3');
    await reportShot(page, 'F-002/indent-custom.png');
    await beautify(page);
    await expect.poll(() => docText(page)).toBe('[\n   [\n      1,\n      [\n         2\n      ]\n   ],\n   3\n]');
    // RULE-01: custom widths are limited to 1–8
    await field.fill('12');
    await field.press('Tab');
    await expect(field).toHaveValue('8');
    await expect(field).toHaveAccessibleName(copy('indent.custom', { n: 8 }));
    await expect(indentSelect(page).locator('option:checked')).toHaveText(copy('indent.custom', { n: 8 }));
  });

  test('F-002.AC4 numbers keep their spelling and keys keep their order', async ({ page }) => {
    await start(page);
    await pasted(page, '{"id":12345678901234567890,"x":1.0,"y":1e3,"2":0,"1":0}');
    await beautify(page);
    await expect
      .poll(() => docText(page))
      .toBe('{\n  "id": 12345678901234567890,\n  "x": 1.0,\n  "y": 1e3,\n  "2": 0,\n  "1": 0\n}');
  });

  test('F-002.AC5 both members of a duplicate key remain in their original order', async ({ page }) => {
    await start(page);
    await pasted(page, '{"a":1,"b":2,"a":3}');
    await beautify(page);
    await expect.poll(() => docText(page)).toBe('{\n  "a": 1,\n  "b": 2,\n  "a": 3\n}');
  });

  test('F-002.AC6 INV-03 an invalid document is unchanged; the trailing-comma error is shown and focused', async ({
    page,
  }) => {
    await start(page);
    await pasted(page, '{"a":1,}', 'invalid');
    await page.keyboard.press('ControlOrMeta+Home');
    await beautifyButton(page).click();
    await waitIdle(page);
    await expect.poll(() => docText(page)).toBe('{"a":1,}');
    await expect(issues(page)).toContainText('trailing-comma');
    await expect(content(page)).toBeFocused();
    await expect(statusBar(page)).toContainText(copy('status.cursor', { line: 1, column: 7 }));
    await reportShot(page, 'F-002/invalid-refused.png');
  });

  test('F-002 edge case: a whitespace-only document is unchanged and empty-document is shown', async ({ page }) => {
    await start(page);
    await pasted(page, '  \n  ', 'invalid');
    await beautifyButton(page).click();
    await waitIdle(page);
    await expect.poll(() => docText(page)).toBe('  \n  ');
    await expect(issues(page)).toContainText('empty-document');
  });

  test('F-002 edge case: beautify is unavailable for an empty document', async ({ page }) => {
    await start(page);
    await expect(beautifyButton(page)).toBeDisabled();
    await expect(indentSelect(page)).toBeDisabled();
  });

  test('F-002.AC7 INV-04 one undo restores the document exactly as before beautifying', async ({ page }) => {
    await start(page);
    const before = '{"a" : [1,2],\n  "b":{}}';
    await pasted(page, before);
    await beautify(page);
    await expect.poll(() => docText(page)).not.toBe(before);
    await content(page).focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => docText(page)).toBe(before);
  });

  test('F-002.AC9 a CRLF document stays CRLF and keeps one final line break', async ({ page }) => {
    await start(page);
    await openFile(page, smallFixture('crlf-beautify.json', '{"a":1,\r\n"b":[]}\r\n'));
    await waitIdle(page);
    await expect(app(page)).toHaveAttribute('data-line-ending', 'crlf');
    await beautify(page);
    const want = '{\r\n  "a": 1,\r\n  "b": []\r\n}\r\n';
    await expect.poll(() => docText(page)).toBe(want.replace(/\r\n/g, '\n'));
    await expect(app(page)).toHaveAttribute('data-line-ending', 'crlf');
    await expect(app(page)).toHaveAttribute('data-bytes', String(Buffer.byteLength(want)));
    await expect(app(page)).toHaveAttribute('data-lines', '5'); // ends with exactly one line break
    // RULE-10: a beautified file keeps its name
    await expect(app(page)).toHaveAttribute('data-source-name', 'crlf-beautify.json');
  });

  test('F-002.AC10 RULE-02 a result over 100 MB asks first; declining leaves the document unchanged', async ({
    page,
  }) => {
    await start(page);
    const deep = '['.repeat(10_000) + ']'.repeat(10_000);
    await pasted(page, deep);
    await beautifyButton(page).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // 2 × Σ depths + 19,998 line breaks + 20,000 brackets
    const bytes = 2 * (2 * ((9_998 * 9_999) / 2) + 9_999) + 19_998 + 20_000;
    await expect(dialog).toContainText(
      copy('confirm.very_large', { size: `${(Math.floor(bytes / 100_000) / 10).toFixed(1)} MB` }),
    );
    await expect(dialog.getByRole('button', { name: COPY['action.continue'] })).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations.map(
        (v) => v.id,
      ),
    ).toEqual([]);
    await reportShot(page, 'F-002/confirm-very-large.png');
    await dialog.getByRole('button', { name: COPY['action.cancel'] }).click();
    await expect(dialog).toBeHidden();
    await waitIdle(page);
    await expect(app(page)).toHaveAttribute('data-bytes', '20000');
    await expect(app(page)).toHaveAttribute('data-lines', '1');
  });
});

test.describe('F-002 very large results (RULE-02)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'a 200 MB document: Chromium only (memory)');

  test('F-002.AC10 choosing COPY-action.continue beautifies into a document over 100 MB', async ({ page }) => {
    test.setTimeout(240_000);
    await start(page);
    await pasted(page, '['.repeat(10_000) + ']'.repeat(10_000));
    await beautifyButton(page).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: COPY['action.continue'] }).click();
    await expect(dialog).toBeHidden();
    const bytes = 2 * (2 * ((9_998 * 9_999) / 2) + 9_999) + 19_998 + 20_000;
    await expect(app(page)).toHaveAttribute('data-bytes', String(bytes), { timeout: 180_000 });
    await waitIdle(page);
    await expect(app(page)).toHaveAttribute('data-lines', '19999');
    await expect(app(page)).toHaveAttribute('data-tier', 'very-large');
    await expect(page.locator('.cm-line').nth(1)).toHaveText('  [');
  });

  test('RULE-02 F-002.R7 a document already over 100 MB beautifies without asking again', async ({ page }) => {
    test.setTimeout(240_000);
    const file = largeFixture('verylarge', 150 * MB);
    await start(page);
    await openFile(page, file);
    await page.getByRole('dialog').getByRole('button', { name: COPY['action.continue'] }).click();
    await expect(app(page)).toHaveAttribute('data-bytes', String(150 * MB), { timeout: 120_000 });
    await waitIdle(page);
    await expect(validity(page)).toHaveAttribute('data-validity', 'valid', { timeout: 60_000 });
    await beautifyButton(page).click();
    const bar = page.getByRole('status').filter({ hasText: /Formatting… \d+%/ });
    await expect(bar).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('dialog')).toBeHidden();
    await bar.getByRole('button', { name: COPY['action.cancel'] }).click();
    await waitIdle(page);
    await expect(app(page)).toHaveAttribute('data-bytes', String(150 * MB));
  });
});

test.describe('F-002 slow worker', () => {
  // the worker's messages arrive late, so the operation is still running while we look at it
  test.beforeEach(async ({ page }) => {
    await seamWorker(page, { slowMs: 30 });
  });

  test('F-002.AC8 50 MB: progress, scroll and cancel work; editing and other actions are unavailable', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const file = largeFixture('beautify', 50 * MB);
    await start(page);
    await openFile(page, file);
    await waitIdle(page);
    await expect(validity(page)).toHaveAttribute('data-validity', 'valid', { timeout: 60_000 });
    const firstLines = await page.locator('.cm-line').first().textContent();
    await beautifyButton(page).click();
    const bar = page.getByRole('status').filter({ hasText: /Formatting… \d+%/ });
    await expect(bar).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('progressbar')).toBeVisible();
    await expect(content(page)).toHaveAttribute('aria-readonly', 'true');
    for (const name of [COPY['action.beautify'], COPY['action.minify'], COPY['action.open'], COPY['action.clear']])
      await expect(toolbar(page).getByRole('button', { name, exact: true })).toBeDisabled();
    await expect(indentSelect(page)).toBeDisabled();
    // scrolling stays available
    const scrolled = await page.locator('.cm-scroller').evaluate((el) => {
      el.scrollTop = 2000;
      return el.scrollTop;
    });
    expect(scrolled).toBeGreaterThan(0);
    await reportShot(page, 'F-002/progress.png');
    await bar.getByRole('button', { name: COPY['action.cancel'] }).click();
    await waitIdle(page);
    await expect(bar).toBeHidden();
    await expect(app(page)).toHaveAttribute('data-bytes', String(50 * MB));
    await expect(page.locator('.cm-line').first()).toHaveText(firstLines ?? '');
  });
});
