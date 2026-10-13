// F-007 Copy and download the document — end to end on the production build (ADR-0010).
// Clipboard: Chromium writes the real clipboard (permission granted to the page's origin, as a
// browser does on a user gesture) and reads it back; WebKit and Firefox get a recording stub,
// because Playwright WebKit on macOS writes the user's real pasteboard (SP-iframe) and Firefox
// never refuses. The refusal is real in Chromium (stub host without `allow="clipboard-write"`)
// and forced through the stub elsewhere (platform-mapping: "tests force the failure").
// F-007.AC6 (F-007.R5) is deprecated (D-023): no engine reports a download blocked by the frame
// sandbox (SP-iframe), nothing is required of the tool, so it has no test.
import fs from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Frame, type Page } from '@playwright/test';
import { ADMIN, HOST, instrument, TOOL } from './fixtures';
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
type Scope = Page | Frame;

declare global {
  interface Window {
    __clip?: { mode: 'ok' | 'deny'; writes: string[] };
  }
}

test.beforeEach(async ({ page }) => instrument(page));

/** Replaces the async clipboard with a recorder (every frame); `deny` refuses like a browser. */
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

const realClipboard = (browserName: string) => browserName === 'chromium';

/** The text the copy put on the clipboard. */
async function clipboardText(page: Page, browserName: string): Promise<string> {
  if (realClipboard(browserName)) {
    // The tool's Permissions-Policy turns clipboard-read off, so read it from the host origin.
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: HOST });
    const reader = await page.context().newPage();
    await reader.goto(`${HOST}/sibling.html`);
    await reader.bringToFront();
    const text = await reader.evaluate(() => navigator.clipboard.readText());
    await reader.close();
    return text;
  }
  const writes = await page.evaluate(() => window.__clip?.writes ?? []);
  return writes.at(-1) ?? '';
}

const toolbar = (s: Scope) => s.locator('[role="toolbar"]');
const copyButton = (s: Scope) => toolbar(s).getByRole('button', { name: COPY['action.copy'], exact: true });
const downloadButton = (s: Scope) => toolbar(s).getByRole('button', { name: COPY['action.download'] });
const toast = (s: Scope) => s.locator('.tk-toast');
const errorBar = (s: Scope) => s.locator('[data-notice-id="error.clipboard"]');

/** Text selected in the editor (its shadow root's selection where the engine exposes one). */
async function selectedText(s: Scope): Promise<string> {
  return s.locator('.tk-editor-host').evaluate((host) => {
    const root = host.shadowRoot as (ShadowRoot & { getSelection?: () => Selection | null }) | null;
    const sel = root?.getSelection ? root.getSelection() : document.getSelection();
    return (sel?.toString() ?? '').replace(/\r\n/g, '\n');
  });
}

async function start(page: Page) {
  await page.goto('/?theme=dark');
  await expect(content(page)).toBeVisible();
  await expect(app(page)).toHaveAttribute('data-busy', 'false');
}

/** Opens the tool inside the stub host (optionally without clipboard permission), returns its frame. */
async function embedded(page: Page, query: string): Promise<Frame> {
  await page.goto(`${HOST}/host.html?theme=dark&${query}`);
  await expect(page.frameLocator('iframe[name="tool"]').locator('.cm-content')).toBeVisible();
  const frame = page.frame({ name: 'tool' });
  if (!frame) throw new Error('no tool frame');
  return frame;
}

async function pasteInto(s: Scope, text: string) {
  await s.locator('.cm-content').evaluate((el, value) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', value);
    el.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true, composed: true }),
    );
  }, text);
  await expect(s.locator('[data-screen="SCR-Formatter"]')).not.toHaveAttribute('data-bytes', '0');
}

