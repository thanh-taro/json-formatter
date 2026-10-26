// F-012 use the portal's language (RULE-19, RULE-16, ADR-0014) — end to end on the production
// build with the stub host: the address language from first display, live switches that keep
// every piece of work, ignored messages, browser fallbacks, identical results, number formats,
// plurals, the Vietnamese subsets of both typefaces, the 320 px fit, offline reopening and no font
// request after load. Matching, resolution and message checks are unit-tested in
// tests/unit/language.test.ts.
import fs from 'node:fs';
import { expect, test, type Browser, type Frame, type Page } from '@playwright/test';
import { CATALOG, type MessageId } from '../../src/copy/messages.gen';
import { ADMIN, HOST, instrument, TOOL } from './fixtures';
import { largeFixture, smallFixture } from './load-helpers';

type Lang = 'en-US' | 'vi-VN';
type Scope = Page | Frame;
const EN = CATALOG['en-US'];
const VI = CATALOG['vi-VN'];
const MB = 1_000_000;

declare global {
  interface Window {
    setLang?: (value: unknown) => void;
    postRaw?: (data: unknown) => void;
    fireSibling?: (msg: unknown) => void;
    resizeTool?: (w: number, h: number) => void;
    __inbound?: { origin: string; data: unknown }[];
    __marker?: string;
    __seenText?: string[];
    __clip?: { mode: 'ok' | 'deny'; writes: string[] };
  }
}

/** A COPY text in `lang` with its placeholders filled. */
function tx(lang: Lang, id: MessageId, params: Record<string, string | number> = {}): string {
  return (CATALOG[lang][id] as string).replace(/\{(\w+)\}/g, (w, k: string) => (k in params ? String(params[k]) : w));
}

/** Texts of `lang` that differ in the other language and have no placeholders. */
function onlyIn(lang: Lang): string[] {
  const other = lang === 'en-US' ? VI : EN;
  return (Object.keys(EN) as MessageId[])
    .filter((id) => CATALOG[lang][id] !== other[id] && !CATALOG[lang][id].includes('{'))
    .map((id) => CATALOG[lang][id]);
}

const app = (s: Scope) => s.locator('[data-screen="SCR-Formatter"]');
const content = (s: Scope) => s.locator('.cm-content');
const toolbar = (s: Scope, lang: Lang) => s.getByRole('toolbar', { name: CATALOG[lang]['label.toolbar'] });
const tb = (s: Scope, lang: Lang, id: MessageId) =>
  toolbar(s, lang).getByRole('button', { name: CATALOG[lang][id], exact: true });
const viewButton = (s: Scope, lang: Lang, id: 'view.text' | 'view.tree') =>
  s.getByRole('group', { name: CATALOG[lang]['label.view'] }).getByRole('button', { name: CATALOG[lang][id] });
const tree = (s: Scope, lang: Lang) => s.getByRole('tree', { name: CATALOG[lang]['label.tree'] });
const rows = (s: Scope) => s.locator('.tk-tree__row:not([hidden])');
const row = (s: Scope, key: string) =>
  rows(s).filter({ has: s.locator('.tk-tree__key').getByText(key, { exact: true }) });
const docText = async (s: Scope) => (await s.locator('.cm-line').allTextContents()).join('\n');
const sizeText = (s: Scope) => s.locator('.tk-statusbar__size');
const validity = (s: Scope) => s.locator('.tk-statusbar__validity');

async function idle(s: Scope) {
  await expect(app(s)).toHaveAttribute('data-busy', 'false', { timeout: 60_000 });
}

/** Dispatches a paste of `text` into the editor (replacing the selection). */
async function paste(s: Scope, text: string) {
  await content(s).focus();
  await content(s).evaluate((el, value) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', value);
    el.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true, composed: true }),
    );
  }, text);
}

/** Replaces the whole document with `text`. */
async function replaceWith(s: Scope, text: string) {
  await content(s).focus();
  await content(s).press('ControlOrMeta+a');
  await paste(s, text);
  await expect.poll(() => docText(s)).toBe(text);
  await idle(s);
}

/** Opens the stub host with `query`; returns the tool frame once it has rendered in `lang` and said ready. */
async function embed(page: Page, query: string, lang: Lang): Promise<Frame> {
  await page.goto(`${HOST}/host.html?${query}`);
  await expect(
    page.frameLocator('iframe[name="tool"]').getByRole('toolbar', { name: CATALOG[lang]['label.toolbar'] }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __host: { received: { fromTool: boolean }[] } }).__host.received.filter(
            (m) => m.fromTool,
          ).length,
      ),
    )
    .toBe(1);
  const frame = page.frame({ name: 'tool' })!;
  await idle(frame);
  return frame;
}

/** A standalone page whose browser prefers `languages` (navigator.languages, before any script). */
async function standalone(browser: Browser, languages: string[], path = '/') {
  const context = await browser.newContext({ locale: languages[0] ?? 'en-US' });
  await context.addInitScript((langs) => {
    Object.defineProperty(navigator, 'languages', { get: () => langs, configurable: true });
    Object.defineProperty(navigator, 'language', { get: () => langs[0] ?? 'en-US', configurable: true });
  }, languages);
  const page = await context.newPage();
  await page.goto(`${TOOL}${path}`);
  await expect(content(page)).toBeVisible();
  return { context, page };
}

