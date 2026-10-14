// FLOW-01 and FLOW-03 end to end (FLOW-02 lives in f005-validate.spec.ts): the production build,
// the user journey from the flow spec, step by step. The clipboard is a recording stub.
import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { instrument } from './fixtures';
import { app, content, COPY, docText, paste, waitIdle } from './load-helpers';
import { recordClipboard } from './m1-session';

test.beforeEach(async ({ page }) => {
  await instrument(page);
  await recordClipboard(page);
});

const toolbar = (p: import('@playwright/test').Page) => p.getByRole('toolbar', { name: 'Document actions' });
const action = (p: import('@playwright/test').Page, id: keyof typeof COPY) =>
  toolbar(p).getByRole('button', { name: COPY[id], exact: true });
const lastClip = (p: import('@playwright/test').Page) => p.evaluate(() => window.__clip?.writes.at(-1) ?? null);

test('FLOW-01 F-001.R1 F-002.R1 F-007.R1 F-007.R2 paste, validate, beautify, copy and download', async ({ page }) => {
  const minified = '{"user":{"name":"Zoe","tags":["a","b"]},"n":1.50}';
  const pretty = JSON.stringify(JSON.parse('{"user":{"name":"Zoe","tags":["a","b"]},"n":1}'), null, 2).replace(
    '"n": 1',
    '"n": 1.50',
  );
  // Step 1: open the tool, empty state.
  await page.goto('/?theme=dark');
  await expect(content(page)).toBeVisible();
  await expect(app(page)).toHaveAttribute('data-busy', 'false');
  await expect(page.getByText(COPY['empty.title'] as string).first()).toBeVisible();
  // Step 2: paste; validated automatically.
  await paste(page, minified);
  await expect(page.locator('.tk-statusbar__validity')).toHaveAttribute('data-validity', 'valid');
  // Step 3: choose indent and beautify.
  await toolbar(page).getByLabel(COPY['label.indent']).selectOption('2');
  await action(page, 'action.beautify').click();
  await waitIdle(page);
  await expect.poll(() => docText(page)).toBe(pretty);
  // Step 4: copy and download.
  await action(page, 'action.copy').click();
  await expect.poll(() => lastClip(page)).toBe(pretty);
  await expect(page.locator('.tk-toast').last()).toHaveText(COPY['toast.copied']);
  const downloading = page.waitForEvent('download');
  await action(page, 'action.download').click();
  const file = await downloading;
  expect(fs.readFileSync(await file.path(), 'utf8')).toBe(pretty);
});

test('FLOW-03 F-001 F-006.R1 F-006.R3 F-006.R4 F-006.R5 F-006.R6 tree: expand to a node, copy path and value, show in text', async ({
  page,
}) => {
  const doc = '{"order":{"items":[{"sku":"TK-204","qty":2}],"price":1.50}}';
  await page.goto('/?theme=dark');
  await expect(content(page)).toBeVisible();
  await paste(page, doc);
  await expect(page.locator('.tk-statusbar__validity')).toHaveAttribute('data-validity', 'valid');
  const view = (id: 'view.tree' | 'view.text') =>
    page.getByRole('group', { name: COPY['label.view'] }).getByRole('button', { name: COPY[id] });
  await view('view.tree').click();
  await expect(page.getByRole('tree', { name: COPY['label.tree'] })).toBeVisible();
  const row = (key: string) =>
    page
      .locator('.tk-tree__row:not([hidden])')
      .filter({ has: page.locator('.tk-tree__key').getByText(key, { exact: true }) });
  await row('items').locator('.tk-tree__twisty').click();
  await row('0').locator('.tk-tree__twisty').click();
  await row('sku').click();
  const header = (id: 'action.copy_path' | 'action.copy_value' | 'action.reveal') =>
    page.locator('.tk-tree__header').getByRole('button', { name: COPY[id] });
  await expect(page.locator('.tk-tree__header .tk-tree__path')).toHaveText('$.order.items[0].sku');
  await header('action.copy_path').click();
  await expect.poll(() => lastClip(page)).toBe('$.order.items[0].sku');
  await row('price').click();
  await header('action.copy_value').click();
  await expect.poll(() => lastClip(page)).toBe('1.50');
  await row('sku').click();
  await header('action.reveal').click();
  await expect(view('view.text')).toHaveAttribute('aria-pressed', 'true');
  await expect(content(page)).toBeVisible();
});
