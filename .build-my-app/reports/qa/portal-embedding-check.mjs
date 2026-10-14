// Real-portal embedding check: taro-kit's built tool view (sample-dev page, retargeted at the JSON Formatter)
// framing the JSON Formatter production build, both served on their real https origins via routing.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const JF = '/Users/er_lap_mam3_016/Documents/personals/taro-kit-tools/developer-tools/json-formatter';
const TK = '/Users/er_lap_mam3_016/Documents/personals/taro-kit';
const require = createRequire(path.join(JF, 'package.json'));
const pw = require('@playwright/test');

const PORTAL = 'https://tarokit.app';
const TOOL = 'https://json-formatter.tarokit.app';

function parseHeaders(src) {
  const rules = [];
  let cur = null;
  for (const line of src.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) { cur = { pattern: line.trim(), ops: [] }; rules.push(cur); continue; }
    const t = line.trim();
    if (t.startsWith('!')) cur.ops.push({ del: t.slice(1).trim().toLowerCase() });
    else { const i = t.indexOf(':'); cur.ops.push({ name: t.slice(0, i).trim(), value: t.slice(i + 1).trim() }); }
  }
  return (p) => {
    const h = {};
    for (const r of rules) {
      const m = r.pattern.endsWith('*') ? p.startsWith(r.pattern.slice(0, -1)) : p === r.pattern;
      if (!m) continue;
      for (const op of r.ops) if (op.del) delete h[op.del]; else h[op.name.toLowerCase()] = op.value;
    }
    return h;
  };
}
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.txt': 'text/plain' };

function server(dir, headersFor, transformHtml) {
  return async (route) => {
    const u = new URL(route.request().url());
    let p = decodeURIComponent(u.pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(dir, path.normalize(p));
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory())
      return route.fulfill({ status: 404, body: 'not found' });
    let body = fs.readFileSync(file);
    if (transformHtml && file.endsWith('.html')) body = transformHtml(body.toString('utf8'));
    route.fulfill({ status: 200, headers: { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', ...headersFor(u.pathname) }, body });
  };
}

const portalHeaders = parseHeaders(
  fs.readFileSync(path.join(TK, 'dist/_headers'), 'utf8')
    // as the portal build will emit once the tool is visible (permissionsPolicy in MOD-SecurityPolicy)
    .replace('clipboard-write=()', `clipboard-write=(self "${TOOL}")`),
);
const toolHeaders = parseHeaders(fs.readFileSync(path.join(JF, 'dist/_headers'), 'utf8'));
// The sample-dev tool view, retargeted at the JSON Formatter (url, CSP frame-src, island props).
const retarget = (html) => html.replaceAll('https://sample-dev.tarokit.app', TOOL);

const results = [];
let lastStep = 'start';
const check = (name, ok, detail = '') => { lastStep = name; results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

for (const browserName of ['chromium', 'webkit']) {
  console.log(`\n== ${browserName}`);
  const browser = await pw[browserName].launch();
  const ctx = await browser.newContext({ colorScheme: 'dark', serviceWorkers: 'block', viewport: { width: 1280, height: 800 } });
  await ctx.route(`${PORTAL}/**`, server(path.join(TK, 'dist'), portalHeaders, retarget));
  await ctx.route(`${TOOL}/**`, server(path.join(JF, 'dist'), toolHeaders));
  // Record what the tool frame receives and sends.
  await ctx.addInitScript(() => {
    if (location.origin !== 'https://json-formatter.tarokit.app') return;
    window.__got = [];
    window.addEventListener('message', (e) => window.__got.push({ origin: e.origin, data: e.data }));
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0,40) + ' @ ' + (m.location()?.url ?? '') + ' after: ' + lastStep); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(`${PORTAL}/t/sample-dev/`);
  const iframe = page.locator('iframe');
  await iframe.waitFor();
  const src = await iframe.getAttribute('src');
  check('frame src carries the theme showing (F-012.AC5)', src === `${TOOL}/?theme=dark`, src);
  const frame = page.frameLocator('iframe');
  const f = () => page.frames().find((x) => x.url().startsWith(TOOL));
  await frame.locator('.cm-content, [role="textbox"]').first().waitFor({ timeout: 15000 });
  check('tool loads inside the portal frame', true);
  const themeOf = () => f().evaluate(() => document.documentElement.getAttribute('data-theme'));
  check('tool shows dark', (await themeOf()) === 'dark');

  // Ready handshake answered with the theme showing (F-012.AC7 / F-008.R5).
  await page.waitForTimeout(500);
  const got = await f().evaluate(() => window.__got);
  check('portal answered ready with taro:theme dark from its own origin', got.some((m) => m.origin === PORTAL && m.data?.type === 'taro:theme' && m.data.value === 'dark'), JSON.stringify(got));

  // Toggle the portal theme: the tool follows without reloading (F-012.AC6).
  await f().evaluate(() => { window.__marker = 42; });
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'light');
  await f().waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'light', null, { timeout: 3000 }).catch(() => {});
  check('tool switched to light on portal toggle', (await themeOf()) === 'light');
  check('without reloading', (await f().evaluate(() => window.__marker)) === 42);
  const bg = await f().evaluate(() => getComputedStyle(document.body).backgroundColor);
  console.log('      tool body background (light):', bg);
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await f().waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'dark', null, { timeout: 3000 }).catch(() => {});
  check('and back to dark', (await themeOf()) === 'dark');
  const got2 = await f().evaluate(() => window.__got);
  const extra = got2.filter((m) => !(m.data?.type === 'taro:theme'));
  check('nothing but taro:theme messages reached the tool', extra.length === 0, JSON.stringify(extra));

  // A quick feature check inside the real frame.
  const editor = frame.locator('.cm-content').first();
  await editor.click();
  await page.keyboard.insertText('{"a":[1,2],"b":{}}');
  await frame.getByRole('button', { name: /^Beautify/ }).first().click();
  await page.waitForTimeout(1500);
  const txt = await editor.innerText();
  check('Beautify works inside the portal frame', txt.includes('"a": ['), JSON.stringify(txt.slice(0, 60)));

  if (process.env.SHOT) await page.screenshot({ path: path.join(path.dirname(new URL(import.meta.url).pathname), `${browserName}.png`), caret: 'initial' });
  const cspErrors = errors.filter((e) => /Content Security Policy|Refused|frame-ancestors|blocked/i.test(e));
  check('no CSP / framing errors in the console', cspErrors.length === 0, cspErrors.join(' | '));
  if (errors.length) console.log('      console errors:', errors);
  await browser.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
