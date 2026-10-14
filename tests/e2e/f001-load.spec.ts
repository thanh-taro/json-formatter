// F-001 Load a document — end to end on the production build (ADR-0010).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { instrument } from './fixtures';
import {
  app,
  content,
  COPY,
  copy,
  docText,
  drop,
  largeFixture,
  notices,
  openFile,
  paste,
  recordNotices,
  reportShot,
  seamWorker,
  smallFixture,
  killWorker,
  waitIdle,
} from './load-helpers';

const MB = 1_000_000;

test.beforeEach(async ({ page }) => {
  await instrument(page);
  await recordNotices(page);
});

async function start(page: Page) {
  await page.goto('/?theme=dark');
  await expect(content(page)).toBeVisible();
  await expect(app(page)).toHaveAttribute('data-busy', 'false');
}

async function loadSmall(page: Page, name: string, text: string) {
  await openFile(page, { name, mimeType: 'application/json', buffer: Buffer.from(text) });
  await waitIdle(page);
  await expect(app(page)).toHaveAttribute('data-source-name', name);
}

const axe = (page: Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();

test.describe('F-001 typing, opening and dropping', () => {
  test('F-001.AC1 pasting {"a":1} into an empty document gives exactly that text', async ({ page }) => {
    await start(page);
    await expect(page.getByText(COPY['empty.title'])).toBeVisible();
    await paste(page, '{"a":1}');
    await expect.poll(() => docText(page)).toBe('{"a":1}');
    await expect(app(page)).toHaveAttribute('data-bytes', '7');
    await expect(page.getByText(COPY['empty.title'])).toBeHidden();
    expect(await page.evaluate(() => window.__csp)).toEqual([]);
  });

  test('F-001.R1 typing into the editor changes the document', async ({ page }) => {
    await start(page);
    await content(page).click();
    await page.keyboard.type('[1, 2]');
    await expect.poll(() => docText(page)).toBe('[1, 2]');
  });

  test('F-001.AC2 dropping a UTF-8 file data.json replaces the document and records its name', async ({ page }) => {
    await start(page);
    await paste(page, '[0]');
    await drop(page, '.tk-editor-host', [{ name: 'data.json', text: '{\n  "dropped": true\n}' }]);
    await waitIdle(page);
    await expect.poll(() => docText(page)).toBe('{\n  "dropped": true\n}');
    await expect(app(page)).toHaveAttribute('data-source-name', 'data.json');
  });

  test('F-001.AC3 choosing a UTF-8 file with the open action replaces the document', async ({ page }) => {
    await start(page);
    await paste(page, '"before"');
    const file = smallFixture('chosen.json', '{"chosen": [1, 2, 3]}');
    await openFile(page, file);
    await waitIdle(page);
    await expect.poll(() => docText(page)).toBe('{"chosen": [1, 2, 3]}');
    await expect(app(page)).toHaveAttribute('data-source-name', 'chosen.json');
  });

  test('F-001.R3 the empty state offers the open action too', async ({ page }) => {
    await start(page);
    const chooser = page.waitForEvent('filechooser');
    await page.locator('.tk-editor__empty').getByRole('button', { name: COPY['action.open'] }).click();
    await (await chooser).setFiles({ name: 'e.json', mimeType: 'application/json', buffer: Buffer.from('[true]') });
    await waitIdle(page);
    await expect.poll(() => docText(page)).toBe('[true]');
  });

  test('F-001.AC7 clearing a non-empty document empties it', async ({ page }) => {
    await start(page);
    const clear = page.getByRole('toolbar').getByRole('button', { name: COPY['action.clear'] });
    await expect(clear).toBeDisabled();
    await paste(page, '{"x": 1}');
    await expect(clear).toBeEnabled();
    await clear.click();
    await expect.poll(() => docText(page)).toBe('');
    await expect(app(page)).toHaveAttribute('data-bytes', '0');
    await expect(page.getByText(COPY['empty.title'])).toBeVisible();
    await expect(clear).toBeDisabled();
  });

  test('F-001.AC8 INV-04 undo after a dropped file restores the previous document exactly', async ({ page }) => {
    await start(page);
    const previous = '{\n  "previous": [1, 2.50, "x"]\n}';
    await paste(page, previous);
    await drop(page, '.tk-editor-host', [{ name: 'data.json', text: '["replaced"]' }]);
    await waitIdle(page);
    await expect.poll(() => docText(page)).toBe('["replaced"]');
    await content(page).focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => docText(page)).toBe(previous);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect.poll(() => docText(page)).toBe('["replaced"]');
  });

  // Reproduces on Linux and Windows only: on macOS CodeMirror names Cmd+Shift keys from the key code.
  test('F-001.R7 redo with Shift held redoes even when the key arrives as a lowercase "z" (Caps Lock)', async ({
    page,
  }) => {
    await start(page);
    await paste(page, '[1]');
    await loadSmall(page, 'data.json', '["replaced"]');
    await content(page).focus();
    const key = (shiftKey: boolean) =>
      content(page).evaluate((el, shiftKey) => {
        const mac = /Mac|iPhone|iPad/.test(navigator.platform);
        const init = { key: 'z', code: 'KeyZ', keyCode: 90, shiftKey, ctrlKey: !mac, metaKey: mac, bubbles: true };
        el.dispatchEvent(new KeyboardEvent('keydown', { ...init, cancelable: true }));
      }, shiftKey);
    await key(false);
    await expect.poll(() => docText(page)).toBe('[1]');
    await key(true);
    await expect.poll(() => docText(page)).toBe('["replaced"]');
  });

  test('F-001.R7 INV-04 clearing can be undone in one step', async ({ page }) => {
    await start(page);
    await paste(page, '[1,\n2]');
    await page.getByRole('toolbar').getByRole('button', { name: COPY['action.clear'] }).click();
    await expect.poll(() => docText(page)).toBe('');
    await content(page).focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => docText(page)).toBe('[1,\n2]');
  });
});