/** Every user-facing text and accessible name in the tool's document (text nodes and attributes). */
function visibleStrings(s: Scope): Promise<string[]> {
  return s.evaluate(() => {
    const out: string[] = [];
    const walk = (root: Node) => {
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      for (let n: Node | null = w.currentNode; n; n = w.nextNode()) {
        if (n.nodeType === Node.TEXT_NODE) {
          const v = n.textContent?.trim();
          if (v && !n.parentElement?.closest('.cm-content, script, style, title')) out.push(v);
        } else {
          if (!(n instanceof Element)) continue;
          const e = n;
          for (const a of ['aria-label', 'title', 'placeholder']) {
            const v = e.getAttribute(a)?.trim();
            if (v) out.push(v);
          }
          if (e.shadowRoot) walk(e.shadowRoot);
        }
      }
    };
    walk(document.body);
    return out;
  });
}

/** Replaces the async clipboard with a recorder (in every frame). */
async function stubClipboard(page: Page) {
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
        state.writes.push(await (await items[0]!.getType('text/plain')).text());
      },
      writeText: async (text: string) => {
        state.writes.push(text);
      },
    };
    Object.defineProperty(window, 'ClipboardItem', { value: Item, configurable: true, writable: true });
    Object.defineProperty(Navigator.prototype, 'clipboard', { get: () => clipboard, configurable: true });
  });
}
const lastCopied = (s: Scope) => s.evaluate(() => window.__clip?.writes.at(-1) ?? null);

/**
 * Test-side worker seam (no product hook): a load's text and result are held back until
 * `window.__release()` (once; later loads pass), so its progress bar stays up (NFR-02).
 */
async function holdLoads(page: Page) {
  await page.addInitScript(() => {
    const Native = window.Worker;
    const held: (() => void)[] = [];
    let holding = true;
    (window as unknown as { __release: () => void }).__release = () => {
      holding = false;
      for (const f of held.splice(0)) f();
    };
    class Held extends Native {
      override addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean) {
        if (type !== 'message') return super.addEventListener(type, listener, options);
        const fn = typeof listener === 'function' ? listener : (e: Event) => listener.handleEvent(e);
        return super.addEventListener(
          'message',
          (e: Event) => {
            const type = ((e as MessageEvent).data as { type?: string }).type;
            // progress passes (the watchdog must keep seeing the worker alive)
            if (holding && (type === 'chunk' || type === 'loaded')) held.push(() => fn(e));
            else fn(e);
          },
          options,
        );
      }
    }
    window.Worker = Held;
  });
}
const release = (s: Scope) => s.evaluate(() => (window as unknown as { __release: () => void }).__release());

test.beforeEach(async ({ page }) => {
  await instrument(page);
});

// ---- first display -----------------------------------------------------------------------------

test('F-012.AC1 vi-VN in the address: Vietnamese from first display, page language vi-VN, no English first', async ({
  page,
}) => {
  // Record, in every frame, every text that ever reached the DOM (including replaced values).
  await page.addInitScript(() => {
    window.__seenText = [];
    const seen = (v: string | null | undefined) => {
      const s = v?.trim();
      if (s) window.__seenText!.push(s);
    };
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'characterData') seen(r.oldValue);
        if (r.type === 'attributes') seen((r.target as Element).getAttribute(r.attributeName!));
        for (const n of r.addedNodes) {
          seen(n.textContent);
          if (n instanceof Element)
            for (const e of [n, ...n.querySelectorAll('*')])
              for (const a of ['aria-label', 'title', 'placeholder']) seen(e.getAttribute(a));
        }
      }
    }).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
      characterDataOldValue: true,
      attributes: true,
      attributeFilter: ['aria-label', 'title', 'placeholder'],
    });
  });
  const frame = await embed(page, 'theme=dark&lang=vi-VN', 'vi-VN');
  await expect(frame.locator('html')).toHaveAttribute('lang', 'vi-VN');
  await expect(frame.getByText(VI['empty.title'])).toBeVisible();
  await expect(validity(frame)).toHaveText(VI['status.empty']);
  await expect(frame.getByRole('button', { name: VI['privacy.badge'] })).toBeVisible();
  await expect(frame.getByRole('link', { name: VI['privacy.source_label'] })).toBeVisible();
  await expect(frame.locator('.cm-content')).toHaveAttribute('aria-label', VI['label.editor']);
  const english = new Set(onlyIn('en-US'));
  const shown = await visibleStrings(frame);
  expect(shown.filter((s) => english.has(s))).toEqual([]);
  expect(shown).toContain(VI['empty.body']);
  // Nothing English was ever shown before (whole texts of English-only strings).
  const ever = await frame.evaluate(() => window.__seenText ?? []);
  expect(ever.filter((s) => english.has(s))).toEqual([]);
  expect(await frame.evaluate(() => window.__csp)).toEqual([]);
  expect(await frame.evaluate(() => document.title)).toBe('JSON Formatter');
});

