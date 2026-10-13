// A full M-1 session (F-008.AC6, F-008.AC7, NFR-01): every M-1 feature used once, in the tool
// standalone (a Page) or embedded in the stub host (its Frame), each step asserting its result.
// Load (file), validate (valid and invalid with the issue list), beautify, re-indent, minify,
// tree (expand, copy path, copy value, show in text), find, copy, download, privacy details.
// The clipboard is a recording stub (installed in every frame): the real clipboard round trip is
// F-007's job; here only what the tool wrote matters.
import fs from 'node:fs';
import { expect, type Frame, type Page } from '@playwright/test';
import { COPY, copy } from './load-helpers';

type Scope = Page | Frame;

declare global {
  interface Window {
    __clip?: { mode: 'ok' | 'deny'; writes: string[] };
  }
}

/** Replaces the async clipboard with a recorder in every frame of the page. */
export async function recordClipboard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state = { mode: 'ok' as const, writes: [] as string[] };
    window.__clip = state;
    class Item {
      constructor(readonly data: Record<string, Blob | Promise<Blob>>) {}
      get types() {
        return Object.keys(this.data);
      }
      getType(type: string) {
        return Promise.resolve(this.data[type]!);
      }
    }
    const clipboard = {
      write: async (items: Item[]) => {
        const blob = await items[0]!.getType('text/plain');
        state.writes.push(await blob.text());
      },
      writeText: async (text: string) => {
        state.writes.push(text);
      },
    };
    Object.defineProperty(window, 'ClipboardItem', { value: Item, configurable: true, writable: true });
    Object.defineProperty(Navigator.prototype, 'clipboard', { get: () => clipboard, configurable: true });
  });
}

const app = (s: Scope) => s.locator('[data-screen="SCR-Formatter"]');
const editor = (s: Scope) => s.locator('.cm-content');
const toolbar = (s: Scope) => s.getByRole('toolbar', { name: 'Document actions' });
const action = (s: Scope, id: keyof typeof COPY) => toolbar(s).getByRole('button', { name: COPY[id], exact: true });
const validity = (s: Scope) => s.locator('.tk-statusbar__validity');
const toast = (s: Scope) => s.locator('.tk-toast').last();
const lines = async (s: Scope) => (await s.locator('.cm-line').allTextContents()).join('\n');
const lastClip = (s: Scope) => s.evaluate(() => window.__clip?.writes.at(-1) ?? null);
const idle = (s: Scope) => expect(app(s)).toHaveAttribute('data-busy', 'false', { timeout: 30_000 });

const viewButton = (s: Scope, id: 'view.tree' | 'view.text') =>
  s.getByRole('group', { name: COPY['label.view'] }).getByRole('button', { name: COPY[id] });
const treeRow = (s: Scope, key: string) =>
  s.locator('.tk-tree__row:not([hidden])').filter({ has: s.locator('.tk-tree__key').getByText(key, { exact: true }) });
const treeHeader = (s: Scope, id: 'action.copy_path' | 'action.copy_value' | 'action.reveal') =>
  s.locator('.tk-tree__header').getByRole('button', { name: COPY[id] });

async function selectedText(s: Scope): Promise<string> {
  return s.locator('.tk-editor-host').evaluate((host) => {
    const root = host.shadowRoot as (ShadowRoot & { getSelection?: () => Selection | null }) | null;
    const sel = root?.getSelection ? root.getSelection() : document.getSelection();
    return (sel?.toString() ?? '').replace(/\r\n/g, '\n');
  });
}

/** Replaces the whole document with `text`, as a paste over a select-all. */
async function replaceAll(page: Page, s: Scope, text: string) {
  await editor(s).focus();
  await page.keyboard.press('ControlOrMeta+a');
  await editor(s).evaluate((el, value) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', value);
    el.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true, composed: true }),
    );
  }, text);
  await expect.poll(() => lines(s)).toBe(text);
}

/** Document content used in the session: anything posted to the host must not contain these. */
export const SECRETS = ['TK-204', '9007199254740993', 'zoe@example.com'];

const ORIGINAL =
  '{"order":{"id":9007199254740993,"items":[{"sku":"TK-204","qty":2}],"email":"zoe@example.com","price":1.50}}';
const TWO = `{
  "order": {
    "id": 9007199254740993,
    "items": [
      {
        "sku": "TK-204",
        "qty": 2
      }
    ],
    "email": "zoe@example.com",
    "price": 1.50
  }
}`;
const FOUR = TWO.replace(/^( +)/gm, (m) => m + m);

/**
 * Uses every M-1 feature in `s` (the tool page, or the tool frame inside the host page `page`),
 * asserting each works as specified. The tool must be open and idle on an empty document.
 */