test.describe('F-001 edge cases', () => {
  test('F-001.R2 dropping several files loads only the first and says so', async ({ page }) => {
    await start(page);
    await drop(page, '.tk-editor-host', [
      { name: 'first.json', text: '[1]' },
      { name: 'second.json', text: '[2]' },
    ]);
    await waitIdle(page);
    await expect.poll(() => docText(page)).toBe('[1]');
    await expect(page.getByRole('status').filter({ hasText: COPY['notice.multiple_files'] })).toBeVisible();
  });

  test('F-001.R2 dropping non-file content outside the editor text is refused', async ({ page }) => {
    await start(page);
    await paste(page, '[1]');
    await drop(page, '.tk-toolbar', [], 'some text');
    await expect(page.getByRole('alert').filter({ hasText: COPY['error.not_a_file'] })).toBeVisible();
    await expect.poll(() => docText(page)).toBe('[1]');
  });

  test('F-001.R2 the drop overlay shows only while a file is dragged over the tool', async ({ page }) => {
    await start(page);
    const overlay = page.locator('.tk-drop-overlay');
    await expect(overlay).toBeHidden();
    const dt = await page.evaluateHandle(() => {
      const d = new DataTransfer();
      d.items.add(new File(['[1]'], 'a.json'));
      return d;
    });
    await page.locator('.tk-editor-host').dispatchEvent('dragenter', { dataTransfer: dt });
    await page.locator('.tk-editor-host').dispatchEvent('dragover', { dataTransfer: dt });
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText(COPY['drop.hint']);
    await page.locator('.tk-editor-host').dispatchEvent('dragleave', { dataTransfer: dt });
    await expect(overlay).toBeHidden();
  });

  test('F-001.R2 an empty file makes the document empty without an error', async ({ page }) => {
    await start(page);
    await paste(page, '[1]');
    await openFile(page, { name: 'empty.json', mimeType: 'application/json', buffer: Buffer.alloc(0) });
    await waitIdle(page);
    await expect.poll(() => docText(page)).toBe('');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('RULE-17 a CRLF file keeps CRLF as its line ending', async ({ page }) => {
    await start(page);
    await loadSmall(page, 'crlf.json', '{\r\n  "a": 1\r\n}\r\n');
    await expect(app(page)).toHaveAttribute('data-line-ending', 'crlf');
    await expect(app(page)).toHaveAttribute('data-bytes', String('{\r\n  "a": 1\r\n}\r\n'.length));
    await expect.poll(() => docText(page)).toBe('{\n  "a": 1\n}\n');
  });

  test('RULE-17 mixed line endings are normalised to the dominant one (ties to LF)', async ({ page }) => {
    await start(page);
    await loadSmall(page, 'mixed.json', '[\r\n1,\r\n2,\n3\r\n]');
    await expect(app(page)).toHaveAttribute('data-line-ending', 'crlf');
    await loadSmall(page, 'tie.json', '[\r\n1,\n2]');
    await expect(app(page)).toHaveAttribute('data-line-ending', 'lf');
    await page.getByRole('toolbar').getByRole('button', { name: COPY['action.clear'] }).click();
    await paste(page, '[\r\n1,\r\n2\n]');
    await expect(app(page)).toHaveAttribute('data-line-ending', 'crlf');
  });

  test('RULE-13 a leading byte-order mark is kept as the first character', async ({ page }) => {
    await start(page);
    await openFile(page, { name: 'bom.json', mimeType: 'application/json', buffer: Buffer.from('﻿[1]', 'utf8') });
    await waitIdle(page);
    await expect(app(page)).toHaveAttribute('data-bytes', '6');
  });
});

test.describe('F-001 failures keep the previous document (INV-03)', () => {
  test('F-001.AC6 RULE-13 INV-03 a file with invalid UTF-8 is refused with COPY-error.encoding', async ({ page }) => {
    await start(page);
    await paste(page, '{"keep": 1}');
    const bad = Buffer.concat([Buffer.from('{"a": "'), Buffer.from([0xc3, 0x28, 0xff]), Buffer.from('"}')]);
    await openFile(page, { name: 'latin1.json', mimeType: 'application/json', buffer: bad });
    const alert = page.getByRole('alert').filter({ hasText: COPY['error.encoding'] });
    await expect(alert).toBeVisible();
    await waitIdle(page);
    await expect.poll(() => docText(page)).toBe('{"keep": 1}');
    await expect(alert.getByRole('button', { name: COPY['action.open'] })).toBeVisible();
    expect((await axe(page)).violations.map((v) => v.id)).toEqual([]);
    await reportShot(page, 'F-001/error-encoding.png');
  });

  test('F-001.AC10 INV-03 when the device cannot hold the file, COPY-error.too_large is shown and nothing changes', async ({
    page,
  }) => {
    await seamWorker(page, { tooLarge: 'too-large.json' });
    await start(page);
    await paste(page, '[42]');
    await openFile(page, { name: 'too-large.json', mimeType: 'application/json', buffer: Buffer.from('[1]') });
    await expect(page.getByRole('alert').filter({ hasText: COPY['error.too_large'] })).toBeVisible();
    await waitIdle(page);
    await expect.poll(() => docText(page)).toBe('[42]');
  });

  test('F-001.AC9 INV-03 cancelling a large file while it loads keeps the previous document', async ({ page }) => {
    test.setTimeout(120_000);
    const file = largeFixture('cancel', 30 * MB);
    await seamWorker(page, { slowMs: 40 });
    await start(page);
    await paste(page, '{"previous": true}');
    await openFile(page, file);
    const bar = page.getByRole('status').filter({ hasText: /Reading file… \d+%/ });
    await expect(bar).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('progressbar')).toBeVisible();
    await expect(content(page)).toHaveAttribute('aria-readonly', 'true');
    await reportShot(page, 'F-001/loading.png');
    await bar.getByRole('button', { name: COPY['action.cancel'] }).click();
    await waitIdle(page);
    await expect(bar).toBeHidden();
    await expect.poll(() => docText(page)).toBe('{"previous": true}');
    await expect(app(page)).toHaveAttribute('data-source-name', '');
    // the editor is usable again
    await content(page).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' ');
    await expect.poll(() => docText(page)).toBe('{"previous": true} ');
  });
});