test('F-012.AC2 en-US in the address: English strings, page language en-US', async ({ page }) => {
  const frame = await embed(page, 'theme=dark&lang=en-US', 'en-US');
  await expect(frame.locator('html')).toHaveAttribute('lang', 'en-US');
  await expect(frame.getByText(EN['empty.title'])).toBeVisible();
  await expect(validity(frame)).toHaveText(EN['status.empty']);
  const vietnamese = new Set(onlyIn('vi-VN'));
  expect((await visibleStrings(frame)).filter((s) => vietnamese.has(s))).toEqual([]);
});

// ---- live switch -------------------------------------------------------------------------------

test('F-012.AC3 a language message switches live, keeping document, selection, view, expansion, find, indent and undo', async ({
  page,
}) => {
  const DOC = '{\n  "a": {\n    "b": [1, 2]\n  },\n  "c": "x"\n}';
  const frame = await embed(page, 'theme=dark&lang=vi-VN', 'vi-VN');
  await frame.evaluate(() => (window.__marker = 'same document'));
  await paste(frame, DOC);
  await expect.poll(() => docText(frame)).toBe(DOC);
  await idle(frame);
  // an edit (typing), the indent style, find with a query (selects the first match)
  await content(frame).press('ControlOrMeta+End');
  await content(frame).pressSequentially(' ');
  await expect.poll(() => docText(frame)).toBe(DOC + ' ');
  await frame.getByRole('combobox', { name: VI['label.indent'] }).selectOption('4');
  await content(frame).press('ControlOrMeta+f');
  await frame.getByRole('searchbox', { name: VI['search.placeholder'] }).fill('"b"');
  await expect(frame.locator('.tk-search__count')).toHaveText(tx('vi-VN', 'search.count', { current: 1, total: 1 }));
  // the selection is the match; the cursor (its head) is shown in the status bar
  const digits = async () => (await frame.locator('.tk-statusbar__cursor').textContent())?.replace(/\D+/g, ' ').trim();
  const cursor = await digits();
  expect(cursor).toBe('3 8');
  // the tree view with a node expanded
  await viewButton(frame, 'vi-VN', 'view.tree').click();
  await expect(tree(frame, 'vi-VN')).toBeVisible();
  await expect(row(frame, 'a')).toBeVisible();
  if ((await row(frame, 'a').getAttribute('aria-expanded')) !== 'true')
    await row(frame, 'a').locator('.tk-tree__twisty').click();
  await expect(row(frame, 'b')).toHaveAttribute('aria-expanded', 'false');
  await row(frame, 'b').locator('.tk-tree__twisty').click();
  await expect(row(frame, 'b')).toHaveAttribute('aria-expanded', 'true');
  await expect(row(frame, '0')).toBeVisible();
  await row(frame, 'b').click();
  await expect(frame.locator('.tk-tree__path')).toHaveText('$.a.b');
  const rowCount = await rows(frame).count();
  const announced = await frame.locator('.tk-statusbar [role="status"]').textContent();

  await page.evaluate(() => window.setLang!('en-US'));

  await expect(frame.locator('html')).toHaveAttribute('lang', 'en-US');
  await expect(toolbar(frame, 'en-US')).toBeVisible();
  await expect(tree(frame, 'en-US')).toBeVisible();
  // nothing is announced: the polite status region keeps its text (F-012 UX notes)
  expect(await frame.locator('.tk-statusbar [role="status"]').textContent()).toBe(announced);
  await expect(viewButton(frame, 'en-US', 'view.tree')).toHaveAttribute('aria-pressed', 'true');
  await expect(row(frame, 'b')).toHaveAttribute('aria-expanded', 'true');
  await expect(row(frame, 'b')).toHaveAttribute('aria-selected', 'true');
  await expect(row(frame, 'b').locator('.tk-tree__value')).toHaveText(tx('en-US', 'tree.count_items', { count: 2 }));
  await expect(frame.locator('.tk-tree__header').getByRole('button', { name: EN['action.copy_path'] })).toBeEnabled();
  expect(await rows(frame).count()).toBe(rowCount);
  await expect(frame.getByRole('combobox', { name: EN['label.indent'] })).toHaveValue('4');
  await viewButton(frame, 'en-US', 'view.text').click();
  await expect(frame.getByRole('searchbox', { name: EN['search.placeholder'] })).toHaveValue('"b"');
  await expect(frame.locator('.tk-search__count')).toHaveText(tx('en-US', 'search.count', { current: 1, total: 1 }));
  await expect(frame.locator('.cm-content')).toHaveAttribute('aria-label', EN['label.editor']);
  expect(await docText(frame)).toBe(DOC + ' ');
  await expect(frame.locator('.tk-statusbar__cursor')).toHaveText(/^Ln \d+, Col \d+$/);
  expect(await digits()).toBe(cursor);
  // not reloaded
  expect(await frame.evaluate(() => window.__marker)).toBe('same document');
  expect(await page.evaluate(() => (window as unknown as { __host: { loads: number } }).__host.loads)).toBe(1);
  // the selection is still the match: closing find and typing replaces exactly it
  await frame.getByRole('searchbox', { name: EN['search.placeholder'] }).press('Escape');
  await expect(content(frame)).toBeFocused();
  await content(frame).pressSequentially('Z');
  await expect.poll(() => docText(frame)).toBe(DOC.replace('"b"', 'Z') + ' ');
  // undo still restores the edit made before the switch (consecutive typing may be one step)
  await content(frame).press('ControlOrMeta+z');
  await expect.poll(() => docText(frame)).not.toContain('Z');
  if ((await docText(frame)) !== DOC) await content(frame).press('ControlOrMeta+z');
  await expect.poll(() => docText(frame)).toBe(DOC);
  expect(await frame.evaluate(() => window.__csp)).toEqual([]);
});

