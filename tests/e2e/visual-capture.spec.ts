// QA visual capture (not a regression assertion): with VISUAL=1 it writes one screenshot per
// designed state (design/canvas boards) in both themes to .build-my-app/reports/qa/visual/app/,
// for comparison against the approved boards. Skipped in ordinary runs. Chromium only; narrow
// states use 390x760 with a coarse pointer (touch emulation).
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { instrument } from './fixtures';
import { app, content, COPY, drop, largeFixture, openFile, paste, ROOT, seamWorker, waitIdle } from './load-helpers';
import { recordClipboard } from './m1-session';

const OUT = path.join(ROOT, '.build-my-app/reports/qa/visual/app');
const MB = 1_000_000;
const THEMES = ['dark', 'light'] as const;

test.skip(!process.env['VISUAL'], 'set VISUAL=1 to capture designed states');
test.skip(({ browserName }) => browserName !== 'chromium', 'visual capture runs in Chromium');
test.setTimeout(300_000);

const ORDER = {
  order: {
    id: '9007199254740993',
    ref: '12345678901234567890',
    status: 'shipped',
    total: '1499.50',
    items: [
      { sku: 'TK-204', qty: 2, gift: false },
      { sku: 'TK-311', qty: 1, gift: true },
    ],
    coupon: null,
    customer: { name: 'Mai Tran', email: 'mai@example.com' },
  },
};
const orderText = (indent?: number) =>
  JSON.stringify(ORDER, null, indent)
    .replace('"9007199254740993"', '9007199254740993')
    .replace('"12345678901234567890"', '12345678901234567890')
    .replace('"1499.50"', '1499.50');
const ORDER_MIN = orderText();
const ORDER_PRETTY = orderText(2);
const ORDER_BAD = ORDER_PRETTY.replace('      }\n    ]', '      },\n    ]');

const EVENTS_TEXT = (() => {
  const types = ['order.created', 'order.paid', 'order.shipped'];
  const events = Array.from({ length: 250 }, (_, i) => ({
    id: `evt_${String(i).padStart(4, '0')}`,
    type: types[i % 3],
    at: `2026-10-12T08:${String(i % 60).padStart(2, '0')}:03Z`,
    amount: '@' + (10.5 + i * 37).toFixed(2),
  }));
  return JSON.stringify({ page: 1, events, next: '/v1/events?page=2' }, null, 2).replace(/"@([\d.]+)"/g, '$1');
})();

async function shot(page: Page, name: string, theme: string) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, `${name}.${theme}.png`), caret: 'initial' });
}

async function start(page: Page, theme: string) {
  await page.goto(`/?theme=${theme}`);
  await expect(content(page)).toBeVisible();
  await expect(app(page)).toHaveAttribute('data-busy', 'false');
}
async function load(page: Page, text: string) {
  await content(page).focus();
  await page.keyboard.press('ControlOrMeta+a');
  await paste(page, text);
  await waitIdle(page);
  await expect(page.locator('.tk-statusbar__validity')).not.toHaveAttribute('data-validity', 'checking', {
    timeout: 20_000,
  });
}
const toolbar = (p: Page) => p.getByRole('toolbar', { name: 'Document actions' });
const act = (p: Page, id: keyof typeof COPY) => toolbar(p).getByRole('button', { name: COPY[id], exact: true });
const view = (p: Page, id: 'view.tree' | 'view.text') =>
  p.getByRole('group', { name: COPY['label.view'] }).getByRole('button', { name: COPY[id] });
const row = (p: Page, key: string) =>
  p.locator('.tk-tree__row:not([hidden])').filter({ has: p.locator('.tk-tree__key').getByText(key, { exact: true }) });

async function denyClipboard(page: Page) {
  await page.evaluate(() => {
    const refuse = async () => {
      throw new DOMException('Write permission denied.', 'NotAllowedError');
    };
    Object.defineProperty(Navigator.prototype, 'clipboard', {
      get: () => ({ write: refuse, writeText: refuse }),
      configurable: true,
    });
  });
}

