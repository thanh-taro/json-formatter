// Post-deploy smoke test (QA-026, MOD-Build, ADR-0009): `pnpm smoke:prod <url>`.
// Fetches the deployed site and asserts the security headers per path, that no source map and
// no build manifest is served, that the open-source notices are served, and that the page opens
// in a headless Chromium with zero requests of its own after load (NFR-01; the browser's own
// offline-cache fetches of /sw.js are the D-021 exception). Read-only: it only sends GET requests.
//
//   pnpm smoke:prod https://json-formatter.tarokit.app
//   pnpm smoke:prod http://127.0.0.1:8787            (local `wrangler dev`; HSTS is not asserted over http)
//   SMOKE_FRAME_ANCESTORS="https://tarokit.app"     expected frame-ancestors list (default: that value)
//   pnpm smoke:prod <url> --no-browser              headers only
// Exit code 0 = all assertions pass, 1 = at least one failed, 2 = bad usage.
import { pathToFileURL } from 'node:url';

const EXPECTED_ANCESTORS = (process.env.SMOKE_FRAME_ANCESTORS ?? 'https://tarokit.app').split(/\s+/).filter(Boolean);
const SW_CSP = "default-src 'none'; connect-src 'self'";
const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Parses a CSP header into a Map of directive → value list. */
export function parseCsp(value) {
  const out = new Map();
  for (const part of value.split(';')) {
    const [name, ...rest] = part.trim().split(/\s+/);
    if (name) out.set(name.toLowerCase(), rest);
  }
  return out;
}

/** Header assertions for one response; returns a list of failure messages. */
export const CHECKS = {
  page(h, { https }) {
    const fails = [];
    const csp = h.get('content-security-policy');
    if (!csp) fails.push('Content-Security-Policy missing');
    else {
      const d = parseCsp(csp);
      const is = (name, want) => JSON.stringify(d.get(name)) === JSON.stringify(want);
      if (!is('connect-src', ["'none'"])) fails.push(`CSP connect-src is not 'none': ${d.get('connect-src')}`);
      if (!is('default-src', ["'none'"])) fails.push(`CSP default-src is not 'none': ${d.get('default-src')}`);
      if (!is('frame-ancestors', EXPECTED_ANCESTORS)) {
        fails.push(
          `CSP frame-ancestors is "${d.get('frame-ancestors')?.join(' ')}", want "${EXPECTED_ANCESTORS.join(' ')}"`,
        );
      }
      const script = (d.get('script-src') ?? []).join(' ');
      if (/unsafe-inline|unsafe-eval|https?:|\*/.test(script)) fails.push(`CSP script-src too loose: ${script}`);
      if (!/^'self' 'sha256-[\w+/=]+'$/.test(script)) fails.push(`CSP script-src is not 'self' + boot hash: ${script}`);
      for (const [n, v] of [
        ['object-src', ["'none'"]],
        ['base-uri', ["'none'"]],
        ['form-action', ["'none'"]],
      ]) {
        if (!is(n, v)) fails.push(`CSP ${n} is not 'none'`);
      }
    }
    if (h.has('x-frame-options')) fails.push('X-Frame-Options must not be sent (it would block the portal)');
    return fails.concat(common(h, { https }));
  },
  sw(h, { https }) {
    const fails = [];
    if (h.get('content-security-policy') !== SW_CSP) {
      fails.push(
        `/sw.js CSP must be exactly "${SW_CSP}" (page policy detached), got "${h.get('content-security-policy')}"`,
      );
    }
    if (h.get('cache-control') !== 'public, max-age=86400') {
      fails.push(`/sw.js Cache-Control must be "public, max-age=86400", got "${h.get('cache-control')}"`);
    }
    if (!/javascript/.test(h.get('content-type') ?? '')) fails.push(`/sw.js content-type: ${h.get('content-type')}`);
    return fails.concat(common(h, { https }));
  },
  asset(h, { https }) {
    const fails = [];
    if (h.get('cache-control') !== 'public, max-age=31536000, immutable') {
      fails.push(`/assets Cache-Control must be immutable, got "${h.get('cache-control')}"`);
    }
    return fails.concat(common(h, { https }));
  },
};