test('F-012.AC3 F-012 edge cases: the same language again changes nothing; theme and language apply independently', async ({
  page,
}) => {
  const frame = await embed(page, 'theme=dark&lang=vi-VN', 'vi-VN');
  await page.evaluate(() => {
    window.setLang!('vi-VN');
    window.setLang!('vi-VN');
    window.postRaw!({ type: 'taro:theme', value: 'light' });
    window.setLang!('en');
  });
  await expect(frame.locator('html')).toHaveAttribute('lang', 'en-US');
  await expect(frame.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(toolbar(frame, 'en-US')).toBeVisible();
  await page.evaluate(() => window.setLang!('vi'));
  await expect(frame.locator('html')).toHaveAttribute('lang', 'vi-VN');
  await expect(frame.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('F-012.AC4 language messages from another origin, another frame or with an unsupported value are ignored', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.__inbound = [];
    window.addEventListener('message', (e) => window.__inbound?.push({ origin: e.origin, data: e.data }));
  });
  const frame = await embed(page, 'theme=dark&lang=vi-VN&sibling=1', 'vi-VN');
  const before = await frame.evaluate(() => window.__inbound?.length ?? 0);
  // an unlisted origin in a sibling frame (not the embedding page) reaches the tool frame
  await page.evaluate(() => window.fireSibling!({ type: 'taro:language', value: 'en-US' }));
  // the embedding page, with unsupported values
  await page.evaluate(() => {
    window.setLang!('fr-FR');
    window.setLang!(42);
    window.postRaw!({ type: 'taro:language' });
    window.postRaw!({ type: 'taro:lang', value: 'en-US' });
  });
  await expect.poll(() => frame.evaluate(() => window.__inbound?.length ?? 0)).toBe(before + 5);
  await page.waitForTimeout(200);
  await expect(frame.locator('html')).toHaveAttribute('lang', 'vi-VN');
  await expect(toolbar(frame, 'vi-VN')).toBeVisible();
  await expect(validity(frame)).toHaveText(VI['status.empty']);
  // An allowed embedding page from an unlisted origin cannot exist (frame-ancestors, F-008.AC8);
  // the origin check itself: tests/unit/language.test.ts F-012.AC4.
});

// ---- fallbacks ---------------------------------------------------------------------------------

test('F-012.AC5 no language in the address: the browser preferences decide, else en-US', async ({ browser }) => {
  for (const [languages, expected] of [
    [['vi'], 'vi-VN'],
    [['fr-FR', 'vi'], 'vi-VN'],
    [['fr-FR', 'en-GB', 'vi'], 'en-US'],
    [['fr-FR'], 'en-US'],
  ] as const) {
    const { context, page } = await standalone(browser, [...languages], '/?theme=dark');
    await expect(page.locator('html'), languages.join()).toHaveAttribute('lang', expected);
    await expect(toolbar(page, expected)).toBeVisible();
    await expect(validity(page)).toHaveText(CATALOG[expected]['status.empty']);
    await context.close();
  }
});

test('F-012.AC6 an unsupported address language behaves as if none was passed', async ({ browser }) => {
  for (const [languages, expected] of [
    [['fr-FR', 'vi'], 'vi-VN'],
    [['fr-FR'], 'en-US'],
  ] as const) {
    const { context, page } = await standalone(browser, [...languages], '/?lang=fr-FR');
    await expect(page.locator('html')).toHaveAttribute('lang', expected);
    await expect(toolbar(page, expected)).toBeVisible();
    await context.close();
  }
});

// ---- results -----------------------------------------------------------------------------------

test('F-012.AC7 document text, issues, copied text and download names are identical in vi-VN and en-US', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await stubClipboard(page);
  const run = async (lang: Lang) => {
    await page.goto(`/?theme=dark&lang=${lang}`);
    await expect(toolbar(page, lang)).toBeVisible();
    await idle(page);
    const out: Record<string, unknown> = {};
    // validate: codes and positions
    await paste(page, '{\n  "a": [1, 2,],\n  \'b\': 1,\n  "a": 3\n}');
    await expect(validity(page)).toHaveAttribute('data-validity', 'invalid');
    out['issues'] = await page
      .locator('.tk-issue')
      .evaluateAll((els) =>
        els.map((e) => [
          e.querySelector('.tk-issue__code')?.textContent,
          e.querySelector('.tk-issue__location')?.textContent?.replace(/\D+/g, ' ').trim(),
        ]),
      );
    // warnings of a valid document
    await replaceWith(page, '{"d": 1, "d": 2, "big": 12345678901234567890}');
    await expect(validity(page)).toHaveAttribute('data-validity', 'valid');
    await page.getByRole('tab', { name: new RegExp(CATALOG[lang]['issue.warning']) }).click();
    out['warnings'] = await page
      .locator('.tk-issue')
      .evaluateAll((els) =>
        els.map((e) => [
          e.querySelector('.tk-issue__code')?.textContent,
          e.querySelector('.tk-issue__location')?.textContent?.replace(/\D+/g, ' ').trim(),
        ]),
      );
    await replaceWith(page, '{"id":1,"items":[{"k":"v"},2],"n":null}');
    await expect(validity(page)).toHaveAttribute('data-validity', 'valid');
    // beautify, re-indent (4 spaces), minify
    await tb(page, lang, 'action.beautify').click();
    await idle(page);
    out['beautified'] = await docText(page);
    await page.getByRole('combobox', { name: CATALOG[lang]['label.indent'] }).selectOption('4');
    await tb(page, lang, 'action.reindent').click();
    await idle(page);
    out['reindented'] = await docText(page);
    await tb(page, lang, 'action.minify').click();
    await idle(page);
    out['minified'] = await docText(page);
    // copy the document
    await tb(page, lang, 'action.copy').click();
    await expect.poll(() => lastCopied(page)).toBe(out['minified']);
    // copy path and value from the tree
    await viewButton(page, lang, 'view.tree').click();
    await expect(tree(page, lang)).toBeVisible();
    await row(page, 'items').click();
    const header = page.locator('.tk-tree__header');
    await header.getByRole('button', { name: CATALOG[lang]['action.copy_path'] }).click();
    await expect.poll(() => lastCopied(page)).toBe('$.items');
    await header.getByRole('button', { name: CATALOG[lang]['action.copy_value'] }).click();
    await expect.poll(() => lastCopied(page)).toBe('[{"k":"v"},2]');
    out['kinds'] = await rows(page).locator('.tk-tree__kind').allTextContents();
    await viewButton(page, lang, 'view.text').click();
    // download
    const downloading = page.waitForEvent('download');
    await tb(page, lang, 'action.download').click();
    const file = await downloading;
    out['download'] = [file.suggestedFilename(), fs.readFileSync(await file.path(), 'utf8')];
    return out;
  };
  const vi = await run('vi-VN');
  const en = await run('en-US');
  expect(vi['minified']).toBe('{"id":1,"items":[{"k":"v"},2],"n":null}');
  expect(vi['download']).toEqual(['minified.json', vi['minified']]);
  expect((vi['issues'] as unknown[]).length).toBe(1);
  expect((vi['warnings'] as unknown[]).length).toBe(2);
  expect(vi).toEqual(en);
});