test.describe('F-007 copy', () => {
  test('F-007.AC1 copying puts exactly the document text on the clipboard and shows COPY-toast.copied', async ({
    page,
    context,
    browserName,
  }) => {
    if (realClipboard(browserName))
      await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: TOOL });
    else await stubClipboard(page, 'ok');
    await start(page);
    // A CRLF file: the clipboard gets the document's own line ending (ADR-0006 §3).
    const text = '{\r\n  "id": 9007199254740993,\r\n  "name": "Zoë 😀"\r\n}\r\n';
    await openFile(page, { name: 'crlf.json', mimeType: 'application/json', buffer: Buffer.from(text) });
    await waitIdle(page);
    // The polite live region exists, empty, before the toast's text is inserted (announced).
    const region = page.locator('.tk-toasts');
    await expect(region).toHaveAttribute('aria-live', 'polite');
    await expect(region).toBeEmpty();
    const regionBefore = await region.elementHandle();
    await copyButton(page).click();
    await expect(toast(page)).toHaveText(COPY['toast.copied']);
    expect(await region.evaluate((el, before) => el === before, regionBefore)).toBe(true);
    await expect(region).toContainText(COPY['toast.copied']);
    await reportShot(page, 'F-007/copied-toast-dark.png');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    // CMP-Notice toast: disappears after 2 s.
    await expect(toast(page)).toHaveCount(0, { timeout: 3_000 });
    expect(await clipboardText(page, browserName)).toBe(text);
    expect(await page.evaluate(() => window.__csp)).toEqual([]);
  });

  test('F-007.AC1 the copied toast in the light theme, stacked up to two', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'visual state only');
    await stubClipboard(page, 'ok');
    await page.goto('/?theme=light');
    await paste(page, '{"a": [1, 2, 3]}');
    await copyButton(page).click();
    await expect(toast(page)).toHaveCount(1);
    await copyButton(page).click();
    await copyButton(page).click();
    await expect(toast(page)).toHaveCount(2);
    await reportShot(page, 'F-007/copied-toast-light.png');
  });

  test('F-007.AC4 when the host does not allow clipboard writing, COPY-error.clipboard is shown and the whole document is selected', async ({
    page,
    context,
    browserName,
  }) => {
    if (browserName === 'chromium') {
      // Real refusal: the frame lacks allow="clipboard-write" (the origins themselves are granted).
      await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: HOST });
      await context.grantPermissions(['clipboard-write'], { origin: TOOL });
    } else await stubClipboard(page, 'deny');
    const frame = await embedded(page, 'clip=0');
    const text = '{\n  "a": 1,\n  "b": [true, false]\n}';
    await pasteInto(frame, text);
    await copyButton(frame).click();
    await expect(errorBar(frame)).toHaveText(COPY['error.clipboard']);
    await expect(errorBar(frame)).toHaveAttribute('role', 'alert');
    await expect(toast(frame)).toHaveCount(0);
    await expect.poll(() => selectedText(frame)).toBe(text);
    // The editor has focus, so the copy shortcut copies the selection.
    await expect(frame.locator('.cm-content')).toBeFocused();
    await reportShot(page, 'F-007/error-clipboard-embedded-dark.png');
  });

  test('F-007.AC7 from the tree view a refused copy shows the text view with the whole document selected and COPY-error.clipboard', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'firefox', 'forced refusal covered in Chromium and WebKit');
    await stubClipboard(page, 'deny');
    await start(page);
    const text = '[\n  {"id": 1},\n  {"id": 2}\n]';
    await paste(page, text);
    const view = page.getByRole('group', { name: COPY['label.view'] });
    // Switch to the tree view (CMP-TreeView arrives with F-006; until then the text view stays).
    await view.getByRole('button', { name: COPY['view.tree'] }).click();
    await copyButton(page).click();
    await expect(errorBar(page)).toHaveText(COPY['error.clipboard']);
    await expect(view.getByRole('button', { name: COPY['view.text'] })).toHaveAttribute('aria-pressed', 'true');
    await expect(content(page)).toBeVisible();
    await expect.poll(() => selectedText(page)).toBe(text);
  });

  test('F-007.AC8 F-007.R6 NFR-02 copying a 100 MB document shows COPY-progress.exporting with cancel, then copies', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    // Stubbed clipboard: the subject is the export's progress, not the browser's 0.5 GB copy.
    await stubClipboard(page, 'ok');
    await seamWorker(page, { slowMs: 12 });
    await start(page);
    await openFile(page, largeFixture('copy', 100 * MB));
    await expect(app(page)).toHaveAttribute('data-bytes', String(100 * MB), { timeout: 180_000 });
    await waitIdle(page);
    await copyButton(page).click();
    const bar = page.locator('[data-notice-id="progress.exporting"]');
    await expect(bar).toBeVisible({ timeout: 10_000 });
    await expect(bar).toContainText(copy('progress.exporting', { percent: '' }).replace('%', '').trim());
    await expect(bar.getByRole('button', { name: COPY['action.cancel'] })).toBeVisible();
    await expect(bar.getByRole('progressbar')).toBeVisible();
    await reportShot(page, 'F-007/exporting-dark.png');
    await expect(toast(page)).toHaveText(COPY['toast.copied'], { timeout: 60_000 });
    const size = await page.evaluate(() => window.__clip?.writes.at(-1)?.length ?? 0);
    expect(size).toBe(100 * MB);
  });

  test('F-007.R6 NFR-02 cancelling a long copy stops it: nothing is copied, no message, the tool is idle', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await stubClipboard(page, 'ok');
    await seamWorker(page, { slowMs: 12 });
    await start(page);
    await openFile(page, largeFixture('copy', 100 * MB));
    await expect(app(page)).toHaveAttribute('data-bytes', String(100 * MB), { timeout: 180_000 });
    await waitIdle(page);
    await copyButton(page).click();
    const bar = page.locator('[data-notice-id="progress.exporting"]');
    await bar.getByRole('button', { name: COPY['action.cancel'] }).click({ timeout: 10_000 });
    await waitIdle(page);
    await page.waitForTimeout(500);
    await expect(toast(page)).toHaveCount(0);
    await expect(page.locator('[data-notice-id^="error."]')).toHaveCount(0);
    expect(await page.evaluate(() => window.__clip?.writes.length)).toBe(0);
    await expect(copyButton(page)).toBeEnabled();
  });
});

