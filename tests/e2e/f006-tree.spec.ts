// F-006 Explore the document as a tree — end to end on the production build (ADR-0010):
// CMP-TreeView with the view switch, RULE-12 expansion and groups, D-018 header actions (copy
// path, copy value, show in text), collapse all, the invalid / checking / building / unavailable
// states, the manual-copy field, the keyboard model, and the scale targets of F-006.AC9
// (100,000 and 1,000,000 children; ADR-0007). Clipboard writes go to a recording stub (the real
// clipboard round trip is covered by F-007 in Chromium); refusals are forced through the stub.
import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { instrument } from './fixtures';
import { app, content, COPY, copy, openFile, paste, reportShot, ROOT, waitIdle } from './load-helpers';

const MB = 1_000_000;

declare global {
  interface Window {
    __clip?: { mode: 'ok' | 'deny'; writes: string[] };
    __hold?: boolean;
    __release?: () => void;
  }
}

test.beforeEach(async ({ page }) => instrument(page));

/** Replaces the async clipboard with a recorder; `deny` refuses like a browser. */
async function stubClipboard(page: Page, mode: 'ok' | 'deny') {
  await page.addInitScript((m) => {
    const state = { mode: m, writes: [] as string[] };
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
        if (state.mode === 'deny') throw new DOMException('Write permission denied.', 'NotAllowedError');
        const blob = await items[0]!.getType('text/plain');
        state.writes.push(await blob.text());
      },
      writeText: async (text: string) => {
        if (state.mode === 'deny') throw new DOMException('Write permission denied.', 'NotAllowedError');
        state.writes.push(text);
      },
    };
    Object.defineProperty(window, 'ClipboardItem', { value: Item, configurable: true, writable: true });
    Object.defineProperty(Navigator.prototype, 'clipboard', { get: () => clipboard, configurable: true });
  }, mode);
}

const clipboard = (page: Page) => page.evaluate(() => window.__clip?.writes.at(-1) ?? null);

/**
 * Test-side worker seam (no product hook): while `window.__hold` is true, results of the kinds
 * listed are held back and delivered by `window.__release()`; `treeTooLarge` fails every tree
 * job as if the device ran out of memory; `slowTree` delays the tree's root by that many ms
 * while reporting progress (a long structural pass); `failChildren` fails that many children
 * queries with `internal` (e.g. a worker restart).
 */
async function treeSeam(
  page: Page,
  opts: { hold?: string[]; treeTooLarge?: boolean; slowTree?: number; failChildren?: number },
) {
  await page.addInitScript((o) => {
    const Native = window.Worker;
    const held: (() => void)[] = [];
    window.__release = () => {
      window.__hold = false;
      for (const f of held.splice(0)) f();
    };
    let failChildren = o.failChildren ?? 0;
    class Seamed extends Native {
      override addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
      ) {
        if (type !== 'message') return super.addEventListener(type, listener, options);
        const fn = typeof listener === 'function' ? listener : (e: Event) => listener.handleEvent(e);
        return super.addEventListener(
          'message',
          (e: Event) => {
            const data = (e as MessageEvent).data as { type?: string; jobId?: number };
            if (window.__hold && o.hold?.includes(data.type ?? '')) {
              held.push(() => fn(e));
              return;
            }
            if (o.slowTree && data.type === 'treeRoot') {
              let k = 0;
              const tick = setInterval(() => {
                k++;
                fn(new MessageEvent('message', { data: { type: 'progress', jobId: data.jobId, fraction: k / 20 } }));
              }, o.slowTree / 20);
              setTimeout(() => {
                clearInterval(tick);
                fn(e);
              }, o.slowTree);
              return;
            }
            fn(e);
          },
          options,
        );
      }
      override postMessage(message: unknown, transfer?: Transferable[] | StructuredSerializeOptions) {
        const m = message as { type?: string; jobId?: number; job?: { kind?: string } };
        if (o.treeTooLarge && m.type === 'job' && m.job?.kind === 'treeOpen') {
          const jobId = m.jobId;
          setTimeout(() => {
            this.dispatchEvent(new MessageEvent('message', { data: { type: 'failed', jobId, reason: 'too-large' } }));
          }, 30);
          return;
        }
        if (failChildren > 0 && m.type === 'job' && m.job?.kind === 'treeChildren') {
          failChildren--;
          const jobId = m.jobId;
          setTimeout(() => {
            this.dispatchEvent(
              new MessageEvent('message', { data: { type: 'failed', jobId, reason: 'internal', detail: 'seam' } }),
            );
          }, 30);
          return;
        }
        return super.postMessage(message, transfer as Transferable[]);
      }
    }
    window.Worker = Seamed;
  }, opts);
}

async function start(page: Page, theme: 'dark' | 'light' = 'dark') {
  await page.goto(`/?theme=${theme}`);
  await expect(content(page)).toBeVisible();
  await expect(app(page)).toHaveAttribute('data-busy', 'false');
}

