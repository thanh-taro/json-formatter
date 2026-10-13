// F-005 Validate and pinpoint problems — end to end on the production build (ADR-0010):
// continuous validation, CMP-StatusBar validity / size / cursor, CMP-IssuePanel, editor marks,
// jump to issue, the large-tier "checking" state, and FLOW-02 steps 1–3.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { instrument } from './fixtures';
import { app, content, COPY, copy, docText, largeFixture, openFile, paste, waitIdle } from './load-helpers';

const MB = 1_000_000;

test.beforeEach(async ({ page }) => {
  await instrument(page);
});

async function start(page: Page, theme: 'dark' | 'light' = 'dark') {
  await page.goto(`/?theme=${theme}`);
  await expect(content(page)).toBeVisible();
  await expect(app(page)).toHaveAttribute('data-busy', 'false');
}

const statusBar = (page: Page) => page.locator('.tk-statusbar');
const validity = (page: Page) => page.locator('.tk-statusbar__validity');
const panel = (page: Page) => page.getByRole('region', { name: COPY['label.issues'] });
const items = (page: Page) => panel(page).getByRole('list').getByRole('button');
const marks = (page: Page, kind: 'error' | 'warning') => page.locator(`.tk-${kind}-mark`);
const grouped = (n: number) => n.toLocaleString('en-US');
const location = (line: number, column: number) =>
  copy('issue.location', { line: grouped(line), column: grouped(column) });

/** Test-side seam: while `window.__holdValidation` is true, validation results are held back;
 * while `window.__failValidation` is true, they arrive as `failed(internal)`. */
async function holdValidation(page: Page) {
  await page.addInitScript(() => {
    const Native = window.Worker;
    class Held extends Native {
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
            const w = window as unknown as { __holdValidation?: boolean; __failValidation?: boolean };
            if (data.type === 'validation' && w.__holdValidation) return;
            if (data.type === 'validation' && w.__failValidation) {
              const failed = { type: 'failed', jobId: data.jobId, reason: 'internal', detail: 'seam' };
              return fn(new MessageEvent('message', { data: failed }));
            }
            fn(e);
          },
          options,
        );
      }
    }
    window.Worker = Held;
  });
}

