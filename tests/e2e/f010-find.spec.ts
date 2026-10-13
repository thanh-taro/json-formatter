// F-010 Find text in the document — end to end on the production build (ADR-0010):
// CMP-SearchPanel (open/close, field, match case, count, previous/next), the platform find
// shortcut while the editor has focus, the toolbar Find action, RULE-18 matching, recounting on
// change, the 100 MB responsiveness criterion (AC6, Chromium) and the narrow/coarse layout.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { instrument } from './fixtures';
import { app, content, COPY, copy, docText, largeFixture, openFile, paste, reportShot, waitIdle } from './load-helpers';

const MB = 1_000_000;

test.beforeEach(async ({ page }) => {
  await instrument(page);
});

async function start(page: Page, theme: 'dark' | 'light' = 'dark') {
  await page.goto(`/?theme=${theme}`);
  await expect(content(page)).toBeVisible();
  await expect(app(page)).toHaveAttribute('data-busy', 'false');
}

/** Pastes `text` into an empty document and puts the cursor at its start. */
async function load(page: Page, text: string) {
  await paste(page, text);
  await expect.poll(() => docText(page)).toBe(text);
  await content(page).focus();
  await page.keyboard.press('ControlOrMeta+Home');
}

const panel = (page: Page) => page.getByRole('search');
const field = (page: Page) => panel(page).getByRole('searchbox', { name: COPY['search.placeholder'] });
/** The visible count (COPY-search.count / counting / none). */
const count = (page: Page) => panel(page).locator('.tk-search__count');
/** The polite live region: the final count only (NFR-06). */
const live = (page: Page) => panel(page).getByRole('status');
const button = (page: Page, id: 'action.find_next' | 'action.find_prev' | 'action.close') =>
  panel(page).getByRole('button', { name: COPY[id] });
const matchCase = (page: Page) => panel(page).getByRole('button', { name: COPY['search.match_case'] });
const current = (page: Page) => page.locator('.tk-find-current');
const others = (page: Page) => page.locator('.tk-find-match');
const findButton = (page: Page) => page.getByRole('toolbar').getByRole('button', { name: COPY['action.find'] });
const of = (current: number, total: number) => copy('search.count', { current, total });

/** Opens find with the platform shortcut from the editor and types `term`. */
async function find(page: Page, term: string) {
  await content(page).focus();
  await page.keyboard.press('ControlOrMeta+f');
  await expect(field(page)).toBeFocused();
  await field(page).fill(term);
}

const THREE = '{\n  "status": "shipped",\n  "previous_status": "packed",\n  "detail": {"status": 3}\n}';