test('F-012.AC8 a 1,234-line document of 1,500,000 bytes shows 1,5 MB · 1.234 in vi-VN and 1.5 MB · 1,234 in en-US', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const lines = 1234;
  const body = Array.from({ length: lines - 1 }, (_, i) => `"${i}"`.padEnd(1200, ' ')).join('\n') + '\n';
  const text = body + 'x'.repeat(1_500_000 - body.length);
  expect(text.length).toBe(1_500_000);
  const frame = await embed(page, 'theme=dark&lang=vi-VN', 'vi-VN');
  await paste(frame, text);
  await expect(app(frame)).toHaveAttribute('data-lines', String(lines), { timeout: 30_000 });
  await idle(frame);
  await expect(sizeText(frame)).toHaveText('1,5 MB · 1.234 dòng');
  await page.evaluate(() => window.setLang!('en-US'));
  await expect(sizeText(frame)).toHaveText('1.5 MB · 1,234 lines');
});

test('F-012.AC9 en-US uses the singular for a count of 1; vi-VN has no plural change', async ({ page }) => {
  const frame = await embed(page, 'theme=dark&lang=en-US', 'en-US');
  await paste(frame, '{"o": {"k": 1}, "a": [1], "d": 1, "d": 2}');
  await expect(validity(frame)).toHaveAttribute('data-validity', 'valid');
  await expect(sizeText(frame)).toHaveText(/ · 1 line$/);
  await expect(validity(frame)).toHaveText('Valid JSON · 1 warning');
  await viewButton(frame, 'en-US', 'view.tree').click();
  await expect(row(frame, 'o').locator('.tk-tree__value')).toHaveText('1 key');
  await expect(row(frame, 'a').locator('.tk-tree__value')).toHaveText('1 item');
  await page.evaluate(() => window.setLang!('vi-VN'));
  await expect(row(frame, 'o').locator('.tk-tree__value')).toHaveText('1 khoá');
  await expect(row(frame, 'a').locator('.tk-tree__value')).toHaveText('1 phần tử');
  await expect(sizeText(frame)).toHaveText(/ · 1 dòng$/);
  await expect(validity(frame)).toHaveText('JSON hợp lệ · 1 cảnh báo');
});

// ---- typefaces ---------------------------------------------------------------------------------