function common(h, { https }) {
  const fails = [];
  if (h.get('x-content-type-options')?.toLowerCase() !== 'nosniff')
    fails.push('X-Content-Type-Options: nosniff missing');
  if (h.get('referrer-policy') !== 'no-referrer') fails.push(`Referrer-Policy is "${h.get('referrer-policy')}"`);
  if (h.get('cross-origin-opener-policy') !== 'same-origin')
    fails.push('Cross-Origin-Opener-Policy: same-origin missing');
  if (h.has('set-cookie')) fails.push('Set-Cookie must never be sent');
  const pp = h.get('permissions-policy') ?? '';
  for (const want of ['clipboard-write=(self)', 'clipboard-read=()', 'camera=()', 'microphone=()', 'geolocation=()']) {
    if (!pp.split(/,\s*/).includes(want)) fails.push(`Permissions-Policy lacks ${want}`);
  }
  if (https) {
    const m = /max-age=(\d+)/.exec(h.get('strict-transport-security') ?? '');
    if (!m || Number(m[1]) < 31536000)
      fails.push(`Strict-Transport-Security missing or max-age < 1 year: ${h.get('strict-transport-security')}`);
  }
  return fails;
}

export async function run(base, { browser = true } = {}) {
  const url = new URL(base);
  const https = url.protocol === 'https:';
  if (!https && !(url.protocol === 'http:' && LOCAL.has(url.hostname))) {
    throw new Error(`refusing ${base}: production must be https (http only for localhost)`);
  }
  const origin = url.origin;
  const results = [];
  const check = (name, fails) => results.push({ name, ok: fails.length === 0, fails });
  const get = async (p) => {
    const res = await fetch(origin + p, { redirect: 'manual', headers: { 'Accept-Encoding': 'identity' } });
    const headers = new Map([...res.headers].map(([k, v]) => [k.toLowerCase(), v]));
    return { status: res.status, headers, body: Buffer.from(await res.arrayBuffer()).toString('utf8') };
  };

  // Page
  const page = await get('/');
  check('GET / answers 200 text/html, no redirect', [
    ...(page.status === 200 ? [] : [`status ${page.status}`]),
    ...(/^text\/html/.test(page.headers.get('content-type') ?? '')
      ? []
      : [`content-type ${page.headers.get('content-type')}`]),
    ...(page.headers.get('cache-control') === 'no-cache'
      ? []
      : [`Cache-Control "${page.headers.get('cache-control')}", want no-cache`]),
  ]);
  check(
    'GET / security headers (CSP connect-src none, frame-ancestors, HSTS, Permissions-Policy, nosniff)',
    CHECKS.page(page.headers, { https }),
  );
  if (!https) results.push({ name: 'HSTS over http', ok: true, fails: [], note: 'skipped (http origin)' });

  // Assets named by the page
  const refs = [...page.body.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  const scripts = [...new Set(refs)].filter((r) => /\.js$/.test(r));
  check(
    'index.html references hashed /assets/ files',
    refs.length > 0 && scripts.length > 0 ? [] : ['no /assets/ references found'],
  );
  if (refs.length) {
    const a = await get(refs[0]);
    check(`GET ${refs[0]} 200, immutable, page headers`, [
      ...(a.status === 200 ? [] : [`status ${a.status}`]),
      ...CHECKS.asset(a.headers, { https }),
    ]);
  }

  // Service worker
  const sw = await get('/sw.js');
  check('GET /sw.js 200 with its own CSP (page CSP detached) and max-age=86400', [
    ...(sw.status === 200 ? [] : [`status ${sw.status}`]),
    ...CHECKS.sw(sw.headers, { https }),
  ]);
  if (/SW_KILL|unregister\(\)/.test(sw.body) && !/fetch/.test(sw.body)) {
    results.push({
      name: 'sw.js is the kill-switch build',
      ok: true,
      fails: [],
      note: 'NOTE: SW_KILL build deployed (recovery mode)',
    });
  }

  // No source maps, manifest or deploy files
  const mapFails = [];
  for (const f of [...scripts, '/sw.js']) {
    const body = f === '/sw.js' ? sw.body : (await get(f)).body;
    if (/sourceMappingURL=/.test(body)) mapFails.push(`${f} still carries a sourceMappingURL comment`);
    const m = await get(f + '.map');
    if (m.status === 200 && !/^text\/html/.test(m.headers.get('content-type') ?? ''))
      mapFails.push(`${f}.map is served (status 200)`);
    if (m.status === 200 && /"mappings"/.test(m.body)) mapFails.push(`${f}.map serves a source map`);
  }
  for (const f of ['/.vite/manifest.json', '/_headers', '/.assetsignore']) {
    const r = await get(f);
    if (r.status === 200 && !/^text\/html/.test(r.headers.get('content-type') ?? '')) mapFails.push(`${f} is served`);
    if (r.status === 200 && /^text\/html/.test(r.headers.get('content-type') ?? '') && r.body === page.body)
      mapFails.push(`${f} falls back to the page (unexpected SPA fallback)`);
  }
  check('No .map files, build manifest, _headers or .assetsignore served', mapFails);

  // Notices
  const notices = await get('/third-party-notices.txt');
  check('GET /third-party-notices.txt 200 text/plain with content', [
    ...(notices.status === 200 ? [] : [`status ${notices.status}`]),
    ...(/^text\/plain/.test(notices.headers.get('content-type') ?? '')
      ? []
      : [`content-type ${notices.headers.get('content-type')}`]),
    ...(notices.body.length > 1000 && /preact/i.test(notices.body)
      ? []
      : ['file empty or lacks the expected packages']),
    ...common(notices.headers, { https }),
  ]);

  // Unknown path
  const nf = await get('/definitely-not-here-' + Date.now());
  check('Unknown path answers 404 (no fallback page)', nf.status === 404 ? [] : [`status ${nf.status}`]);

  if (browser) results.push(await browserCheck(origin));
  return results;
}

/** Opens the page in headless Chromium, uses the tool, and asserts the NFR-01 request rule. */
async function browserCheck(origin) {
  const name = 'Headless Chromium: page loads, tool works, zero requests after load, no CSP violations';
  const { chromium } = await import('@playwright/test');
  const b = await chromium.launch();
  const fails = [];
  const notes = [];
  try {
    const context = await b.newContext({ serviceWorkers: 'allow' });
    const page = await context.newPage();
    const seen = [];
    let mark = null;
    context.on('request', (r) =>
      seen.push({ t: Date.now(), method: r.method(), url: r.url(), type: r.resourceType() }),
    );
    await page.addInitScript(() => {
      window.__violations = [];
      document.addEventListener('securitypolicyviolation', (e) =>
        window.__violations.push(`${e.violatedDirective} ${e.blockedURI}`),
      );
    });
    const consoleErrors = [];
    page.on('pageerror', (e) => consoleErrors.push(String(e)));
    const res = await page.goto(origin + '/?theme=dark', { waitUntil: 'load' });
    if (res?.status() !== 200) fails.push(`page status ${res?.status()}`);
    await page.getByRole('toolbar', { name: 'Document actions' }).waitFor({ timeout: 15000 });
    await page.waitForTimeout(1500); // let the page and the offline worker finish opening
    mark = Date.now();
    const editor = page.locator('.cm-content').first();
    await editor.click();
    await page.keyboard.type('{"smoke":[1,2,3]}');
    await page.getByRole('toolbar').getByRole('button', { name: 'Beautify' }).click();
    await page
      .getByRole('status')
      .filter({ hasText: /valid/i })
      .first()
      .waitFor({ timeout: 10000 })
      .catch(() => fails.push('no validity status after Beautify'));
    await page.waitForTimeout(3000);

    const foreign = seen.filter((r) => /^https?:/.test(r.url) && new URL(r.url).origin !== origin);
    if (foreign.length) fails.push(`cross-origin requests: ${foreign.map((r) => r.url).join(', ')}`);
    const after = seen.filter((r) => r.t > mark);
    const stray = after.filter((r) => !(r.method === 'GET' && new URL(r.url).pathname === '/sw.js'));
    if (stray.length) fails.push(`requests after load: ${stray.map((r) => `${r.method} ${r.url}`).join(', ')}`);
    if (after.length - stray.length)
      notes.push(`${after.length - stray.length} browser /sw.js update check (D-021 exception)`);
    const v = await page.evaluate(() => window.__violations);
    if (v.length) fails.push(`CSP violations: ${v.join('; ')}`);
    if (consoleErrors.length) fails.push(`page errors: ${consoleErrors.join('; ')}`);
    const frameAncestorsOk = await page.evaluate(() => window.top === window);
    if (!frameAncestorsOk) fails.push('page unexpectedly framed');
    notes.push(`${seen.length} requests in total during load, all same-origin`);
  } catch (e) {
    fails.push(`browser run failed: ${e.message}`);
  } finally {
    await b.close();
  }
  return { name, ok: fails.length === 0, fails, note: notes.join('; ') };
}

async function main() {
  const args = process.argv.slice(2);
  const url = args.find((a) => !a.startsWith('--'));
  if (!url) {
    console.error(
      'usage: pnpm smoke:prod <url> [--no-browser]   e.g. pnpm smoke:prod https://json-formatter.tarokit.app',
    );
    process.exit(2);
  }
  let results;
  try {
    results = await run(url, { browser: !args.includes('--no-browser') });
  } catch (e) {
    console.error(`smoke: ${e.message}`);
    process.exit(2);
  }
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.note ? `  (${r.note})` : ''}`);
    for (const f of r.fails) console.log(`        - ${f}`);
  }
  const bad = results.filter((r) => !r.ok).length;
  console.log(
    bad
      ? `\nsmoke: ${bad} of ${results.length} checks FAILED for ${url}`
      : `\nsmoke: all ${results.length} checks passed for ${url}`,
  );
  process.exit(bad ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