for (const theme of THEMES) {
  test.describe(`visual ${theme} embedded 1200x760`, () => {
    test.use({ viewport: { width: 1200, height: 760 } });
    test.beforeEach(async ({ page }) => {
      await instrument(page);
      await recordClipboard(page);
    });

    test(`FLOW-01 ${theme}`, async ({ page }) => {
      await start(page, theme);
      await shot(page, 'FLOW-01_step1', theme);
      await load(page, ORDER_MIN);
      await shot(page, 'FLOW-01_step2', theme);
      await act(page, 'action.beautify').click();
      await waitIdle(page);
      await shot(page, 'FLOW-01_step3', theme);
      await act(page, 'action.copy').click();
      await expect(page.locator('.tk-toast').last()).toBeVisible();
      await shot(page, 'FLOW-01_step4', theme);
      await shot(page, 'Main', theme);
    });

    test(`FLOW-02 ${theme}`, async ({ page }) => {
      await start(page, theme);
      await load(page, ORDER_BAD);
      await shot(page, 'FLOW-02_step1', theme);
      await page
        .getByRole('region', { name: COPY['label.issues'] })
        .getByRole('list')
        .getByRole('button')
        .first()
        .click();
      await shot(page, 'FLOW-02_step2', theme);
      await load(page, ORDER_PRETTY);
      await shot(page, 'FLOW-02_step3', theme);
    });

    test(`FLOW-03 and find ${theme}`, async ({ page }) => {
      await start(page, theme);
      await load(page, EVENTS_TEXT);
      await view(page, 'view.tree').click();
      await expect(page.getByRole('tree')).toBeVisible();
      await shot(page, 'FLOW-03_step1', theme);
      await row(page, '[0 … 99]').locator('.tk-tree__twisty').click();
      await shot(page, 'FLOW-03_step2', theme);
      await row(page, '1').first().click();
      await shot(page, 'FLOW-03_step3', theme);
      await page.locator('.tk-tree__header').getByRole('button', { name: COPY['action.reveal'] }).click();
      await expect(content(page)).toBeVisible();
      await shot(page, 'FLOW-03_step4', theme);
      // tree on an invalid document
      await load(page, ORDER_BAD);
      await view(page, 'view.tree').click();
      await shot(page, 'FLOW-03_exit-invalid', theme);
      // find
      await view(page, 'view.text').click();
      await load(page, ORDER_PRETTY);
      await content(page).focus();
      await page.keyboard.press('ControlOrMeta+f');
      await page.getByRole('search').getByRole('searchbox').fill('sku');
      await expect(page.locator('.tk-search__count')).toBeVisible();
      await expect(page.locator('.tk-search__count')).toContainText('of 2');
      await shot(page, 'SCR-Formatter_find-open_embedded', theme);
    });

    test(`edge: errors and tree-clipboard ${theme}`, async ({ page }) => {
      await start(page, theme);
      await load(page, ORDER_PRETTY);
      const bad = Buffer.concat([Buffer.from('{"a": "'), Buffer.from([0xc3, 0x28, 0xff]), Buffer.from('"}')]);
      await openFile(page, { name: 'latin1.json', mimeType: 'application/json', buffer: bad });
      await expect(page.getByRole('alert').filter({ hasText: COPY['error.encoding'] })).toBeVisible();
      await shot(page, 'SCR-Formatter_error-encoding_embedded', theme);
      await page.reload();
      await expect(content(page)).toBeVisible();
      await load(page, ORDER_PRETTY);
      await drop(page, '.tk-toolbar', [], 'some text');
      await expect(page.getByRole('alert').filter({ hasText: COPY['error.not_a_file'] })).toBeVisible();
      await shot(page, 'SCR-Formatter_error-not-a-file_embedded', theme);
      await page.reload();
      await expect(content(page)).toBeVisible();
      await load(page, ORDER_PRETTY);
      await denyClipboard(page);
      await act(page, 'action.copy').click();
      await expect(page.locator('[data-notice-id="error.clipboard"]')).toBeVisible();
      await shot(page, 'SCR-Formatter_error-clipboard_embedded', theme);
      await page.reload();
      await expect(content(page)).toBeVisible();
      await load(page, EVENTS_TEXT);
      await view(page, 'view.tree').click();
      await row(page, '[0 … 99]').locator('.tk-tree__twisty').click();
      await row(page, '1').first().locator('.tk-tree__twisty').click();
      await row(page, 'amount').click();
      await denyClipboard(page);
      await page.locator('.tk-tree__header').getByRole('button', { name: COPY['action.copy_value'] }).click();
      await expect(page.locator('[data-notice-id="error.clipboard"]')).toBeVisible();
      await shot(page, 'SCR-Formatter_tree-clipboard_embedded', theme);
    });

    test(`edge: too-large error ${theme}`, async ({ page }) => {
      await seamWorker(page, { tooLarge: 'too-large.json' });
      await start(page, theme);
      await load(page, ORDER_PRETTY);
      await openFile(page, { name: 'too-large.json', mimeType: 'application/json', buffer: Buffer.from('[1]') });
      await expect(page.getByRole('alert').filter({ hasText: COPY['error.too_large'] })).toBeVisible();
      await shot(page, 'SCR-Formatter_error-too-large_embedded', theme);
    });

    test(`edge: confirm ${theme}`, async ({ page }) => {
      await start(page, theme);
      await load(page, ORDER_PRETTY);
      await load(page, '['.repeat(10_000) + ']'.repeat(10_000));
      await act(page, 'action.beautify').click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await shot(page, 'SCR-Formatter_confirm_embedded', theme);
    });

    test(`edge: loading, large, busy ${theme}`, async ({ page }) => {
      await seamWorker(page, { slowMs: 40 });
      await start(page, theme);
      await openFile(page, largeFixture('cancel', 30 * MB));
      await expect(page.getByRole('status').filter({ hasText: /Reading file… \d+%/ })).toBeVisible({ timeout: 15_000 });
      await shot(page, 'SCR-Formatter_loading_embedded', theme);
      await waitIdle(page);
      await expect(page.getByRole('status').filter({ hasText: /Large document/ })).toBeVisible({ timeout: 90_000 });
      await shot(page, 'SCR-Formatter_large_embedded', theme);
      await expect(page.locator('.tk-statusbar__validity')).toHaveAttribute('data-validity', 'valid', {
        timeout: 90_000,
      });
      await act(page, 'action.beautify').click();
      await expect(page.getByRole('status').filter({ hasText: /Formatting… \d+%/ })).toBeVisible({ timeout: 15_000 });
      await shot(page, 'SCR-Formatter_busy_embedded', theme);
    });

    test(`edge: tree checking ${theme}`, async ({ page }) => {
      await page.addInitScript(() => {
        const Native = window.Worker;
        const held: (() => void)[] = [];
        (window as unknown as { __hold: boolean }).__hold = false;
        window.Worker = class extends Native {
          override addEventListener(
            type: string,
            l: EventListenerOrEventListenerObject,
            o?: boolean | AddEventListenerOptions,
          ) {
            if (type !== 'message') return super.addEventListener(type, l, o);
            const fn = typeof l === 'function' ? l : (e: Event) => l.handleEvent(e);
            return super.addEventListener(
              'message',
              (e: Event) => {
                const t = ((e as MessageEvent).data as { type?: string }).type;
                if ((window as unknown as { __hold: boolean }).__hold && t === 'validation')
                  return void held.push(() => fn(e));
                fn(e);
              },
              o,
            );
          }
        } as typeof Worker;
        (window as unknown as { __release: () => void }).__release = () => held.splice(0).forEach((f) => f());
      });
      await start(page, theme);
      await load(page, EVENTS_TEXT);
      await view(page, 'view.tree').click();
      await expect(page.getByRole('tree')).toBeVisible();
      await view(page, 'view.text').click();
      await content(page).click();
      await page.keyboard.press('ControlOrMeta+End');
      await page.keyboard.type(' ');
      await view(page, 'view.tree').click();
      await page.evaluate(() => ((window as unknown as { __hold: boolean }).__hold = true));
      await view(page, 'view.text').click();
      await content(page).click();
      await page.keyboard.press('ControlOrMeta+z');
      await view(page, 'view.tree').click();
      await page.waitForTimeout(900);
      await shot(page, 'SCR-Formatter_tree-checking_embedded', theme);
    });
  });
}