const viewGroup = (page: Page) => page.getByRole('group', { name: COPY['label.view'] });
const treeButton = (page: Page) => viewGroup(page).getByRole('button', { name: COPY['view.tree'] });
const textButton = (page: Page) => viewGroup(page).getByRole('button', { name: COPY['view.text'] });
const tree = (page: Page) => page.getByRole('tree', { name: COPY['label.tree'] });
const rows = (page: Page) => page.locator('.tk-tree__row:not([hidden])');
/** The rendered row whose key (name, index, `$` or group label) is exactly `key`. */
const row = (page: Page, key: string) =>
  rows(page).filter({ has: page.locator('.tk-tree__key').getByText(key, { exact: true }) });
const twisty = (r: Locator) => r.locator('.tk-tree__twisty');
const header = (page: Page) => page.locator('.tk-tree__header');
const headerButton = (
  page: Page,
  id: 'action.copy_path' | 'action.copy_value' | 'action.reveal' | 'action.collapse_all',
) => header(page).getByRole('button', { name: COPY[id] });
const toast = (page: Page) => page.locator('.tk-toast');

async function showTree(page: Page) {
  await treeButton(page).click();
  await expect(tree(page)).toBeVisible();
  await expect(row(page, '$')).toBeVisible();
}

/** Text selected in the editor (its shadow root's selection). */
async function selectedText(page: Page): Promise<string> {
  return page.locator('.tk-editor-host').evaluate((host) => {
    const root = host.shadowRoot as (ShadowRoot & { getSelection?: () => Selection | null }) | null;
    const sel = root?.getSelection ? root.getSelection() : document.getSelection();
    return (sel?.toString() ?? '').replace(/\r\n/g, '\n');
  });
}

/** Visible text of the editor (all lines rendered). */
async function editorText(page: Page): Promise<string> {
  return (await page.locator('.cm-line').allTextContents()).join('\n');
}

async function axe(page: Page) {
  return new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
}

const ORDER = JSON.stringify(
  {
    order: {
      id: 1,
      status: 'shipped',
      total: 1499.5,
      items: [
        { sku: 'TK-204', qty: 2, gift: false },
        { sku: 'TK-311', qty: 1, gift: true },
      ],
      gift: false,
      coupon: null,
      customer: { name: 'Zoë', email: 'zoe@example.com' },
    },
  },
  null,
  2,
)
  .replace('1499.5', '1499.50')
  .replace('"id": 1,', '"id": 9007199254740993,');