test.describe('F-010 find in the text view', () => {
  test.beforeEach(async ({ page }) => {
    await start(page);
  });

  test('F-010.AC1 F-010.R1 the find shortcut in the editor opens the panel with its field focused; closing returns focus', async ({
    page,
  }) => {
    await load(page, THREE);
    await expect(panel(page)).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+f');
    await expect(panel(page)).toBeVisible();
    await expect(field(page)).toBeFocused();
    await expect(field(page)).toHaveAttribute('placeholder', COPY['search.placeholder']);
    await reportShot(page, 'F-010/open-empty.png');
    // Escape closes and returns focus (CMP-SearchPanel behavior)
    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);
    await expect(content(page)).toBeFocused();
    // the close button does the same
    await page.keyboard.press('ControlOrMeta+f');
    await expect(field(page)).toBeFocused();
    await button(page, 'action.close').click();
    await expect(panel(page)).toHaveCount(0);
    await expect(content(page)).toBeFocused();
  });

  test('F-010.AC2 F-010.R2 F-010.R3 typing "status" selects the first match after the cursor and shows 1 of 3', async ({
    page,
  }) => {
    await load(page, THREE);
    await find(page, 'status');
    await expect(count(page)).toHaveText(of(1, 3));
    await expect(current(page)).toHaveText('status');
    await expect(others(page)).toHaveCount(2);
    await reportShot(page, 'F-010/matches.png');
    // the match is selected: after closing, typing replaces exactly the first "status"
    await page.keyboard.press('Escape');
    await page.keyboard.type('X');
    await expect.poll(() => docText(page)).toBe(THREE.replace('status', 'X'));
  });

  test('F-010.AC3 F-010.R3 from match 3 of 3, next selects match 1; Enter / Shift+Enter move too', async ({ page }) => {
    await load(page, THREE);
    await find(page, 'status');
    await expect(count(page)).toHaveText(of(1, 3));
    await page.keyboard.press('Enter');
    await expect(count(page)).toHaveText(of(2, 3));
    await button(page, 'action.find_next').click();
    await expect(count(page)).toHaveText(of(3, 3));
    await button(page, 'action.find_next').click();
    await expect(count(page)).toHaveText(of(1, 3));
    await field(page).press('Shift+Enter');
    await expect(count(page)).toHaveText(of(3, 3));
    await button(page, 'action.find_prev').click();
    await expect(count(page)).toHaveText(of(2, 3));
    // match 2 is "previous_status"'s "status": closing and typing replaces it
    await field(page).press('Escape');
    await page.keyboard.type('Y');
    await expect.poll(() => docText(page)).toBe(THREE.replace('previous_status', 'previous_Y'));
  });

  test('NFR-06 F-010.R3 the live region announces the final count and navigation, not every slice', async ({
    page,
  }) => {
    await load(page, THREE);
    await find(page, 'status');
    await expect(live(page)).toHaveText(of(1, 3));
    await page.keyboard.press('Enter');
    await expect(live(page)).toHaveText(of(2, 3));
    await field(page).fill('xyz');
    await expect(live(page)).toHaveText(COPY['search.none']);
  });

  test('F-010.AC4 F-010.R4 a term the document does not contain shows COPY-search.none', async ({ page }) => {
    await load(page, THREE);
    await find(page, 'xyz');
    await expect(count(page)).toHaveText(COPY['search.none']);
    await expect(field(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(button(page, 'action.find_next')).toBeDisabled();
    await expect(button(page, 'action.find_prev')).toBeDisabled();
    await expect(current(page)).toHaveCount(0);
    await reportShot(page, 'F-010/no-match.png');
  });

  test('F-010.AC5 F-010.R5 with match case on, only "status" matches, not "Status"', async ({ page }) => {
    await load(page, '{"Status": 1, "status": 2}');
    await find(page, 'status');
    await expect(matchCase(page)).toHaveAttribute('aria-pressed', 'false');
    await matchCase(page).click();
    await expect(matchCase(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(count(page)).toHaveText(of(1, 1));
    await expect(others(page)).toHaveCount(0);
    await field(page).focus();
    await page.keyboard.press('Escape');
    await page.keyboard.type('Z');
    await expect.poll(() => docText(page)).toBe('{"Status": 1, "Z": 2}');
  });

  test('F-010.AC8 RULE-18 with match case off, "Status" and "status" both match: 1 of 2', async ({ page }) => {
    await load(page, '{"Status": 1, "status": 2}');
    await find(page, 'status');
    await expect(matchCase(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(count(page)).toHaveText(of(1, 2));
  });

  test('F-010.AC9 RULE-18 in "aaaa", "aa" shows 1 of 2 (matches never overlap)', async ({ page }) => {
    await load(page, 'aaaa');
    await find(page, 'aa');
    await expect(count(page)).toHaveText(of(1, 2));
    await expect(current(page)).toHaveCount(1);
    await expect(others(page)).toHaveCount(1);
  });

  test('F-010.AC10 deleting one of 3 counted occurrences recounts to "of 2"', async ({ page }) => {
    await load(page, THREE);
    await find(page, 'status');
    await expect(count(page)).toHaveText(of(1, 3));
    // delete the last occurrence in the editor while find stays open
    await content(page).click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.press('ArrowUp'); // line 4
    await page.keyboard.press('End');
    const line4 = '  "detail": {"status": 3}';
    for (let i = 0; i < line4.length - line4.indexOf('status') - 'status'.length; i++)
      await page.keyboard.press('ArrowLeft');
    for (let i = 0; i < 'status'.length; i++) await page.keyboard.press('Backspace');
    await expect.poll(() => docText(page)).toBe(THREE.replace('{"status": 3}', '{"": 3}'));
    await expect(panel(page)).toBeVisible();
    await expect(count(page)).toHaveText(/ of 2$/);
  });

  test('F-010.AC7 F-010.R1 the toolbar Find action opens the panel with its field focused', async ({ page }) => {
    await load(page, THREE);
    await findButton(page).click();
    await expect(panel(page)).toBeVisible();
    await expect(field(page)).toBeFocused();
    await field(page).fill('packed');
    await expect(count(page)).toHaveText(of(1, 1));
  });

  test('F-010.R1 CMP-Toolbar the Find action is disabled on an empty document', async ({ page }) => {
    await expect(findButton(page)).toBeDisabled();
  });

  test('F-010.R1 the find shortcut inside the open panel keeps focus in the field and selects its text', async ({
    page,
  }) => {
    await load(page, THREE);
    await find(page, 'status');
    await button(page, 'action.find_next').focus();
    await page.keyboard.press('ControlOrMeta+f');
    await expect(field(page)).toBeFocused();
    expect(await field(page).evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd])).toEqual([0, 6]);
  });

  test('F-010.R2 the current match is scrolled into view; only matches in the visible range are drawn', async ({
    page,
  }) => {
    const rows = Array.from({ length: 3000 }, (_, i) => `  {"id": ${i}, "tag": "t${i}"},`).join('\n');
    await paste(page, `[\n${rows}\n  {"needle": true}\n]`);
    await expect(app(page)).toHaveAttribute('data-lines', '3003');
    await content(page).focus();
    await page.keyboard.press('ControlOrMeta+Home');
    await find(page, 'needle');
    await expect(count(page)).toHaveText(of(1, 1));
    await expect(current(page)).toBeInViewport();
    // "tag" occurs 3000 times; only the visible ones are decorated
    await field(page).fill('tag');
    await expect(count(page)).toHaveText(copy('search.count', { current: 1, total: (3000).toLocaleString('en-US') }));
    expect(await others(page).count()).toBeLessThan(200);
  });

  test('F-010.R1 after closing find the editor is editable at the selected match', async ({ page }) => {
    await load(page, '[1]');
    await find(page, '1');
    await expect(count(page)).toHaveText(of(1, 1));
    await page.keyboard.press('Escape');
    await page.keyboard.type('2');
    await expect.poll(() => docText(page)).toBe('[2]');
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`NFR-06 CMP-SearchPanel matches and no-match states pass axe with no CSP violations (${theme})`, async ({
      page,
    }) => {
      await start(page, theme);
      await load(page, THREE);
      await find(page, 'status');
      await expect(count(page)).toHaveText(of(1, 3));
      const matches = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(matches.violations).toEqual([]);
      await field(page).fill('xyz');
      await expect(count(page)).toHaveText(COPY['search.none']);
      const none = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(none.violations).toEqual([]);
      if (theme === 'light') await reportShot(page, 'F-010/no-match-light.png');
      expect(await page.evaluate(() => window.__csp)).toEqual([]);
    });
  }

  test('F-010.R1 CMP-SearchPanel narrow: match case and count move under the field', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 760 });
    await load(page, THREE);
    await find(page, 'status');
    await expect(count(page)).toHaveText(of(1, 3));
    const f = (await field(page).boundingBox())!;
    const t = (await matchCase(page).boundingBox())!;
    const c = (await count(page).boundingBox())!;
    const x = (await button(page, 'action.close').boundingBox())!;
    expect(t.y).toBeGreaterThanOrEqual(f.y + f.height);
    expect(c.y).toBeGreaterThanOrEqual(f.y + f.height - 1);
    expect(Math.abs(x.y - f.y)).toBeLessThan(f.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await reportShot(page, 'F-010/narrow.png');
  });
});

test('F-010.R1 NFR-06 CMP-SearchPanel coarse pointer: every control is at least 44 px', async ({
  browser,
  browserName,
}) => {
  test.skip(browserName === 'firefox', 'Firefox has no mobile emulation');
  const context = await browser.newContext({
    viewport: { width: 390, height: 760 },
    hasTouch: true,
    isMobile: browserName === 'chromium',
  });
  const page = await context.newPage();
  await instrument(page);
  await start(page);
  await load(page, THREE);
  await content(page).focus();
  await page.keyboard.press('ControlOrMeta+f');
  await field(page).fill('status');
  await expect(count(page)).toHaveText(of(1, 3));
  for (const target of [
    field(page),
    matchCase(page),
    button(page, 'action.find_prev'),
    button(page, 'action.find_next'),
    button(page, 'action.close'),
  ]) {
    const box = (await target.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
  await reportShot(page, 'F-010/narrow-coarse.png');
  await context.close();
});

test('F-010.AC6 F-010.R6 NFR-02 in a 100 MB document typing a term stays responsive and the first match appears before the count is final; editing with find open recounts without blanking', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', '100 MB responsiveness is measured in Chromium (ADR-0004, SP-editor)');
  test.setTimeout(300_000);
  await start(page);
  await openFile(page, largeFixture('f010-100mb', 100 * MB));
  await waitIdle(page);
  await expect(app(page)).toHaveAttribute('data-bytes', String(100 * MB), { timeout: 120_000 });
  await content(page).focus();
  await page.keyboard.press('ControlOrMeta+f');
  await expect(field(page)).toBeFocused();
  // In the page: every count text shown (in order), and per keystroke the time from key down to
  // the first frame showing the typed character in the field (NFR-02: ≤ 100 ms).
  await page.evaluate(() => {
    const w = window as unknown as { __counts: string[]; __lat: number[] };
    w.__counts = [];
    w.__lat = [];
    const root = document.querySelector('[role="search"]')!;
    const status = root.querySelector('.tk-search__count')!;
    new MutationObserver(() => w.__counts.push(status.textContent ?? '')).observe(status, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    const input = root.querySelector('input')!;
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key.length !== 1) return;
        const down = performance.now();
        const want = input.value.length + 1;
        const tick = () => {
          if (input.value.length >= want) w.__lat.push(performance.now() - down);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { capture: true },
    );
  });
  await page.keyboard.type('item', { delay: 120 });
  // the final count has no "+"
  await expect(count(page)).toHaveText(/^1 of [\d,.\s]+$/, { timeout: 60_000 });
  const { counts, lat } = await page.evaluate(() => {
    const w = window as unknown as { __counts: string[]; __lat: number[] };
    return { counts: w.__counts, lat: w.__lat };
  });
  expect(lat).toHaveLength(4);
  expect(Math.max(...lat)).toBeLessThan(100);
  // after the last keystroke: "1 of N+" (first match shown, counting) before the final "1 of N"
  const finalAt = counts.length - 1;
  expect(counts[finalAt]).toMatch(/^1 of [\d,.\s]+$/);
  const countingAt = counts.findLastIndex((c, i) => i < finalAt && /^1 of [\d,.\s]+\+$/.test(c));
  expect(countingAt).toBeGreaterThanOrEqual(0);
  // review F-010 m2: once shown, the count never blanks while a new term is counted
  const firstShown = counts.findIndex((c) => c !== '');
  expect(counts.slice(firstShown).filter((c) => c === '')).toEqual([]);
  await expect(current(page)).toHaveText('item');
  await reportShot(page, 'F-010/counting-100mb.png');
  const total = Number((await count(page).textContent())!.replace(/^1 of /, '').replace(/\D/g, ''));

  // Typing in the editor with find open (the selected first match is replaced): the keystroke
  // shows within NFR-02, the count and highlights stay while recounting, then "of N-1".
  await page.evaluate(() => {
    const w = window as unknown as { __counts: string[]; __typed?: number };
    w.__counts = [];
    const down = { at: 0 };
    window.addEventListener('keydown', () => (down.at = performance.now()), { capture: true, once: true });
    const tick = () => {
      const lines = document.querySelector('.tk-editor-host')?.shadowRoot?.querySelectorAll('.cm-line') ?? [];
      if (down.at && [...lines].some((l) => l.textContent?.includes('"X-f010')))
        w.__typed = performance.now() - down.at;
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await content(page).focus();
  await page.keyboard.type('X');
  const typed = () => page.evaluate(() => (window as unknown as { __typed?: number }).__typed ?? null);
  await expect.poll(typed).not.toBeNull();
  expect(await typed()).toBeLessThan(100);
  await expect(count(page)).toHaveText(
    copy('search.count', { current: 1, total: (total - 1).toLocaleString('en-US') }),
    {
      timeout: 60_000,
    },
  );
  const recounts = await page.evaluate(() => (window as unknown as { __counts: string[] }).__counts);
  expect(recounts.filter((c) => c === '')).toEqual([]);
  await expect(current(page)).toHaveCount(1);
});