test.describe('visual heavy dark', () => {
  test.use({ viewport: { width: 1200, height: 760 } });
  test('undo trimmed', async ({ page }) => {
    await instrument(page);
    await seamWorker(page, { slowMs: 15 });
    await start(page, 'dark');
    for (const l of ['A', 'B', 'C', 'D', 'E']) {
      await openFile(page, largeFixture(`undo${l}`, 30 * MB + l.charCodeAt(0)));
      await waitIdle(page);
    }
    await expect(page.getByRole('status').filter({ hasText: COPY['notice.undo_trimmed'] })).toBeVisible();
    await shot(page, 'SCR-Formatter_undo-trimmed_embedded', 'dark');
  });
});

for (const theme of THEMES) {
  test.describe(`visual ${theme} narrow 390x760 coarse`, () => {
    test.use({ viewport: { width: 390, height: 760 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    test.beforeEach(async ({ page }) => {
      await instrument(page);
      await recordClipboard(page);
    });

    test(`narrow ${theme}`, async ({ page }) => {
      await start(page, theme);
      await shot(page, 'SCR-Formatter_empty_narrow', theme);
      await load(page, ORDER_PRETTY);
      await shot(page, 'SCR-Formatter_default_narrow', theme);
      // find
      await page
        .getByRole('button', { name: COPY['action.find'] ?? 'Find' })
        .first()
        .tap()
        .catch(() => undefined);
      const search = page.getByRole('search');
      if (await search.isVisible().catch(() => false)) {
        await search.getByRole('searchbox').fill('sku');
        await shot(page, 'SCR-Formatter_find-open_narrow', theme);
        await page.keyboard.press('Escape');
      } else {
        await shot(page, 'SCR-Formatter_find-open_narrow.NOT-REACHABLE', theme);
      }
      await load(page, ORDER_BAD);
      await shot(page, 'SCR-Formatter_error_narrow', theme);
      // notice
      await load(page, ORDER_PRETTY);
      const bad = Buffer.concat([Buffer.from('{"a": "'), Buffer.from([0xc3, 0x28, 0xff]), Buffer.from('"}')]);
      await openFile(page, { name: 'latin1.json', mimeType: 'application/json', buffer: bad });
      await expect(page.getByRole('alert').filter({ hasText: COPY['error.encoding'] })).toBeVisible();
      await shot(page, 'SCR-Formatter_notice_narrow', theme);
    });

    test(`narrow tree, toast, confirm ${theme}`, async ({ page }) => {
      await start(page, theme);
      await load(page, EVENTS_TEXT);
      await view(page, 'view.tree').tap();
      await row(page, '[0 … 99]').locator('.tk-tree__twisty').tap();
      await row(page, '1').first().tap();
      await shot(page, 'SCR-Formatter_tree_narrow', theme);
      await page.locator('.tk-tree__header').getByRole('button', { name: COPY['action.copy_path'] }).tap();
      await expect(page.locator('.tk-toast').last()).toBeVisible();
      await shot(page, 'SCR-Formatter_toast_narrow', theme);
      await view(page, 'view.text').tap();
      await load(page, '['.repeat(10_000) + ']'.repeat(10_000));
      await act(page, 'action.beautify').tap();
      await expect(page.getByRole('dialog')).toBeVisible();
      await shot(page, 'SCR-Formatter_confirm_narrow', theme);
    });
  });
}