test.describe('F-006 tree view', () => {
  test('F-006.AC1 switching to the tree shows the tree; switching back shows the text unchanged', async ({ page }) => {
    await start(page);
    await paste(page, ORDER);
    await waitIdle(page);
    await expect(textButton(page)).toHaveAttribute('aria-pressed', 'true');
    await showTree(page);
    await expect(treeButton(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(content(page)).toBeHidden();
    await expect(row(page, 'order')).toBeVisible();
    await reportShot(page, 'F-006/default-dark.png');
    expect((await axe(page)).violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await textButton(page).click();
    await expect(content(page)).toBeVisible();
    await expect(tree(page)).toBeHidden();
    expect(await editorText(page)).toBe(ORDER);
    expect(await page.evaluate(() => window.__csp)).toEqual([]);
  });

  test('F-006.AC1 the tree in the light theme passes the accessibility audit', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'visual state');
    await page.goto('/?theme=light');
    await paste(page, ORDER);
    await showTree(page);
    await row(page, 'status').click();
    await reportShot(page, 'F-006/selected-light.png');
    expect((await axe(page)).violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test('F-006.AC2 rows show key, kind, the value as written and child counts', async ({ page }) => {
    await start(page);
    await paste(page, '{"user":{"id":12345678901234567890,"tags":["a"]}}');
    await showTree(page);
    const user = row(page, 'user');
    await expect(user.locator('.tk-tree__kind')).toHaveText(COPY['tree.kind_object']);
    await expect(user.locator('.tk-tree__value')).toHaveText(copy('tree.count_keys', { count: 2 }));
    const id = row(page, 'id');
    await expect(id.locator('.tk-tree__kind')).toHaveText(COPY['tree.kind_number']);
    await expect(id.locator('.tk-tree__value')).toHaveText('12345678901234567890');
    const tags = row(page, 'tags');
    await expect(tags.locator('.tk-tree__kind')).toHaveText(COPY['tree.kind_array']);
    // COPY-tree.count_items: "1 item" when the count is 1
    await expect(tags.locator('.tk-tree__value')).toHaveText(
      copy('tree.count_items', { count: 1 }).replace('items', 'item'),
    );
  });

  test('F-006.AC3 at first the root and its direct children are expanded, deeper containers collapsed', async ({
    page,
  }) => {
    await start(page);
    await paste(page, ORDER);
    await showTree(page);
    await expect(row(page, '$')).toHaveAttribute('aria-expanded', 'true');
    await expect(row(page, 'order')).toHaveAttribute('aria-expanded', 'true');
    await expect(row(page, 'items')).toHaveAttribute('aria-expanded', 'false');
    await expect(row(page, 'customer')).toHaveAttribute('aria-expanded', 'false');
    await expect(row(page, 'sku')).toHaveCount(0);
    await expect(row(page, 'order')).toHaveAttribute('aria-level', '2');
    await expect(row(page, 'id')).toHaveAttribute('aria-level', '3');
  });

  test('F-006.AC4 expanding an array of 250 elements shows [0 … 99], [100 … 199], [200 … 249]', async ({ page }) => {
    await start(page);
    const events = Array.from({ length: 250 }, (_, i) => ({ id: `evt_${i}`, amount: i }));
    await paste(page, JSON.stringify({ page: 1, deep: { events } }, null, 2));
    await showTree(page);
    await twisty(row(page, 'events')).click();
    for (const label of ['[0 … 99]', '[100 … 199]', '[200 … 249]'])
      await expect(row(page, label)).toHaveAttribute('aria-expanded', 'false');
    await twisty(row(page, '[200 … 249]')).click();
    await expect(row(page, '200')).toBeVisible();
    // group rows have no copy actions (RULE-12)
    await row(page, '[100 … 199]').click();
    await expect(headerButton(page, 'action.copy_path')).toBeDisabled();
    await expect(headerButton(page, 'action.copy_value')).toBeDisabled();
    await reportShot(page, 'F-006/groups-dark.png');
  });

  test('F-006.AC5 copying the path of items[0]["content-type"] puts $.items[0]["content-type"] on the clipboard', async ({
    page,
  }) => {
    await stubClipboard(page, 'ok');
    await start(page);
    await paste(page, '{"items": [{"content-type": "application/json"}]}');
    await showTree(page);
    await twisty(row(page, '0')).click();
    await row(page, 'content-type').click();
    await expect(header(page).locator('.tk-tree__path')).toHaveText('$.items[0]["content-type"]');
    await headerButton(page, 'action.copy_path').click();
    await expect(toast(page)).toHaveText(COPY['toast.copied']);
    expect(await clipboard(page)).toBe('$.items[0]["content-type"]');
    await reportShot(page, 'F-006/copied-path-dark.png');
  });

  test('F-006.AC6 RULE-11 copying the value of 1.50 puts 1.50 on the clipboard; containers copy their exact text', async ({
    page,
  }) => {
    await stubClipboard(page, 'ok');
    await start(page);
    const text = '{\r\n  "price": 1.50,\r\n  "o": {"a": [1,\r\n 2]}\r\n}';
    await openFile(page, { name: 'crlf.json', mimeType: 'application/json', buffer: Buffer.from(text) });
    await waitIdle(page);
    await showTree(page);
    await row(page, 'price').click();
    await headerButton(page, 'action.copy_value').click();
    await expect(toast(page)).toHaveText(COPY['toast.copied']);
    expect(await clipboard(page)).toBe('1.50');
    await row(page, 'o').click();
    await headerButton(page, 'action.copy_value').click();
    await expect.poll(() => clipboard(page)).toBe('{"a": [1,\r\n 2]}');
  });

  test('F-006.AC7 showing a nested node in text selects exactly its text and scrolls it into view', async ({
    page,
  }) => {
    await start(page);
    const filler = Array.from({ length: 400 }, (_, i) => ({ n: i }));
    const doc = JSON.stringify({ filler, target: { deep: { list: [1, { k: 'v' }, 3] } } }, null, 2);
    await paste(page, doc);
    await showTree(page);
    await twisty(row(page, 'deep')).click();
    await twisty(row(page, 'list')).click();
    await row(page, '1').click();
    await headerButton(page, 'action.reveal').click();
    await expect(content(page)).toBeVisible();
    await expect(textButton(page)).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => selectedText(page)).toBe('{\n          "k": "v"\n        }');
    // the selection is in the viewport
    const inView = await page.locator('.tk-editor-host').evaluate((host) => {
      const root = host.shadowRoot!;
      const scroller = root.querySelector('.cm-scroller')!.getBoundingClientRect();
      const sel = root.querySelector('.cm-selectionBackground');
      if (!sel) return false;
      const r = sel.getBoundingClientRect();
      return r.top >= scroller.top - 1 && r.bottom <= scroller.bottom + 1;
    });
    expect(inView).toBe(true);
    await expect(page.locator('.cm-content')).toBeFocused();
    await reportShot(page, 'F-006/reveal-dark.png');
  });

  test('F-006.AC8 an invalid document shows COPY-tree.invalid with an action that jumps to the error', async ({
    page,
  }) => {
    await start(page);
    await paste(page, '{\n  "a": 1,\n  "b": 2,\n}');
    await expect(page.locator('.tk-statusbar__validity')).toHaveText(COPY['status.invalid']);
    await treeButton(page).click();
    await expect(page.getByText(COPY['tree.invalid'])).toBeVisible();
    const go = page.getByRole('button', { name: new RegExp(COPY['action.go_to_error']) });
    await expect(go).toContainText(copy('issue.location', { line: 3, column: 9 }));
    await reportShot(page, 'F-006/invalid-dark.png');
    expect((await axe(page)).violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await go.click();
    await expect(content(page)).toBeVisible();
    await expect(page.locator('.tk-statusbar')).toContainText(copy('status.cursor', { line: 3, column: 9 }));
  });

  test('F-006.AC10 collapse all leaves only the root expanded', async ({ page }) => {
    await start(page);
    await paste(page, ORDER);
    await showTree(page);
    await twisty(row(page, 'items')).click();
    await twisty(row(page, '1')).click();
    await expect(row(page, 'sku')).toBeVisible();
    await headerButton(page, 'action.collapse_all').click();
    await expect(rows(page)).toHaveCount(2);
    await expect(row(page, '$')).toHaveAttribute('aria-expanded', 'true');
    await expect(row(page, 'order')).toHaveAttribute('aria-expanded', 'false');
  });

  test('F-006.AC12 when the clipboard is blocked, COPY-error.clipboard is shown and the path is selected in a read-only field', async ({
    page,
  }) => {
    await stubClipboard(page, 'deny');
    await start(page);
    await paste(page, ORDER);
    await showTree(page);
    await row(page, 'total').click();
    await headerButton(page, 'action.copy_path').click();
    await expect(page.locator('[data-notice-id="error.clipboard"]')).toHaveText(COPY['error.clipboard']);
    const field = page.getByRole('textbox', { name: COPY['action.copy_path'] });
    await expect(field).toHaveValue('$.order.total');
    await expect(field).toHaveAttribute('readonly', '');
    await expect(field).toBeFocused();
    expect(await field.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd])).toEqual([
      0,
      '$.order.total'.length,
    ]);
    await reportShot(page, 'F-006/clipboard-blocked-dark.png');
    // the value as well (F-006.R9)
    await headerButton(page, 'action.copy_value').click();
    const value = page.getByRole('textbox', { name: COPY['action.copy_value'] });
    await expect(value).toHaveValue('1499.50');
    await expect(value).toBeFocused();
    expect((await axe(page)).violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test('PRN-01 F-006.R9 F-010.R1 QA-014 every element showing document text is marked translate="no" (browser translation never sends it off the device)', async ({
    page,
  }) => {
    await stubClipboard(page, 'deny');
    await start(page);
    await paste(page, ORDER);
    // `translate` reflects the inherited translation mode: false under a translate="no" ancestor
    const untranslated = (l: Locator) => l.evaluateAll((els) => els.map((e) => (e as HTMLElement).translate));
    // the editor's text (CodeMirror's content) and its host
    expect(await untranslated(page.locator('.tk-editor-host, .cm-content, .cm-line'))).not.toContain(true);
    await showTree(page);
    await row(page, 'total').click();
    // the tree root, every row (keys, values, previews) and the selected path in the header
    await expect(page.locator('.tk-tree')).toHaveAttribute('translate', 'no');
    const treeText = page.locator('.tk-tree__row, .tk-tree__row *, .tk-tree__path');
    expect((await untranslated(treeText)).length).toBeGreaterThan(10);
    expect(await untranslated(treeText)).not.toContain(true);
    await expect(header(page).locator('.tk-tree__path')).toHaveText('$.order.total');
    // the manual-copy field holding a path or value
    await headerButton(page, 'action.copy_value').click();
    const value = page.getByRole('textbox', { name: COPY['action.copy_value'] });
    await expect(value).toHaveValue('1499.50');
    expect(await untranslated(value)).toEqual([false]);
    // the find field (find opens in the text view)
    await page.keyboard.press('Escape');
    await textButton(page).click();
    await content(page).focus();
    await page.keyboard.press('ControlOrMeta+f');
    const findField = page.getByRole('search').getByRole('searchbox');
    await findField.fill('total');
    expect(await untranslated(findField)).toEqual([false]);
  });

  test('F-006.AC13 INV-05 after an undo to a different text the tree shows COPY-tree.checking until the new tree is ready', async ({
    page,
  }) => {
    await treeSeam(page, { hold: ['validation'] });
    await start(page);
    await openFile(page, { name: 'a.json', mimeType: 'application/json', buffer: Buffer.from('{"a": 1}') });
    await waitIdle(page);
    await content(page).click();
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowLeft');
    // one undo step: a paste
    await paste(page, ', "b": 2');
    await expect(page.locator('.tk-statusbar__validity')).toHaveText(COPY['status.valid']);
    await showTree(page);
    await expect(row(page, 'b')).toBeVisible();
    await row(page, 'b').click();
    await page.evaluate(() => (window.__hold = true));
    await page.keyboard.press('Control+z');
    const checking = page.locator('.tk-tree__checking');
    await expect(checking).toBeVisible();
    await expect(checking.getByRole('status')).toHaveText(COPY['tree.checking']);
    await expect(page.locator('.tk-tree')).toHaveAttribute('aria-busy', 'true');
    await expect(headerButton(page, 'action.copy_path')).toBeDisabled();
    // NFR-02: progress and cancel after 0.5 s
    await expect(checking.getByRole('button', { name: COPY['action.cancel'] })).toBeVisible();
    await expect(checking.getByRole('progressbar')).toBeVisible();
    await reportShot(page, 'F-006/checking-dark.png');
    await page.evaluate(() => window.__release?.());
    await expect(checking).toBeHidden();
    await expect(row(page, 'b')).toHaveCount(0);
    await expect(row(page, 'a')).toBeVisible();
  });

  test('NFR-06 F-006.R3 keyboard: arrows move, expand and collapse; the selected row is the only tab stop', async ({
    page,
  }) => {
    await start(page);
    await paste(page, ORDER);
    await showTree(page);
    await row(page, '$').click();
    await expect(row(page, '$')).toBeFocused();
    await expect(row(page, '$')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowDown');
    await expect(row(page, 'order')).toBeFocused();
    await expect(header(page).locator('.tk-tree__path')).toHaveText('$.order');
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
    await expect(row(page, 'items')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(row(page, 'items')).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(row(page, '0')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(row(page, 'items')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(row(page, 'items')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.tk-tree__row[tabindex="0"]')).toHaveCount(1);
    await page.keyboard.press('Home');
    await expect(row(page, '$')).toBeFocused();
    await page.keyboard.press('End');
    await expect(row(page, 'customer')).toBeFocused();
  });

  test('F-006.R8 NFR-02 a long tree build shows COPY-progress.tree with cancel; cancel returns to the text', async ({
    page,
  }) => {
    await treeSeam(page, { slowTree: 2500 });
    await start(page);
    await paste(page, ORDER);
    await waitIdle(page);
    await treeButton(page).click();
    const progress = page.getByRole('progressbar');
    await expect(progress).toBeVisible({ timeout: 2000 });
    await expect(page.locator('.tk-tree__progress-label')).toContainText(COPY['progress.tree'].split('…')[0]!);
    await page.waitForTimeout(600);
    await reportShot(page, 'F-006/building-dark.png');
    await page.locator('.tk-tree__message').getByRole('button', { name: COPY['action.cancel'] }).click();
    await expect(content(page)).toBeVisible();
    await expect(textButton(page)).toHaveAttribute('aria-pressed', 'true');
  });

  test('F-006 edge case: Cancel on the checking bar shows the text view', async ({ page }) => {
    await treeSeam(page, { hold: ['validation'] });
    await start(page);
    await openFile(page, { name: 'a.json', mimeType: 'application/json', buffer: Buffer.from('{"a": 1}') });
    await waitIdle(page);
    await content(page).click();
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowLeft');
    await paste(page, ', "b": 2');
    await showTree(page);
    await row(page, 'b').click();
    await page.evaluate(() => (window.__hold = true));
    await page.keyboard.press('Control+z');
    const cancel = page.locator('.tk-tree__checking').getByRole('button', { name: COPY['action.cancel'] });
    await expect(cancel).toBeVisible();
    await cancel.click();
    await expect(content(page)).toBeVisible();
    await expect(tree(page)).toBeHidden();
    await expect(textButton(page)).toHaveAttribute('aria-pressed', 'true');
    await page.evaluate(() => window.__release?.());
    expect(await editorText(page)).toBe('{"a": 1}');
  });

  test('F-006 edge case: undo and redo in the tree keep a deep node expanded and selected (by path)', async ({
    page,
  }) => {
    await start(page);
    await openFile(page, {
      name: 'order.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"order": {"items": [{"meta": {"tag": "x"}}, {"meta": {"tag": "y"}}]}}'),
    });
    await waitIdle(page);
    await content(page).click();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    // one undo step: insert a member at the start of the root
    await paste(page, '"new": 1, ');
    await expect(page.locator('.tk-statusbar__validity')).toHaveText(COPY['status.valid']);
    await showTree(page);
    await expect(row(page, 'new')).toBeVisible();
    await twisty(row(page, 'items')).click();
    await twisty(row(page, '1')).click();
    await twisty(row(page, 'meta')).click();
    await row(page, 'tag').click();
    await expect(header(page).locator('.tk-tree__path')).toHaveText('$.order.items[1].meta.tag');
    await page.keyboard.press('Control+z');
    await expect(row(page, 'new')).toHaveCount(0);
    await expect(row(page, 'tag')).toBeVisible();
    await expect(row(page, 'meta')).toHaveAttribute('aria-expanded', 'true');
    await expect(row(page, 'tag')).toHaveAttribute('aria-selected', 'true');
    await expect(header(page).locator('.tk-tree__path')).toHaveText('$.order.items[1].meta.tag');
    await page.keyboard.press('Control+Shift+z');
    await expect(row(page, 'new')).toBeVisible();
    await expect(row(page, 'tag')).toHaveAttribute('aria-selected', 'true');
  });

  test('ADR-0007 §4 NFR-06 when the selected row is scrolled out, the tree is the tab stop and Tab brings the row back', async ({
    page,
  }) => {
    await start(page);
    const list = Array.from({ length: 90 }, (_, i) => i);
    await paste(page, JSON.stringify({ a: 'first', list }));
    await showTree(page);
    await row(page, 'a').click();
    await expect(row(page, 'a')).toBeFocused();
    const viewport = page.locator('.tk-tree__viewport');
    await viewport.evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect(row(page, 'a')).toHaveCount(0);
    await expect(viewport).toHaveAttribute('tabindex', '0');
    await expect(page.locator('.tk-tree__row[tabindex="0"]')).toHaveCount(0);
    await headerButton(page, 'action.collapse_all').focus();
    await page.keyboard.press('Tab');
    await expect(row(page, 'a')).toBeFocused();
    await expect(row(page, 'a')).toBeInViewport();
    await expect(viewport).toHaveAttribute('tabindex', '-1');
  });

  test('F-006 review M2 a failing children query shows COPY-error.failed, never a stuck build; the tree opens again later', async ({
    page,
  }) => {
    await treeSeam(page, { failChildren: 1 });
    await start(page);
    await paste(page, ORDER);
    await waitIdle(page);
    await treeButton(page).click();
    await expect(page.locator('[data-notice-id="error.failed"]')).toBeVisible();
    await expect(content(page)).toBeVisible();
    await expect(page.locator('.tk-tree__progress-label')).toHaveCount(0);
    await showTree(page);
    await expect(row(page, 'order')).toBeVisible();
  });

  test('CMP-TreeView narrow coarse layout: icon-only header actions and touch-size rows', async ({
    browser,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'visual state');
    const context = await browser.newContext({ viewport: { width: 390, height: 760 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await instrument(page);
    await start(page);
    const events = Array.from({ length: 250 }, (_, i) => ({ id: `evt_${i}`, amount: i }));
    await paste(page, JSON.stringify({ page: 1, events, next: '/v1/events?page=2' }, null, 2));
    await treeButton(page).tap();
    await expect(row(page, '$')).toBeVisible();
    await twisty(row(page, '[0 … 99]')).tap();
    await row(page, '1').tap();
    const box = await row(page, '1').boundingBox();
    expect(box!.height).toBe(44);
    const btn = await headerButton(page, 'action.copy_path').boundingBox();
    expect(btn!.height).toBeGreaterThanOrEqual(44);
    expect(btn!.width).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await reportShot(page, 'F-006/narrow-coarse-dark.png');
    await context.close();
  });
});

// ---- scale (ADR-0007, F-006.AC9, F-006.AC11) -----------------------------------------------

const GEN = path.join(ROOT, 'tests/fixtures/generated');

/** `{"items": [children × {"id": i}], "head": [records…], "tail": true}` of about `bytes`. */
function bigContainerFixture(name: string, bytes: number, children: number): string {
  fs.mkdirSync(GEN, { recursive: true });
  const p = path.join(GEN, `${name}.json`);
  if (fs.existsSync(p)) return p;
  const fd = fs.openSync(p, 'w');
  let written = 0;
  const write = (s: string) => {
    fs.writeSync(fd, s);
    written += s.length;
  };
  const items: string[] = [];
  for (let i = 0; i < children; i++) items.push(`{"id": ${i}}`);
  const itemsText = items.join(',');
  write('{\n  "items": [');
  write(itemsText);
  write('],\n  "head": [\n');
  const block: string[] = [];
  for (let i = 0; i < 1000; i++)
    block.push(`    {"id": ${100000 + i}, "name": "record-${i}", "ok": true, "tags": ["a", "b"]}`);
  const blockText = block.join(',\n') + ',\n';
  while (written + blockText.length + itemsText.length + 100 < bytes) write(blockText);
  write('    {"end": true}\n  ],\n  "tail": true\n}\n');
  fs.closeSync(fd);
  return p;
}

/**
 * Clicks the expander of the rendered row `click` and returns the ms until the row `ready`
 * is rendered (with its data when `loaded`), checked at every animation frame.
 */
async function timed(page: Page, click: string, ready: string, loaded = false): Promise<number> {
  return page.evaluate(
    ({ click, ready, loaded }) =>
      new Promise<number>((resolve, reject) => {
        const find = (key: string) =>
          [...document.querySelectorAll<HTMLElement>('.tk-tree__row:not([hidden])')].find(
            (r) => r.querySelector('.tk-tree__key')?.textContent === key,
          );
        const target = find(click);
        if (!target) return reject(new Error(`no row ${click}`));
        const t0 = performance.now();
        (target.querySelector('.tk-tree__twisty') as HTMLElement).dispatchEvent(
          new MouseEvent('click', { bubbles: true }),
        );
        const check = () => {
          const r = find(ready);
          if (r && (!loaded || !r.classList.contains('tk-tree__row--loading'))) resolve(performance.now() - t0);
          else if (performance.now() - t0 > 10_000) reject(new Error(`not ready: ${ready}`));
          else requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      }),
    { click, ready, loaded },
  );
}

/** Max frame time while flinging the tree for `ms` (rAF deltas). */
async function scrollFrames(page: Page, ms: number): Promise<{ max: number; frames: number; over50: number }> {
  return page.evaluate(
    (ms) =>
      new Promise<{ max: number; frames: number; over50: number }>((resolve) => {
        const vp = document.querySelector('.tk-tree__viewport') as HTMLElement;
        let last = performance.now();
        const t0 = last;
        let max = 0;
        let frames = 0;
        let over50 = 0;
        let dir = 1;
        const step = () => {
          const now = performance.now();
          const d = now - last;
          last = now;
          if (frames > 0) {
            max = Math.max(max, d);
            if (d > 50) over50++;
          }
          frames++;
          const before = vp.scrollTop;
          vp.scrollTop += dir * 4000;
          if (vp.scrollTop === before) dir = -dir;
          if (now - t0 < ms) requestAnimationFrame(step);
          else resolve({ max, frames, over50 });
        };
        requestAnimationFrame(step);
      }),
    ms,
  );
}

/** NFR-04: JS heap of the page and of the worker after garbage collection (Chromium, CDP). */
async function heapAfterGc(page: Page): Promise<{ main: number; worker: number | null }> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.collectGarbage');
  const own = (await cdp.send('Runtime.getHeapUsage')) as { usedSize: number; backingStorageSize?: number };
  const main = own.usedSize + (own.backingStorageSize ?? 0);
  let worker: number | null = null;
  try {
    const { targetInfos } = await cdp.send('Target.getTargets');
    const w = targetInfos.find((t) => t.type === 'worker');
    if (w) {
      const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: w.targetId, flatten: false });
      let id = 0;
      const waiting = new Map<number, (r: Record<string, number>) => void>();
      cdp.on('Target.receivedMessageFromTarget', (e) => {
        if (e.sessionId !== sessionId) return;
        const m = JSON.parse(e.message) as { id?: number; result?: Record<string, number> };
        if (m.id !== undefined) waiting.get(m.id)?.(m.result ?? {});
      });
      const send = (method: string) =>
        new Promise<Record<string, number>>((resolve, reject) => {
          const mid = ++id;
          waiting.set(mid, resolve);
          setTimeout(() => reject(new Error('timeout')), 10_000);
          void cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id: mid, method }) });
        });
      await send('HeapProfiler.collectGarbage');
      const usage = await send('Runtime.getHeapUsage');
      // the mirror's large flat strings are counted as backing storage
      worker = (usage['usedSize'] ?? 0) + (usage['backingStorageSize'] ?? 0);
    }
  } catch {
    worker = null;
  }
  await cdp.detach();
  return { main, worker };
}

test.describe('F-006 scale', () => {
  test('F-006.AC9 NFR-04 a 50 MB document: a 100,000-child container shows its first group within 100 ms and scrolls without long frames', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'timing targets are measured in Chromium (NFR-04)');
    test.setTimeout(240_000);
    const file = bigContainerFixture('tree2-50mb-100k', 50 * MB, 100_000);
    await start(page);
    await openFile(page, file);
    await expect(app(page)).toHaveAttribute('data-tier', 'large', { timeout: 120_000 });
    await waitIdle(page);
    await expect(page.locator('.tk-statusbar__validity')).toHaveText(COPY['status.valid'], { timeout: 60_000 });
    await showTree(page);
    // direct children of the root start expanded (RULE-12): collapse "items", then measure
    await twisty(row(page, 'items')).click();
    await expect(row(page, 'items')).toHaveAttribute('aria-expanded', 'false');
    await expect(row(page, 'items').locator('.tk-tree__value')).toHaveText(
      copy('tree.count_items', { count: '100,000' }),
    );
    const group = await timed(page, 'items', '[0 … 9999]');
    const sub = await timed(page, '[0 … 9999]', '[0 … 99]');
    const first = await timed(page, '[0 … 99]', '0', true);
    console.log(
      `F-006.AC9 100k: group ${group.toFixed(1)} ms, subgroups ${sub.toFixed(1)} ms, first items ${first.toFixed(1)} ms`,
    );
    expect(group).toBeLessThanOrEqual(100);
    expect(first).toBeLessThanOrEqual(100);
    await reportShot(page, 'F-006/ac9-100k-dark.png');
    // scroll: expand every group of 100 inside [0 … 9999] (bottom up, by keyboard) → 10,000 rows
    await row(page, '[0 … 99]').click();
    await page.keyboard.press('ArrowLeft'); // collapse [0 … 99] again
    for (let k = 0; k < 99; k++) await page.keyboard.press('ArrowDown');
    await expect(page.locator('.tk-tree__row:focus .tk-tree__key')).toHaveText('[9900 … 9999]');
    for (let k = 0; k < 100; k++) {
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowUp');
    }
    const frames = await scrollFrames(page, 3000);
    console.log(
      `F-006.AC9 scroll 10,000+ rows: ${frames.frames} frames, max ${frames.max.toFixed(1)} ms, > 50 ms: ${frames.over50}`,
    );
    expect(frames.over50).toBe(0);
    // the rows in view load their data after the fling
    await expect(page.locator('.tk-tree__row--loading:not([hidden])')).toHaveCount(0, { timeout: 5_000 });
    // NFR-04: memory after GC with the 50 MB document and its tree (editor + worker mirror + tree)
    const mem = await heapAfterGc(page);
    console.log(
      `F-006.AC9 50 MB memory after GC: main ${(mem.main / 1e6).toFixed(1)} MB, worker ${mem.worker === null ? 'n/a' : (mem.worker / 1e6).toFixed(1) + ' MB'}`,
    );
    expect(mem.main + (mem.worker ?? 0)).toBeLessThan(1.5e9);
  });

  test('ADR-0007 F-006.AC9 a 1,000,000-child container: first group within 100 ms, a deep cold group, scrolling', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'timing targets are measured in Chromium (NFR-04)');
    test.setTimeout(240_000);
    const file = bigContainerFixture('tree2-1m', 0, 1_000_000);
    await start(page);
    await openFile(page, file);
    await expect(app(page)).toHaveAttribute('data-tier', 'large', { timeout: 120_000 });
    await waitIdle(page);
    await expect(page.locator('.tk-statusbar__validity')).toHaveText(COPY['status.valid'], { timeout: 60_000 });
    await showTree(page);
    await twisty(row(page, 'items')).click();
    await expect(row(page, 'items')).toHaveAttribute('aria-expanded', 'false');
    const group = await timed(page, 'items', '[0 … 9999]');
    await timed(page, '[0 … 9999]', '[0 … 99]');
    const first = await timed(page, '[0 … 99]', '0', true);
    console.log(`1M: group ${group.toFixed(1)} ms, first items ${first.toFixed(1)} ms`);
    expect(group).toBeLessThanOrEqual(100);
    expect(first).toBeLessThanOrEqual(100);
    // a deep group, reached by keyboard (collapse what is open first)
    await headerButton(page, 'action.collapse_all').click();
    await twisty(row(page, 'items')).click();
    await row(page, 'items').click();
    for (let k = 0; k < 74; k++) await page.keyboard.press('ArrowDown');
    await expect(page.locator('.tk-tree__row:focus .tk-tree__key')).toHaveText('[730000 … 739999]');
    await page.keyboard.press('ArrowRight');
    for (let k = 0; k < 41; k++) await page.keyboard.press('ArrowDown');
    await expect(page.locator('.tk-tree__row:focus .tk-tree__key')).toHaveText('[734000 … 734099]');
    const deep = await timed(page, '[734000 … 734099]', '734000', true);
    console.log(`1M: deep group [734000 … 734099] ${deep.toFixed(1)} ms`);
    expect(deep).toBeLessThan(1000);

    // ADR-0007 §4 scaled mode: > 333,334 rows (8 M px spacer). Expand every group of 10,000 and
    // 3,400 groups of 100, bottom up, through the tree's own keyboard handling.
    await headerButton(page, 'action.collapse_all').click();
    await twisty(row(page, 'items')).click();
    await row(page, 'items').click();
    for (let k = 0; k < 100; k++) await page.keyboard.press('ArrowDown');
    await expect(page.locator('.tk-tree__row:focus .tk-tree__key')).toHaveText('[990000 … 999999]');
    const total = await page.evaluate(() => {
      const key = (k: string) =>
        document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
      const level = () => document.activeElement!.getAttribute('aria-level');
      for (let k = 0; k < 100; k++) {
        key('ArrowRight');
        key('ArrowUp');
      }
      key('End'); // "tail"
      key('ArrowUp'); // "head"
      key('ArrowUp'); // [999900 … 999999]
      let expanded = 0;
      while (expanded < 3400) {
        if (level() === '4' && document.activeElement!.getAttribute('aria-expanded') === 'false') {
          key('ArrowRight');
          expanded++;
        }
        key('ArrowUp');
      }
      return (document.querySelector('.tk-tree__spacer') as HTMLElement).getBoundingClientRect().height;
    });
    expect(total).toBe(8_000_000);
    // real wheel scrolling over the scaled list, frames recorded meanwhile
    const viewport = page.locator('.tk-tree__viewport');
    const box = (await viewport.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.evaluate(() => {
      const w = window as unknown as { __frames: number[]; __stop: boolean };
      w.__frames = [];
      w.__stop = false;
      let last = performance.now();
      const tick = () => {
        const now = performance.now();
        w.__frames.push(now - last);
        last = now;
        if (!w.__stop) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const before = await viewport.evaluate((el) => el.scrollTop);
    for (let k = 0; k < 120; k++) await page.mouse.wheel(0, k < 60 ? 2400 : -800);
    const frames = await page.evaluate(() => {
      const w = window as unknown as { __frames: number[]; __stop: boolean };
      w.__stop = true;
      return w.__frames.slice(1);
    });
    const after = await viewport.evaluate((el) => el.scrollTop);
    expect(after).not.toBe(before);
    const max = Math.max(...frames);
    console.log(
      `1M scaled (${total}): wheel ${frames.length} frames, max ${max.toFixed(1)} ms, > 50 ms: ${frames.filter((f) => f > 50).length}`,
    );
    expect(frames.filter((f) => f > 50)).toEqual([]);
    // the rows in view load their data
    await expect(page.locator('.tk-tree__row--loading:not([hidden])')).toHaveCount(0, { timeout: 5_000 });
    await expect(rows(page).first()).toBeVisible();
    const mem = await heapAfterGc(page);
    console.log(
      `1M memory after GC: main ${(mem.main / 1e6).toFixed(1)} MB, worker ${mem.worker === null ? 'n/a' : (mem.worker / 1e6).toFixed(1) + ' MB'}`,
    );
    expect(mem.main).toBeLessThan(1.5e9);
  });

  test('F-006.AC11 a very large document whose tree cannot be built shows COPY-tree.too_large with a switch to the text', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'loading over 100 MB is best effort (RULE-02); run in Chromium');
    test.setTimeout(300_000);
    await treeSeam(page, { treeTooLarge: true });
    const file = bigContainerFixture('tree2-101mb', 101 * MB, 1000);
    await start(page);
    await openFile(page, file);
    await page
      .getByRole('dialog', { name: COPY['confirm.title'] })
      .getByRole('button', { name: COPY['action.continue'] })
      .click();
    await expect(app(page)).toHaveAttribute('data-tier', 'very-large', { timeout: 180_000 });
    await waitIdle(page);
    await expect(page.locator('.tk-statusbar__validity')).toHaveText(COPY['status.valid'], { timeout: 120_000 });
    await treeButton(page).click();
    await expect(page.getByText(COPY['tree.too_large'])).toBeVisible();
    await reportShot(page, 'F-006/too-large-dark.png');
    await page.locator('.tk-tree__message').getByRole('button', { name: COPY['view.text'] }).click();
    await expect(content(page)).toBeVisible();
  });
});