test.describe('F-001 size tiers (RULE-02)', () => {
  test('F-001.AC4 RULE-02 a 30 MB file loads and COPY-notice.large is shown', async ({ page }) => {
    test.setTimeout(120_000);
    const file = largeFixture('large', 30 * MB);
    await start(page);
    await openFile(page, file);
    await waitIdle(page);
    await expect(app(page)).toHaveAttribute('data-bytes', String(30 * MB));
    await expect(app(page)).toHaveAttribute('data-tier', 'large');
    await expect(page.getByRole('status').filter({ hasText: copy('notice.large', { size: '30.0 MB' }) })).toBeVisible();
    await expect(page.locator('.cm-line').first()).toHaveText('[');
    expect(await page.evaluate(() => window.__csp)).toEqual([]);
    expect((await axe(page)).violations.map((v) => v.id)).toEqual([]);
    await reportShot(page, 'F-001/large-notice.png');
  });

  test('F-001.AC5 RULE-02 a 150 MB file asks first and replaces nothing until Continue', async ({ page }) => {
    test.setTimeout(240_000);
    const file = largeFixture('verylarge', 150 * MB);
    await start(page);
    await paste(page, '{"small": true}');
    await openFile(page, file);
    const dialog = page.getByRole('dialog', { name: COPY['confirm.title'] });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(copy('confirm.very_large', { size: '150.0 MB' }));
    await expect(dialog.getByRole('button', { name: COPY['action.cancel'] })).toBeFocused();
    await expect.poll(() => docText(page)).toBe('{"small": true}');
    expect((await axe(page)).violations.map((v) => v.id)).toEqual([]);
    await reportShot(page, 'F-001/confirm.png');
    // Cancel (Escape) changes nothing
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect.poll(() => docText(page)).toBe('{"small": true}');
  });

  test('F-001.AC5 RULE-02 after Continue the 150 MB file replaces the document', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'loading 150 MB is best effort (RULE-02); measured in Chromium only');
    test.setTimeout(240_000);
    const file = largeFixture('verylarge', 150 * MB);
    await start(page);
    await paste(page, '{"small": true}');
    const dialog = page.getByRole('dialog', { name: COPY['confirm.title'] });
    await openFile(page, file);
    await dialog.getByRole('button', { name: COPY['action.continue'] }).click();
    await waitIdle(page);
    await expect(app(page)).toHaveAttribute('data-bytes', String(150 * MB), { timeout: 120_000 });
    await expect(app(page)).toHaveAttribute('data-tier', 'very-large');
  });

  test('F-001.AC11 RULE-02 pasting 120 MB asks first and inserts nothing until confirmed', async ({ page }) => {
    test.setTimeout(240_000);
    await start(page);
    await paste(page, '[1]');
    await page.keyboard.press('ControlOrMeta+a');
    await paste(page, { repeat: '"012345678",', times: 10 * MB });
    const dialog = page.getByRole('dialog', { name: COPY['confirm.title'] });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(copy('confirm.very_large', { size: '120.0 MB' }));
    await expect.poll(() => docText(page)).toBe('[1]');
    await dialog.getByRole('button', { name: COPY['action.cancel'] }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => docText(page)).toBe('[1]');
  });

  test('F-001.AC11 RULE-02 after Continue the 120 MB paste is inserted', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'inserting 120 MB is best effort (RULE-02); measured in Chromium only');
    test.setTimeout(240_000);
    await start(page);
    await paste(page, '[1]');
    const dialog = page.getByRole('dialog', { name: COPY['confirm.title'] });
    await page.keyboard.press('ControlOrMeta+a');
    await paste(page, { repeat: '"012345678",', times: 10 * MB });
    await dialog.getByRole('button', { name: COPY['action.continue'] }).click();
    await waitIdle(page);
    await expect(app(page)).toHaveAttribute('data-bytes', String(120 * MB), { timeout: 120_000 });
  });

  test('F-001.R4 ADR-0006 a 2 MB paste goes through the chunked path with COPY-progress.inserting and is one undo step', async ({
    page,
  }) => {
    await seamWorker(page, { slowMs: 600 });
    await start(page);
    await paste(page, '[]');
    await page.keyboard.press('ControlOrMeta+a');
    await paste(page, { repeat: '[10,\r\n2]', times: (2 * MB) / 8 });
    await expect(page.getByRole('status').filter({ hasText: /^Adding pasted text… \d+%/ })).toBeVisible();
    await waitIdle(page);
    await expect(app(page)).toHaveAttribute('data-bytes', String(2 * MB));
    await expect(app(page)).toHaveAttribute('data-line-ending', 'crlf');
    await content(page).focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => docText(page)).toBe('[]');
    // review M3: undoing the paste restores the line ending it replaced (RULE-17)
    await expect(app(page)).toHaveAttribute('data-line-ending', 'lf');
    await expect(app(page)).toHaveAttribute('data-bytes', '2');
  });

  test('F-001.R4 RULE-02 a 2 MB text dropped from outside the editor takes the chunked path', async ({ page }) => {
    await start(page);
    await paste(page, '[]');
    await content(page).evaluate((el) => {
      const dt = new DataTransfer();
      dt.setData('text/plain', ' '.repeat(2_000_000));
      const r = el.getBoundingClientRect();
      el.dispatchEvent(
        new DragEvent('drop', {
          dataTransfer: dt,
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX: r.left + 2,
          clientY: r.top + 2,
        }),
      );
    });
    await waitIdle(page);
    await expect(app(page)).toHaveAttribute('data-bytes', String(2_000_002));
  });

  test('F-001.AC12 RULE-15 with 5 loads of 30 MB only the last 3 undo; COPY-notice.undo_trimmed shown once; COPY-progress.restoring', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const labels = ['A', 'B', 'C', 'D', 'E'];
    const files = labels.map((l) => largeFixture(`undo${l}`, 30 * MB + l.charCodeAt(0)));
    await seamWorker(page, { slowMs: 15 });
    await start(page);
    for (const f of files) {
      await openFile(page, f);
      await waitIdle(page);
    }
    await expect(page.locator('.cm-line').nth(1)).toHaveText('  {"fixture": "undoE"},');
    await expect(page.getByRole('status').filter({ hasText: COPY['notice.undo_trimmed'] })).toBeVisible();
    await reportShot(page, 'F-001/undo-trimmed.png');
    for (const label of ['D', 'C', 'B']) {
      await content(page).focus();
      await page.keyboard.press('ControlOrMeta+z');
      if (label === 'D') await expect(page.getByRole('status').filter({ hasText: /^Restoring… \d+%/ })).toBeVisible();
      await waitIdle(page);
      await expect(page.locator('.cm-line').nth(1)).toHaveText(`  {"fixture": "undo${label}"},`, { timeout: 60_000 });
      await expect(app(page)).toHaveAttribute('data-bytes', String(30 * MB + label.charCodeAt(0)));
    }
    // a 4th undo has nothing left: the loads before C were dropped (two trims, one notice)
    await content(page).focus();
    await page.keyboard.press('ControlOrMeta+z');
    await waitIdle(page);
    await expect(page.locator('.cm-line').nth(1)).toHaveText('  {"fixture": "undoB"},');
    expect((await notices(page)).filter((n) => n === 'notice.undo_trimmed')).toHaveLength(1);
  });

  test('ADR-0005 F-001.R9 after a silent worker death the mirror is re-seeded and undo restores the right text', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const big = largeFixture('reseed', 30 * MB);
    await seamWorker(page, {});
    await start(page);
    await openFile(page, big);
    await expect(app(page)).toHaveAttribute('data-bytes', String(30 * MB), { timeout: 60_000 });
    await waitIdle(page);
    await killWorker(page);
    // an edit the dead worker never sees
    await content(page).focus();
    await page.keyboard.press('ControlOrMeta+Home');
    await page.keyboard.type('X');
    // the next job gets no answer: the watchdog restarts the worker, re-seeds, and fails the job
    await openFile(page, { name: 'small.json', mimeType: 'application/json', buffer: Buffer.from('[1]') });
    await expect(page.getByRole('alert').filter({ hasText: COPY['error.failed'] })).toBeVisible({ timeout: 10_000 });
    await waitIdle(page);
    await expect(page.locator('.cm-line').first()).toHaveText('X[');
    // the new worker works; its snapshot of the previous (re-seeded) document is exact
    await openFile(page, { name: 'small.json', mimeType: 'application/json', buffer: Buffer.from('[1]') });
    await waitIdle(page);
    await expect.poll(() => docText(page)).toBe('[1]');
    await content(page).focus();
    await page.keyboard.press('ControlOrMeta+z');
    await waitIdle(page);
    await expect(page.locator('.cm-line').first()).toHaveText('X[', { timeout: 60_000 });
    await expect(app(page)).toHaveAttribute('data-bytes', String(30 * MB + 1));
  });

  test('ADR-0005 F-001.R9 a restart in the middle of a re-seed starts the seed over and the mirror stays exact', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const big = largeFixture('reseed', 30 * MB);
    await seamWorker(page, { desyncOnSeed: true });
    await start(page);
    await openFile(page, big);
    await expect(app(page)).toHaveAttribute('data-bytes', String(30 * MB), { timeout: 60_000 });
    await waitIdle(page);
    await killWorker(page);
    await content(page).focus();
    await page.keyboard.press('ControlOrMeta+Home');
    await page.keyboard.type('Y');
    await openFile(page, { name: 'small.json', mimeType: 'application/json', buffer: Buffer.from('[1]') });
    await expect(page.getByRole('alert').filter({ hasText: COPY['error.failed'] })).toBeVisible({ timeout: 10_000 });
    await waitIdle(page);
    expect(await page.evaluate(() => (window as unknown as { __workers: Worker[] }).__workers.length)).toBe(3);
    await openFile(page, { name: 'small.json', mimeType: 'application/json', buffer: Buffer.from('[1]') });
    await waitIdle(page);
    await expect.poll(() => docText(page)).toBe('[1]');
    await content(page).focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.locator('.cm-line').first()).toHaveText('Y[', { timeout: 60_000 });
    await expect(app(page)).toHaveAttribute('data-bytes', String(30 * MB + 1));
  });

  test('INV-04 review M2 undo after a failed snapshot keeps the document and drops only that history', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await seamWorker(page, { failExport: true });
    await start(page);
    await openFile(page, largeFixture('large', 30 * MB));
    await expect(app(page)).toHaveAttribute('data-bytes', String(30 * MB), { timeout: 60_000 });
    await waitIdle(page);
    await openFile(page, { name: 'small.json', mimeType: 'application/json', buffer: Buffer.from('[1]') });
    await expect.poll(() => docText(page)).toBe('[1]');
    await waitIdle(page);
    await content(page).focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.getByRole('status').filter({ hasText: COPY['notice.undo_trimmed'] })).toBeVisible();
    await waitIdle(page);
    await expect.poll(() => docText(page)).toBe('[1]');
    await expect(page.getByRole('alert')).toHaveCount(0);
    // nothing older is left to undo
    await content(page).focus();
    await page.keyboard.press('ControlOrMeta+z');
    await waitIdle(page);
    await expect.poll(() => docText(page)).toBe('[1]');
  });

  test('INV-04 a worker restart during an undo restore keeps the entry undoable (COPY-error.failed)', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await seamWorker(page, { killOnLoadBlob: true });
    await start(page);
    await openFile(page, largeFixture('large', 30 * MB));
    await expect(app(page)).toHaveAttribute('data-bytes', String(30 * MB), { timeout: 60_000 });
    await waitIdle(page);
    await openFile(page, { name: 'small.json', mimeType: 'application/json', buffer: Buffer.from('[1]') });
    await expect.poll(() => docText(page)).toBe('[1]');
    await waitIdle(page);
    await content(page).focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.getByRole('alert').filter({ hasText: COPY['error.failed'] })).toBeVisible({ timeout: 10_000 });
    await waitIdle(page);
    await expect.poll(() => docText(page)).toBe('[1]');
    await content(page).focus();
    await page.keyboard.press('ControlOrMeta+z');
    await waitIdle(page);
    await expect(page.locator('.cm-line').first()).toHaveText('[', { timeout: 60_000 });
    await expect(app(page)).toHaveAttribute('data-bytes', String(30 * MB));
  });

  test('F-001.AC9 review B1 cancelling while the final commit waits for the builder keeps the previous document', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'timing-sensitive; measured in Chromium');
    test.setTimeout(180_000);
    const file = largeFixture('b1', 95 * MB);
    await seamWorker(page, { burst: true });
    await start(page);
    await paste(page, '{"previous": true}');
    // Click Cancel from inside the page the moment the worker's result has been delivered while
    // the main thread is still appending the burst to the pending document.
    const clicked = page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const w = window as unknown as { __burstAt?: number };
          const deadline = performance.now() + 60_000;
          const poll = () => {
            if (performance.now() > deadline) return resolve(-1);
            const button = [...document.querySelectorAll('.tk-notice--progress button')][0] as
              HTMLButtonElement | undefined;
            if (w.__burstAt !== undefined && button) {
              const t0 = performance.now();
              button.click();
              resolve(t0 - w.__burstAt);
            } else setTimeout(poll, 1);
          };
          poll();
        }),
    );
    await openFile(page, file);
    const sinceResult = await clicked;
    expect(sinceResult).toBeGreaterThanOrEqual(0);
    await waitIdle(page);
    await expect.poll(() => docText(page)).toBe('{"previous": true}');
    await expect(app(page)).toHaveAttribute('data-bytes', '18');
    // the tab is responsive and the editor usable again
    await content(page).click();
    await page.keyboard.press('End');
    await page.keyboard.type('!');
    await expect.poll(() => docText(page)).toBe('{"previous": true}!');
  });

  test('RULE-02 security review MINOR-4 a second file dropped while the confirmation is open is ignored', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const file = largeFixture('verylarge', 150 * MB);
    await start(page);
    await paste(page, '{"small": true}');
    await openFile(page, file);
    const dialog = page.getByRole('dialog', { name: COPY['confirm.title'] });
    await expect(dialog).toBeVisible();
    await drop(page, 'body', [{ name: 'other.json', text: '[2]' }]);
    await dialog.getByRole('button', { name: COPY['action.cancel'] }).click();
    await waitIdle(page);
    await expect.poll(() => docText(page)).toBe('{"small": true}');
  });
});