test('F-012.AC10 Vietnamese UI text renders in the tool UI and mono typefaces', async ({ page }) => {
  const frame = await embed(page, 'theme=dark&lang=vi-VN', 'vi-VN');
  await paste(frame, '{"tên": "Nguyễn Văn Đức", "đường": "ộ ư"}');
  await idle(frame);
  const fonts = await frame.evaluate(async () => {
    await document.fonts.ready;
    const faces = [...document.fonts].map((f) => [f.family.replace(/["']/g, ''), f.status]);
    return {
      ui: document.fonts.check('400 16px Manrope', 'ễộưđ'),
      mono: document.fonts.check('400 16px "JetBrains Mono"', 'ễộưđ'),
      loaded: faces
        .filter(([, s]) => s === 'loaded')
        .map(([f]) => f)
        .sort(),
      body: getComputedStyle(document.querySelector('.tk-toolbar button')!).fontFamily,
      status: getComputedStyle(document.querySelector('.tk-statusbar__cursor')!).fontFamily,
    };
  });
  expect(fonts.ui).toBe(true);
  expect(fonts.mono).toBe(true);
  // Latin and Vietnamese subsets of both faces
  expect(fonts.loaded).toEqual(['JetBrains Mono', 'JetBrains Mono', 'Manrope', 'Manrope']);
  expect(fonts.body).toContain('Manrope');
  expect(fonts.status).toContain('JetBrains Mono');
  await expect(frame.locator('.tk-statusbar__cursor')).toHaveText(/^Dòng \d+, cột \d+$/);
});

test('F-012.AC14 in vi-VN the tree value kinds read in English and are marked as English', async ({ page }) => {
  const frame = await embed(page, 'theme=dark&lang=vi-VN', 'vi-VN');
  await paste(frame, '{"o": {}, "a": [], "s": "x", "n": 1, "b": true, "z": null}');
  await idle(frame);
  await viewButton(frame, 'vi-VN', 'view.tree').click();
  await expect(tree(frame, 'vi-VN')).toBeVisible();
  await expect(row(frame, 'z')).toBeVisible();
  const kinds = await rows(frame)
    .locator('.tk-tree__kind')
    .evaluateAll((els) => els.map((e) => [e.textContent, e.getAttribute('lang')]));
  expect(kinds).toEqual([
    ['object', 'en'],
    ['object', 'en'],
    ['array', 'en'],
    ['string', 'en'],
    ['number', 'en'],
    ['boolean', 'en'],
    ['null', 'en'],
  ]);
  await expect(frame.locator('html')).toHaveAttribute('lang', 'vi-VN');
});

// ---- notices, dialog, progress -------------------------------------------------------------------

test('F-012.AC15 a large-document notice switches language with the size formatted for it', async ({ page }) => {
  test.setTimeout(120_000);
  // RULE-02: COPY-notice.large is shown on entering the large tier (over 10 MB); see report.
  const file = largeFixture('lang-large', 15 * MB);
  const frame = await embed(page, 'theme=dark&lang=en-US', 'en-US');
  const chooser = page.waitForEvent('filechooser');
  await tb(frame, 'en-US', 'action.open').click();
  await (await chooser).setFiles(file);
  const bar = frame.locator('[data-notice-id="notice.large"]');
  await expect(bar).toContainText(tx('en-US', 'notice.large', { size: '15.0 MB' }), { timeout: 60_000 });
  const seq = await bar.getAttribute('data-notice-seq');
  await page.evaluate(() => window.setLang!('vi-VN'));
  await expect(bar).toContainText(tx('vi-VN', 'notice.large', { size: '15,0 MB' }));
  await expect(bar.getByRole('button', { name: VI['action.dismiss'] })).toBeVisible();
  // the same bar, re-rendered (not shown again) and not announced again (F-012 UX notes)
  expect(await bar.getAttribute('data-notice-seq')).toBe(seq);
  await expect(bar).toHaveAttribute('aria-live', 'off');
});

test('F-012.AC15 an open large-content dialog switches language; the pending choice is unchanged', async ({ page }) => {
  test.setTimeout(240_000);
  const file = largeFixture('verylarge', 150 * MB);
  const frame = await embed(page, 'theme=dark&lang=en-US', 'en-US');
  await paste(frame, '{"keep": true}');
  await idle(frame);
  const chooser = page.waitForEvent('filechooser');
  await tb(frame, 'en-US', 'action.open').click();
  await (await chooser).setFiles(file);
  const dialog = frame.getByRole('dialog', { name: EN['confirm.title'] });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(tx('en-US', 'confirm.very_large', { size: '150.0 MB' }));
  await page.evaluate(() => window.setLang!('vi-VN'));
  const vi = frame.getByRole('dialog', { name: VI['confirm.title'] });
  await expect(vi).toBeVisible();
  await expect(vi).toContainText(tx('vi-VN', 'confirm.very_large', { size: '150,0 MB' }));
  await expect(vi.getByRole('button', { name: VI['action.cancel'] })).toBeFocused();
  await vi.getByRole('button', { name: VI['action.cancel'] }).click();
  await expect(vi).toBeHidden();
  expect(await docText(frame)).toBe('{"keep": true}');
});

test('F-012.AC15 a progress bar switches language; the operation is unchanged', async ({ page }) => {
  await holdLoads(page);
  const frame = await embed(page, 'theme=dark&lang=en-US', 'en-US');
  const json = JSON.stringify({ rows: Array.from({ length: 2000 }, (_, i) => ({ i, name: `row ${i}` })) });
  const file = smallFixture('lang-progress.json', json);
  const chooser = page.waitForEvent('filechooser');
  await tb(frame, 'en-US', 'action.open').click();
  await (await chooser).setFiles(file);
  const progress = frame.locator('.tk-notice--progress');
  await expect(progress).toContainText(/^Reading file… \d+%/, { timeout: 10_000 });
  await page.evaluate(() => window.setLang!('vi-VN'));
  await expect(progress).toContainText(/^Đang đọc tệp… \d+%/);
  await expect(progress.getByRole('button', { name: VI['action.cancel'] })).toBeVisible();
  await release(frame);
  await idle(frame);
  await expect(app(frame)).toHaveAttribute('data-bytes', String(json.length));
  await expect(app(frame)).toHaveAttribute('data-source-name', 'lang-progress.json');
});

// ---- 320 px --------------------------------------------------------------------------------------

/** No horizontal page scroll; every visible control and message lies inside the width, unclipped. */
async function fits(page: Page, state: string) {
  const r = await page.evaluate(() => {
    const width = window.innerWidth;
    const bad: string[] = [];
    const scroll = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    if (scroll > width) bad.push(`page scrolls: ${scroll} > ${width}`);
    const sel =
      'button, select, input, label, a, [role="tab"], .tk-notice__message, .tk-notice__progress-label, .tk-statusbar > *, .tk-dialog__title, .tk-dialog__message, .tk-tree__message-text, .tk-search__count, .tk-privacy__body';
    for (const e of document.querySelectorAll<HTMLElement>(sel)) {
      const style = getComputedStyle(e);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      if (e.offsetParent === null && style.position !== 'fixed') continue;
      if (e.closest('.tk-visually-hidden, [hidden]')) continue;
      if (e.matches('.tk-visually-hidden')) continue;
      const r = e.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const name = (e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 40) || e.className;
      if (r.left < -0.5 || r.right > width + 0.5) bad.push(`outside: ${name} ${r.left}–${r.right}`);
      // a text that does not fit its box is cut (ellipsis or overflow hidden)
      if (e.scrollWidth > e.clientWidth + 1 && style.overflowX !== 'visible') bad.push(`clipped: ${name}`);
      for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (s.overflowX === 'visible' || p.matches('.tk-editor-host, .tk-tree__viewport')) continue;
        const pr = p.getBoundingClientRect();
        if (r.left < pr.left - 0.5 || r.right > pr.right + 0.5) {
          bad.push(`clipped by ${p.className}: ${name}`);
          break;
        }
      }
    }
    return bad;
  });
  expect.soft(r, state).toEqual([]);
}

test('F-012.AC11 vi-VN at 320 px: every SCR-Formatter state fits without horizontal scrolling or clipped labels', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await holdLoads(page);
  await stubClipboard(page);
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/?theme=dark&lang=vi-VN');
  await expect(toolbar(page, 'vi-VN')).toBeVisible();
  await idle(page);
  await fits(page, 'empty');
  const more = tb(page, 'vi-VN', 'action.more');

  // default (valid, warnings), with the status bar facts
  await paste(page, '{\n  "id": 1,\n  "id": 2,\n  "items": [1, 2, 3],\n  "name": "Nguyễn"\n}');
  await expect(validity(page)).toHaveAttribute('data-validity', 'valid');
  await fits(page, 'default');
  // the overflow menu
  await more.click();
  await expect(page.locator('.tk-menu')).toBeVisible();
  await fits(page, 'menu open');
  await page.keyboard.press('Escape');
  // privacy details
  await page.getByTestId('privacy-badge').click();
  await expect(page.locator('.tk-privacy')).toBeVisible();
  await fits(page, 'privacy details');
  await page.keyboard.press('Escape');
  // find
  await content(page).press('ControlOrMeta+f');
  await page.getByRole('searchbox').fill('id');
  await fits(page, 'find');
  await page.getByRole('searchbox').fill('zzz');
  await expect(page.locator('.tk-search__count')).toHaveText(VI['search.none']);
  await fits(page, 'find none');
  await page.keyboard.press('Escape');
  // toast
  await tb(page, 'vi-VN', 'action.copy').click();
  await expect(page.locator('.tk-toast')).toHaveText(VI['toast.copied']);
  await fits(page, 'toast');
  // tree
  await viewButton(page, 'vi-VN', 'view.tree').click();
  await expect(tree(page, 'vi-VN')).toBeVisible();
  await row(page, 'items').click();
  await fits(page, 'tree');
  await viewButton(page, 'vi-VN', 'view.text').click();
  // error, issue panel open
  await replaceWith(page, '{\n  "a": [1, 2,],\n  "b": 1\n');
  await expect(validity(page)).toHaveAttribute('data-validity', 'invalid');
  await fits(page, 'error');
  await viewButton(page, 'vi-VN', 'view.tree').click();
  await expect(page.locator('.tk-tree__message-text')).toHaveText(VI['tree.invalid']);
  await fits(page, 'tree invalid');
  await viewButton(page, 'vi-VN', 'view.text').click();
  // an error bar
  await replaceWith(page, '{"ok": true}');
  await tb(page, 'vi-VN', 'action.reindent')
    .isVisible()
    .then(async (shown) => {
      if (shown) await tb(page, 'vi-VN', 'action.reindent').click();
      else {
        await more.click();
        await page.locator('.tk-menu').getByRole('button', { name: VI['action.reindent'], exact: true }).click();
      }
    });
  await expect(page.locator('[data-notice-id="notice.no_indent"]')).toBeVisible();
  await fits(page, 'notice bar');

  const openFromMenu = async (file: string) => {
    const chooser = page.waitForEvent('filechooser');
    await more.click();
    await page.locator('.tk-menu').getByRole('button', { name: VI['action.open'], exact: true }).click();
    await (await chooser).setFiles(file);
  };
  // confirm (very large)
  await openFromMenu(largeFixture('verylarge', 150 * MB));
  const dialog = page.getByRole('dialog', { name: VI['confirm.title'] });
  await expect(dialog).toBeVisible();
  await fits(page, 'confirm');
  await dialog.getByRole('button', { name: VI['action.cancel'] }).click();
  await expect(dialog).toBeHidden();
  // loading (progress bar) and then large
  await openFromMenu(largeFixture('lang-large', 15 * MB));
  await expect(page.locator('.tk-notice--progress')).toBeVisible({ timeout: 30_000 });
  await fits(page, 'loading');
  await release(page);
  await expect(page.locator('[data-notice-id="notice.large"]')).toBeVisible({ timeout: 60_000 });
  await idle(page);
  await fits(page, 'large');
});

// ---- offline and fonts ---------------------------------------------------------------------------

const CACHE = 'json-formatter-v1';
const admin = (page: Page, p: string) => page.request.get(`${ADMIN}${p}`);

test.describe('F-012 offline and font requests', () => {
  test.afterEach(async ({ page }) => {
    await admin(page, '/offline?on=0');
  });

  test('F-012.AC13 first opened in en-US, reopened offline in vi-VN: Vietnamese text in both typefaces', async ({
    page,
  }) => {
    await admin(page, '/reset');
    await page.goto('/?theme=dark&lang=en-US');
    await expect(toolbar(page, 'en-US')).toBeVisible();
    // the seed holds both Vietnamese subsets (not just the browser's own cache)
    await expect
      .poll(
        () =>
          page.evaluate(async (name) => {
            const keys = await (await caches.open(name)).keys();
            return keys.map((r) => new URL(r.url).pathname).filter((p) => p.endsWith('.woff2')).length;
          }, CACHE),
        { timeout: 15_000 },
      )
      .toBe(4);
    await admin(page, '/offline?on=1');
    await page.goto('/?theme=dark&lang=vi-VN');
    await expect(toolbar(page, 'vi-VN')).toBeVisible();
    const log = (await (await admin(page, '/log')).json()) as { log: { path: string }[] };
    expect(log.log.map((e) => e.path)).toContain('/?theme=dark&lang=vi-VN'); // refused: served offline
    await paste(page, '{"tên": "Nguyễn Văn Đức"}');
    await idle(page);
    const fonts = await page.evaluate(async () => {
      await document.fonts.ready;
      return {
        ui: document.fonts.check('400 16px Manrope', 'ễộưđ'),
        mono: document.fonts.check('400 16px "JetBrains Mono"', 'ễộưđ'),
        loaded: [...document.fonts].filter((f) => f.status === 'loaded').length,
      };
    });
    expect(fonts).toEqual({ ui: true, mono: true, loaded: 4 });
    await expect(validity(page)).toHaveText(VI['status.valid']);
  });

  for (const lang of ['en-US', 'vi-VN'] as const) {
    test(`F-012.AC13 NFR-01 no font request after the initial load, whatever is typed or switched (${lang})`, async ({
      page,
    }) => {
      const fontRequests: string[] = [];
      const frame = await embed(page, `theme=dark&lang=${lang}`, lang);
      await frame.evaluate(async () => {
        if (document.readyState !== 'complete') await new Promise((r) => addEventListener('load', r, { once: true }));
        await document.fonts.ready;
      });
      await page.waitForTimeout(300);
      const mark = ((await (await admin(page, '/log')).json()) as { now: number }).now;
      page.on('request', (r) => {
        if (/\.woff2?(\?|$)/.test(r.url())) fontRequests.push(r.url());
      });
      await paste(frame, '{"Nguyễn": "Đặng ộ ư ơ ễ", "tiếng Việt": [1, 2]}');
      await idle(frame);
      await viewButton(frame, lang, 'view.tree').click();
      await expect(tree(frame, lang)).toBeVisible();
      const other: Lang = lang === 'en-US' ? 'vi-VN' : 'en-US';
      await page.evaluate((l) => window.setLang!(l), other);
      await expect(frame.locator('html')).toHaveAttribute('lang', other);
      await page.evaluate((l) => window.setLang!(l), lang);
      await expect(frame.locator('html')).toHaveAttribute('lang', lang);
      await page.waitForTimeout(500);
      const late = ((await (await admin(page, '/log')).json()) as { log: { t: number; path: string }[] }).log
        .filter((e) => e.t > mark && /\.woff2?$/.test(e.path))
        .map((e) => e.path);
      expect(late).toEqual([]);
      expect(fontRequests).toEqual([]);
    });
  }
});