export async function useEveryM1Feature(page: Page, s: Scope): Promise<void> {
  // F-001 load: a file through the file chooser.
  const chooser = page.waitForEvent('filechooser');
  await action(s, 'action.open').click();
  await (await chooser).setFiles({ name: 'orders.json', mimeType: 'application/json', buffer: Buffer.from(ORIGINAL) });
  await idle(s);
  await expect.poll(() => lines(s)).toBe(ORIGINAL);

  // F-005 validate: the loaded document is valid.
  await expect(validity(s)).toHaveAttribute('data-validity', 'valid');
  await expect(validity(s)).toContainText(COPY['status.valid']);

  // F-002 beautify (2 spaces by default), number spellings kept.
  await action(s, 'action.beautify').click();
  await idle(s);
  await expect.poll(() => lines(s)).toBe(TWO);

  // F-004 re-indent to 4 spaces.
  await toolbar(s).getByLabel(COPY['label.indent']).selectOption('4');
  await action(s, 'action.reindent').click();
  await idle(s);
  await expect.poll(() => lines(s)).toBe(FOUR);

  // F-010 find: the shortcut in the editor, one match, closed with Escape.
  await editor(s).focus();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.press('ControlOrMeta+f');
  const search = s.getByRole('search');
  const field = search.getByRole('searchbox', { name: COPY['search.placeholder'] });
  await expect(field).toBeFocused();
  await field.fill('sku');
  await expect(search.locator('.tk-search__count')).toHaveText(copy('search.count', { current: 1, total: 1 }));
  await expect(s.locator('.tk-find-current')).toHaveText('sku');
  await page.keyboard.press('Escape');
  await expect(search).toHaveCount(0);

  // F-006 tree: show, expand, copy path, copy value, show in text.
  await viewButton(s, 'view.tree').click();
  await expect(s.getByRole('tree', { name: COPY['label.tree'] })).toBeVisible();
  await expect(treeRow(s, 'order')).toHaveAttribute('aria-expanded', 'true');
  await expect(treeRow(s, 'items')).toHaveAttribute('aria-expanded', 'false');
  await treeRow(s, 'items').locator('.tk-tree__twisty').click();
  await treeRow(s, '0').locator('.tk-tree__twisty').click();
  await treeRow(s, 'sku').click();
  await expect(s.locator('.tk-tree__header .tk-tree__path')).toHaveText('$.order.items[0].sku');
  await treeHeader(s, 'action.copy_path').click();
  await expect(toast(s)).toHaveText(COPY['toast.copied']);
  await expect.poll(() => lastClip(s)).toBe('$.order.items[0].sku');
  await treeRow(s, 'price').click();
  await treeHeader(s, 'action.copy_value').click();
  await expect.poll(() => lastClip(s)).toBe('1.50');
  await treeRow(s, 'sku').click();
  await treeHeader(s, 'action.reveal').click();
  await expect(editor(s)).toBeVisible();
  await expect(viewButton(s, 'view.text')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => selectedText(s)).toBe('"TK-204"');

  // F-003 minify.
  await action(s, 'action.minify').click();
  await idle(s);
  await expect.poll(() => lines(s)).toBe(ORIGINAL);

  // F-007 copy: exactly the document text, with the confirmation.
  await action(s, 'action.copy').click();
  await expect.poll(() => lastClip(s)).toBe(ORIGINAL);
  await expect(toast(s)).toHaveText(COPY['toast.copied']);

  // F-007 download: named after the file (RULE-10), content exactly as shown.
  const downloading = page.waitForEvent('download');
  await action(s, 'action.download').click();
  const file = await downloading;
  expect(file.suggestedFilename()).toBe('orders.json');
  expect(fs.readFileSync(await file.path(), 'utf8')).toBe(ORIGINAL);

  // F-005 validate: an invalid edit is pinpointed in the issue list, fixing it clears it.
  await replaceAll(page, s, '{"a": 1,}');
  await expect(validity(s)).toHaveAttribute('data-validity', 'invalid');
  await expect(validity(s)).toContainText(COPY['status.invalid']);
  const issues = s.getByRole('region', { name: COPY['label.issues'] });
  await expect(issues.getByRole('list').getByRole('button')).not.toHaveCount(0);
  await replaceAll(page, s, '{"a": 1}');
  await expect(validity(s)).toHaveAttribute('data-validity', 'valid');

  // F-009 privacy details, opened and dismissed.
  await s.getByRole('button', { name: COPY['privacy.badge'] }).click();
  const dialog = s.getByRole('dialog', { name: COPY['privacy.badge_label'] });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: COPY['action.close'] }).click();
  await expect(dialog).toBeHidden();

  expect(await s.evaluate(() => window.__csp)).toEqual([]);
}