test.describe('F-001 keyboard', () => {
  test('F-001.R3 CMP-Toolbar arrow keys move between actions with one Tab stop', async ({ page }) => {
    await start(page);
    await paste(page, '[1]');
    const toolbar = page.getByRole('toolbar');
    const open = toolbar.getByRole('button', { name: COPY['action.open'] });
    const clear = toolbar.getByRole('button', { name: COPY['action.clear'] });
    await open.focus();
    await page.keyboard.press('ArrowRight');
    await expect(clear).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(open).toBeFocused();
    await page.keyboard.press('End');
    await expect(toolbar.getByRole('button', { name: COPY['action.download'] })).toBeFocused();
    await page.keyboard.press('Home');
    await expect(open).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(toolbar.getByRole('button', { name: COPY['action.download'] })).toBeFocused();
    expect(await toolbar.locator('[tabindex="0"]').count()).toBe(1);
  });
});

test.describe('F-001 states', () => {
  test('F-001.R6 SCR-Formatter empty and loaded states pass axe with no CSP violations', async ({ page }) => {
    await start(page);
    expect(await page.evaluate(() => window.__csp)).toEqual([]);
    await loadSmall(
      page,
      'order.json',
      '{\n  "order": {\n    "id": 9007199254740993,\n    "status": "shipped",\n    "total": 1499.50,\n    "gift": false,\n    "coupon": null\n  }\n}\n',
    );
    // checked before screenshots and axe: in WebKit both inject <style> elements of their own
    expect(await page.evaluate(() => window.__csp)).toEqual([]);
    await reportShot(page, 'F-001/loaded.png');
    expect((await axe(page)).violations.map((v) => v.id)).toEqual([]);
    await page.getByRole('toolbar').getByRole('button', { name: COPY['action.clear'] }).click();
    expect((await axe(page)).violations.map((v) => v.id)).toEqual([]);
    await reportShot(page, 'F-001/empty.png');
  });

  test('F-001.R2 the editor stays laid out (never display:none) while a document commits', async ({ page }) => {
    await start(page);
    await loadSmall(page, 'a.json', '[1]');
    const display = await page.locator('.tk-editor-host').evaluate((el) => getComputedStyle(el).display);
    expect(display).not.toBe('none');
  });
});