async function expectError(page: Page, code: string, line: number, column: number, hint: string) {
  await expect(validity(page)).toHaveAttribute('data-validity', 'invalid');
  await expect(validity(page)).toContainText(COPY['status.invalid']);
  await expect(panel(page).getByRole('tab', { name: copy('issue.tab_problems', { count: 1 }) })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(items(page)).toHaveCount(1);
  const item = items(page).first();
  await expect(item).toContainText(COPY['issue.error']);
  await expect(item).toContainText(location(line, column));
  await expect(item).toContainText(hint);
  await expect(item).toContainText(code);
}

/** True when `inner`'s box lies inside `outer`'s visible box. */
async function inside(inner: Locator, outer: Locator): Promise<boolean> {
  if ((await inner.count()) === 0) return false;
  const a = await inner.boundingBox();
  const b = await outer.boundingBox();
  if (!a || !b) return false;
  return a.x >= b.x - 1 && a.x + a.width <= b.x + b.width + 1 && a.y >= b.y - 1 && a.y + a.height <= b.y + b.height + 1;
}

test.describe('F-005 validation and the status bar', () => {
  test('F-005.AC1 F-005.R1 F-005.R2 a character that makes a valid document invalid flips the state without any action', async ({
    page,
  }) => {
    await start(page);
    await paste(page, '{"a":1}');
    await expect(validity(page)).toHaveAttribute('data-validity', 'valid');
    await expect(validity(page)).toHaveText(COPY['status.valid']);
    await page.keyboard.press('End');
    await page.keyboard.type('x');
    await expect(validity(page)).toHaveAttribute('data-validity', 'invalid');
    await expect(validity(page)).toContainText(COPY['status.invalid']);
    await page.keyboard.press('Backspace');
    await expect(validity(page)).toHaveAttribute('data-validity', 'valid');
    expect(await page.evaluate(() => window.__csp)).toEqual([]);
  });

  test('F-005.AC2 trailing comma at line 2 column 8 with COPY-hint.trailing_comma, marked in the text', async ({
    page,
  }) => {
    await start(page);
    await paste(page, '{"a": 1,\n "b": 2,\n}');
    await expectError(page, 'trailing-comma', 2, 8, COPY['hint.trailing_comma']);
    // CMP-Editor "error": the comma is marked, its line is marked in the gutter, aria-invalid.
    await expect(marks(page, 'error')).toHaveCount(1);
    await expect(marks(page, 'error')).toHaveText(',');
    await expect(page.locator('.cm-line.tk-error-line')).toHaveCount(1);
    await expect(page.locator('.cm-line.tk-error-line')).toHaveText(' "b": 2,');
    await expect(page.locator('.cm-gutterElement.tk-gutter-error')).toHaveText('2');
    await expect(content(page)).toHaveAttribute('aria-invalid', 'true');
  });

  test('F-005.AC3 {"a": True} → invalid-literal at line 1 column 7 with COPY-hint.invalid_literal', async ({
    page,
  }) => {
    await start(page);
    await paste(page, '{"a": True}');
    await expectError(page, 'invalid-literal', 1, 7, COPY['hint.invalid_literal']);
    await expect(marks(page, 'error')).toHaveText('T');
  });

  test('F-005.AC4 two top-level values → extra-content at line 1 column 10', async ({ page }) => {
    await start(page);
    await paste(page, '{"a": 1} {"b": 2}');
    await expectError(page, 'extra-content', 1, 10, COPY['hint.extra_content']);
  });

  test('F-005.AC5 F-005.R4 valid with a duplicate-key and an unsafe-number warning, each located', async ({ page }) => {
    await start(page);
    await paste(page, '{"a":1,"a":2,"id":9007199254740993}');
    await expect(validity(page)).toHaveAttribute('data-validity', 'valid');
    await expect(validity(page)).toHaveText(copy('status.valid_warnings', { count: 2 }));
    await expect(content(page)).not.toHaveAttribute('aria-invalid', 'true');
    // Collapsed by default when there are only warnings (FLOW-02 step 3).
    const expand = panel(page).getByRole('button', { name: COPY['action.expand_issues'] });
    await expect(expand).toHaveAttribute('aria-expanded', 'false');
    await expect(panel(page).getByRole('tab', { name: copy('issue.tab_warnings', { count: 2 }) })).toBeVisible();
    await expect(items(page)).toHaveCount(0);
    await expand.click();
    await expect(panel(page).getByRole('button', { name: COPY['action.collapse_issues'] })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(items(page)).toHaveCount(2);
    await expect(items(page).nth(0)).toContainText(COPY['issue.warning']);
    await expect(items(page).nth(0)).toContainText('duplicate-key');
    await expect(items(page).nth(0)).toContainText(location(1, 8));
    await expect(items(page).nth(0)).toContainText(COPY['hint.duplicate_key']);
    await expect(items(page).nth(1)).toContainText('unsafe-number');
    await expect(items(page).nth(1)).toContainText(location(1, 19));
    await expect(items(page).nth(1)).toContainText(COPY['hint.unsafe_number']);
    // CMP-Editor "warning": dotted marks on the second "a" and on the number; the gutter marks the line.
    await expect(marks(page, 'warning')).toHaveText(['"a"', '9007199254740993']);
    await expect(page.locator('.cm-gutterElement.tk-gutter-warning')).toHaveText('1');
  });

  test('F-005.AC6 F-005.R5 activating an issue moves the cursor to it and scrolls it into view, also horizontally', async ({
    page,
  }) => {
    await start(page);
    const rows = Array.from({ length: 300 }, (_, i) => `  "row ${i}",`).join('\n');
    await paste(page, `[\n${rows}\n  "${'y'.repeat(400)}" 1\n]`);
    await expectError(page, 'missing-comma', 302, 406, COPY['hint.missing_comma']);
    await page.keyboard.press('ControlOrMeta+Home'); // back to the top: the error is far below
    await expect(statusBar(page)).toContainText(copy('status.cursor', { line: 1, column: 1 }));
    await expect.poll(() => inside(marks(page, 'error'), page.locator('.cm-scroller'))).toBe(false);
    await items(page).first().click();
    await expect(statusBar(page)).toContainText(copy('status.cursor', { line: 302, column: 406 }));
    const mark = marks(page, 'error');
    await expect(mark).toHaveText('1');
    await expect.poll(() => inside(mark, page.locator('.cm-scroller'))).toBe(true);
    await expect(content(page)).toBeFocused();
  });

  test('F-005.AC6 CMP-StatusBar activating "Invalid JSON" jumps to the error too', async ({ page }) => {
    await start(page);
    const rows = Array.from({ length: 200 }, (_, i) => `  ${i},`).join('\n');
    await paste(page, `[\n${rows}\n]`);
    await expectError(page, 'trailing-comma', 201, 6, COPY['hint.trailing_comma']);
    await validity(page).getByRole('button', { name: COPY['status.invalid'] }).click();
    await expect(statusBar(page)).toContainText(copy('status.cursor', { line: 201, column: 6 }));
    await expect.poll(() => inside(marks(page, 'error'), page.locator('.cm-scroller'))).toBe(true);
  });

  test('F-005.AC7 F-005.R6 the shown size and line count follow every change', async ({ page }) => {
    await start(page);
    const facts = statusBar(page).locator('.tk-statusbar__size');
    await expect(facts).toHaveText(copy('status.size_lines', { size: '0 B', lines: 1 }).replace('lines', 'line'));
    await paste(page, '[1,\n2]');
    await expect(facts).toHaveText(copy('status.size_lines', { size: '6 B', lines: 2 }));
    await page.keyboard.press('Enter');
    await page.keyboard.type('é');
    await expect(facts).toHaveText(copy('status.size_lines', { size: '9 B', lines: 3 }));
    await expect(app(page)).toHaveAttribute('data-bytes', '9');
    await expect(app(page)).toHaveAttribute('data-lines', '3');
  });

  test('F-005.AC8 F-005.R7 typing in a 50 MB document shows the character at once and "checking" until the result', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await start(page);
    await openFile(page, largeFixture('f005-50mb', 50 * MB));
    await waitIdle(page);
    await expect(validity(page)).toHaveAttribute('data-validity', 'valid', { timeout: 60_000 });
    await content(page).focus(); // the cursor is at the start after a load
    // Measure in the page: key down → first frame showing the typed character (NFR-02).
    await page.evaluate(() => {
      const w = window as unknown as { __typed?: number; __down?: number };
      window.addEventListener('keydown', () => (w.__down = performance.now()), { capture: true, once: true });
      const tick = () => {
        const first = document
          .querySelector('[data-screen] .tk-editor-host')
          ?.shadowRoot?.querySelector('.cm-line')?.textContent;
        if (w.__down !== undefined && first?.startsWith('x')) w.__typed = performance.now() - w.__down;
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.keyboard.type('x');
    await expect(validity(page)).toHaveAttribute('data-validity', 'checking');
    await expect(validity(page)).toHaveText(COPY['status.checking']);
    const typed = () => page.evaluate(() => (window as unknown as { __typed?: number }).__typed ?? null);
    await expect.poll(typed).not.toBeNull();
    expect(await typed()).toBeLessThan(100);
    await expect(validity(page)).toHaveAttribute('data-validity', 'invalid', { timeout: 60_000 });
    await expect(items(page).first()).toContainText(location(1, 1));
  });

  test('F-005.AC9 a document of zero characters shows COPY-status.empty and no issue', async ({ page }) => {
    await start(page);
    await expect(validity(page)).toHaveAttribute('data-validity', 'empty');
    await expect(validity(page)).toHaveText(COPY['status.empty']);
    await expect(panel(page)).toHaveCount(0);
    await paste(page, '[1,]');
    await expect(validity(page)).toHaveAttribute('data-validity', 'invalid');
    await page.getByRole('toolbar').getByRole('button', { name: COPY['action.clear'] }).click();
    await expect(validity(page)).toHaveAttribute('data-validity', 'empty');
    await expect(panel(page)).toHaveCount(0);
    await expect(content(page)).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('F-005.AC10 only spaces and line breaks → empty-document at line 1 column 1', async ({ page }) => {
    await start(page);
    await paste(page, '   \n  \n ');
    await expectError(page, 'empty-document', 1, 1, COPY['hint.empty_document']);
  });

  test('F-005.AC11 RULE-14 10,001 nested arrays → too-deep at the opening bracket of level 10,001', async ({
    page,
  }) => {
    await start(page);
    await paste(page, '['.repeat(10_001) + ']'.repeat(10_001));
    await expectError(page, 'too-deep', 1, 10_001, COPY['hint.too_deep']);
    await expect(items(page).first()).toContainText('10,001');
  });

  test('F-005 edge case: unclosed container is located at the end and the hint names its opening line', async ({
    page,
  }) => {
    await start(page);
    await paste(page, '{\n  "a": [1,\n  2\n');
    await expectError(page, 'unclosed-container', 4, 1, copy('hint.unclosed_container', { bracket: '[', line: 2 }));
  });

  test('F-005 edge case RULE-05 more than 1,000 warnings: 1,000 listed plus COPY-issue.more', async ({ page }) => {
    await start(page);
    await paste(page, '[' + Array(1204).fill('1e999').join(',') + ']');
    await expect(validity(page)).toHaveText(copy('status.valid_warnings', { count: '1,204' }));
    await panel(page).getByRole('button', { name: COPY['action.expand_issues'] }).click();
    await expect(items(page)).toHaveCount(1000);
    await expect(panel(page).getByText(copy('issue.more', { count: 204 }))).toBeVisible();
  });

  test('INV-05 F-005.R7 while re-checking, the previous result is marked as out of date', async ({ page }) => {
    await holdValidation(page);
    await start(page);
    await paste(page, '[1,]');
    await expect(validity(page)).toHaveAttribute('data-validity', 'invalid');
    // Hold validation results so the "checking" state can be observed.
    await page.evaluate(() => ((window as unknown as { __holdValidation?: boolean }).__holdValidation = true));
    await page.keyboard.type(' ');
    await expect(validity(page)).toHaveAttribute('data-validity', 'checking');
    await expect(panel(page)).toHaveAttribute('aria-busy', 'true');
    await expect(items(page)).toHaveCount(1); // the previous error stays listed, marked out of date
    await expect(marks(page, 'error')).toHaveCount(1);
    await page.evaluate(() => ((window as unknown as { __holdValidation?: boolean }).__holdValidation = false));
    for (const key of ['Home', 'ArrowRight', 'ArrowRight', 'Delete']) await page.keyboard.press(key);
    await expect(validity(page)).toHaveAttribute('data-validity', 'valid');
    await expect(panel(page)).toHaveCount(0);
  });
});

test.describe('F-005 CMP-IssuePanel and accessibility', () => {
  test('F-005.R3 SCR-Formatter the error is announced once in a polite status region', async ({ page }) => {
    await start(page);
    const live = statusBar(page).getByRole('status');
    await paste(page, '[1,]');
    await expect(live).toContainText(COPY['status.invalid']);
    await expect(live).toContainText(COPY['hint.trailing_comma']);
    await expect(live).toContainText(location(1, 3));
  });

  test('F-005.R3 SCR-Formatter review F-005 m2 the same error is not announced again on each keystroke', async ({
    page,
  }) => {
    await start(page);
    const live = statusBar(page).getByRole('status');
    await paste(page, '{\n  "a": [1,\n2');
    await expect(live).toContainText(copy('hint.unclosed_container', { bracket: '[', line: 2 }));
    const first = await live.textContent();
    // Typing on the last line moves the end-of-document error, but it is the same error.
    for (const n of [3, 4, 5]) {
      await page.keyboard.type(' ');
      await expect(items(page).first()).toContainText(location(3, n));
      expect(await live.textContent()).toBe(first);
    }
    // A different error is announced.
    await page.keyboard.type('x');
    await expect(live).toContainText(COPY['hint.missing_comma']);
  });

  test('F-005.R2 review F-005 m1 a failed validation is reported instead of "checking" forever', async ({ page }) => {
    await holdValidation(page);
    await start(page);
    await paste(page, '[1]');
    await expect(validity(page)).toHaveAttribute('data-validity', 'valid');
    await page.evaluate(() => ((window as unknown as { __failValidation?: boolean }).__failValidation = true));
    await page.keyboard.type(' ');
    await expect(page.locator('[data-notice-id="error.failed"]')).toBeVisible();
    await expect(validity(page)).not.toHaveAttribute('data-validity', 'checking');
    await page.evaluate(() => ((window as unknown as { __failValidation?: boolean }).__failValidation = false));
    await page.keyboard.type(',');
    await expect(validity(page)).toHaveAttribute('data-validity', 'invalid');
  });

  test('F-005.R5 review F-005 m3 jumping while re-checking uses the position after the edits', async ({ page }) => {
    await holdValidation(page);
    await start(page);
    await paste(page, '[1,]');
    await expect(validity(page)).toHaveAttribute('data-validity', 'invalid');
    await page.evaluate(() => ((window as unknown as { __holdValidation?: boolean }).__holdValidation = true));
    await page.keyboard.press('ControlOrMeta+Home');
    await page.keyboard.type('   ');
    await expect(validity(page)).toHaveAttribute('data-validity', 'checking');
    await items(page).first().click();
    // The comma moved three columns to the right: column 6, not the listed column 3.
    await expect(statusBar(page)).toContainText(copy('status.cursor', { line: 1, column: 6 }));
  });

  test('F-005.R5 CMP-IssuePanel tabs: arrow keys switch between problems and warnings; collapse hides the list', async ({
    page,
  }) => {
    await start(page);
    await paste(page, '[1,]');
    const problems = panel(page).getByRole('tab', { name: copy('issue.tab_problems', { count: 1 }) });
    const warns = panel(page).getByRole('tab', { name: copy('issue.tab_warnings', { count: 0 }) });
    await problems.focus();
    await page.keyboard.press('ArrowRight');
    await expect(warns).toBeFocused();
    await expect(warns).toHaveAttribute('aria-selected', 'true');
    await expect(items(page)).toHaveCount(0);
    await page.keyboard.press('ArrowLeft');
    await expect(problems).toHaveAttribute('aria-selected', 'true');
    await expect(items(page)).toHaveCount(1);
    await panel(page).getByRole('button', { name: COPY['action.collapse_issues'] }).click();
    await expect(items(page)).toHaveCount(0);
    await panel(page).getByRole('button', { name: COPY['action.expand_issues'] }).click();
    await expect(items(page)).toHaveCount(1);
  });

  test('F-005.R6 CMP-StatusBar narrow: short size form, no cursor', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 760 });
    await start(page);
    await paste(page, '[1,\n2]');
    const bar = statusBar(page);
    await expect(bar.locator('.tk-statusbar__size-short')).toHaveText(
      copy('status.size_lines_short', { size: '6 B', lines: 2 }),
    );
    await expect(bar.locator('.tk-statusbar__size')).toBeHidden();
    await expect(bar.locator('.tk-statusbar__cursor')).toBeHidden();
  });

  test('F-005.AC6 CMP-Editor narrow: jumping into a soft-wrapped long line shows the issue', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 760 });
    await start(page);
    const rows = Array.from({ length: 120 }, (_, i) => `  ${i},`).join('\n');
    await paste(page, `[\n${rows}\n  "${'w '.repeat(300)}" x\n]`);
    await expect(validity(page)).toHaveAttribute('data-validity', 'invalid');
    await items(page).first().click();
    await expect.poll(() => inside(marks(page, 'error'), page.locator('.cm-scroller'))).toBe(true);
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`NFR-06 F-005 invalid and warning states pass axe with no CSP violations (${theme})`, async ({ page }) => {
      await start(page, theme);
      await paste(page, '{"a": 1,\n "b": 2,\n}');
      await expect(validity(page)).toHaveAttribute('data-validity', 'invalid');
      const invalid = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(invalid.violations).toEqual([]);
      await content(page).focus();
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.press('Delete');
      await paste(page, '{"a":1,"a":2,"id":9007199254740993}');
      await expect(validity(page)).toHaveAttribute('data-validity', 'valid');
      await panel(page).getByRole('button', { name: COPY['action.expand_issues'] }).click();
      const warnings = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(warnings.violations).toEqual([]);
      expect(await page.evaluate(() => window.__csp)).toEqual([]);
    });
  }
});

test.describe('FLOW-02 find and fix a syntax error', () => {
  test('FLOW-02 F-005.R1 F-005.R5 read the error, jump to it, fix it, and the document becomes valid', async ({
    page,
  }) => {
    await start(page);
    await paste(page, '{\n  "items": [\n    1,\n    2,\n  ]\n}');
    await expectError(page, 'trailing-comma', 4, 6, COPY['hint.trailing_comma']);
    await items(page).first().click();
    await expect(statusBar(page)).toContainText(copy('status.cursor', { line: 4, column: 6 }));
    await page.keyboard.press('Delete');
    await expect(validity(page)).toHaveAttribute('data-validity', 'valid');
    await expect(panel(page)).toHaveCount(0);
    expect(await docText(page)).toBe('{\n  "items": [\n    1,\n    2\n  ]\n}');
  });
});