test.describe('F-007 download', () => {
  test('F-007.AC2 a document loaded from orders.json and beautified downloads as orders.json with exactly the document text', async ({
    page,
  }) => {
    await start(page);
    await openFile(page, smallFixture('orders.json', '{"orders":[{"id":1,"total":9.5}]}'));
    await waitIdle(page);
    await expect(app(page)).toHaveAttribute('data-source-name', 'orders.json');
    // Beautify (F-002); until it lands the button leaves the document as it is.
    await toolbar(page).getByRole('button', { name: COPY['action.beautify'] }).click();
    await waitIdle(page);
    const shown = await docText(page);
    const downloading = page.waitForEvent('download');
    await downloadButton(page).click();
    const file = await downloading;
    expect(file.suggestedFilename()).toBe('orders.json');
    expect(fs.readFileSync(await file.path(), 'utf8')).toBe(shown);
  });

  test('F-007.AC2 RULE-10 a CRLF document is saved with its own line ending, byte for byte (UTF-8)', async ({
    page,
  }) => {
    await start(page);
    const text = '﻿{\r\n  "name": "Zoë 😀",\r\n  "n": 1.0e+2\r\n}\r\n';
    await openFile(page, { name: 'crlf.json', mimeType: 'application/json', buffer: Buffer.from(text) });
    await waitIdle(page);
    const downloading = page.waitForEvent('download');
    await downloadButton(page).click();
    const file = await downloading;
    expect(file.suggestedFilename()).toBe('crlf.json');
    expect(fs.readFileSync(await file.path())).toEqual(Buffer.from(text, 'utf8'));
  });

  test('F-007.AC3 a pasted document that was minified downloads as minified.json', async ({ page }) => {
    await start(page);
    await paste(page, '{\n  "a": [1, 2]\n}');
    await toolbar(page).getByRole('button', { name: COPY['action.minify'] }).click();
    await waitIdle(page);
    // RULE-10 needs the minify operation (F-003); the name rule itself is unit-tested.
    test.skip((await docText(page)) !== '{"a":[1,2]}', 'minify (F-003) is not merged yet');
    const downloading = page.waitForEvent('download');
    await downloadButton(page).click();
    const file = await downloading;
    expect(file.suggestedFilename()).toBe('minified.json');
    expect(fs.readFileSync(await file.path(), 'utf8')).toBe('{"a":[1,2]}');
  });

  test('RULE-10 a pasted document with no tool operation downloads as document.json', async ({ page }) => {
    await start(page);
    await paste(page, '[1, 2, 3]');
    const downloading = page.waitForEvent('download');
    await downloadButton(page).click();
    const file = await downloading;
    expect(file.suggestedFilename()).toBe('document.json');
    expect(fs.readFileSync(await file.path(), 'utf8')).toBe('[1, 2, 3]');
  });

  test('F-007.AC5 INV-02 NFR-01 downloading makes no network request', async ({ page, request }) => {
    await start(page);
    await paste(page, '{"secret": "token-123"}');
    await page.waitForTimeout(300);
    const seen: string[] = [];
    page.on('request', (r) => {
      if (!r.url().startsWith('blob:') && !r.url().startsWith('data:')) seen.push(r.url());
    });
    await request.get(`${ADMIN}/reset`);
    const downloading = page.waitForEvent('download');
    await downloadButton(page).click();
    await downloading;
    await page.waitForTimeout(500);
    const { log } = (await (await request.get(`${ADMIN}/log`)).json()) as { log: { path: string }[] };
    expect(log.map((e) => e.path)).toEqual([]);
    expect(seen).toEqual([]);
  });

  test('F-007.R2 embedded in the host (sandbox allow-downloads), the download works', async ({ page }) => {
    const frame = await embedded(page, 'clip=1');
    await pasteInto(frame, '{"embedded": true}');
    const downloading = page.waitForEvent('download');
    await downloadButton(frame).click();
    const file = await downloading;
    expect(file.suggestedFilename()).toBe('document.json');
    expect(fs.readFileSync(await file.path(), 'utf8')).toBe('{"embedded": true}');
  });
});

test('F-007.R1 F-007.R2 copy and download are unavailable while the document is empty', async ({ page }) => {
  await start(page);
  await expect(copyButton(page)).toBeDisabled();
  await expect(downloadButton(page)).toBeDisabled();
  await paste(page, '{}');
  await expect(copyButton(page)).toBeEnabled();
  await expect(downloadButton(page)).toBeEnabled();
  await reportShot(page, 'F-007/toolbar-enabled-dark.png');
});
