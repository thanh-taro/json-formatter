// E2E fixture server (ADR-0010). Serves the production build (dist/) on the tool origin with
// the generated _headers applied the way Cloudflare static assets applies them, plus a stub
// portal host on a second origin and an unlisted origin for refusal tests.
//   tool      http://localhost:4173   (dist/, headers from dist/_headers)
//   host      http://localhost:4174   (tests/e2e/host/, allow-listed as frame ancestor)
//   unlisted  http://localhost:4175   (tests/e2e/host/, not allow-listed)
//   admin     http://localhost:4179   (/health, /log, /reset — server-side request log, NFR-01)
// The deployed HOST_ORIGINS list (https://tarokit.app) is replaced by the stub host origin here,
// because the stub host cannot run on the real portal origin. The setting has two outputs
// (ADR-0008 §4) and both are replaced: the frame-ancestors header and the compiled-in
// allow-list in the served scripts (each deployed origin's string literal).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = path.join(ROOT, 'dist');
const HOST_DIR = path.join(ROOT, 'tests/e2e/host');
// E2E_PORT_BASE (default 4173) lets parallel worktrees run the suite without colliding.
const BASE = Number(process.env.E2E_PORT_BASE ?? 4173);
export const PORTS = { tool: BASE, host: BASE + 1, unlisted: BASE + 2, admin: BASE + 6 };
const HOST_ORIGIN = `http://localhost:${PORTS.host}`;

if (!fs.existsSync(path.join(DIST, 'index.html')) || !fs.existsSync(path.join(DIST, '_headers'))) {
  console.error('dist/ is missing: run `pnpm build` before the e2e tests.');
  process.exit(1);
}

/** Cloudflare `_headers` semantics: every matching rule applies in order, values of a header
 * set by several rules are joined with ", ", and "! Name" removes what earlier rules set. */
function parseHeaders(src) {
  const rules = [];
  let cur = null;
  for (const line of src.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      cur = { pattern: line.trim(), ops: [] };
      rules.push(cur);
      continue;
    }
    const t = line.trim();
    if (t.startsWith('!')) cur.ops.push({ del: t.slice(1).trim().toLowerCase() });
    else {
      const i = t.indexOf(':');
      cur.ops.push({ name: t.slice(0, i).trim(), value: t.slice(i + 1).trim() });
    }
  }
  return rules;
}
const builtHeaders = fs.readFileSync(path.join(DIST, '_headers'), 'utf8');
const DEPLOYED_ORIGINS = (/frame-ancestors ([^;\n]+)/.exec(builtHeaders)?.[1] ?? '')
  .split(/\s+/)
  .filter((o) => /^https?:\/\//.test(o));
const headersSrc = builtHeaders.replace(/frame-ancestors [^;\n]+/g, `frame-ancestors ${HOST_ORIGIN}`);

/** The compiled-in allow-list, with each deployed origin literal replaced by the stub host. */
const ORIGIN_LITERALS = DEPLOYED_ORIGINS.map(
  (o) => new RegExp(`(["'\`])${o.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\1`, 'g'),
);
function rewriteAllowList(body) {
  let text = body.toString('utf8');
  for (const literal of ORIGIN_LITERALS) text = text.replace(literal, `$1${HOST_ORIGIN}$1`);
  return text;
}
// Fail loudly when the bundle shape changes and the rewrite would silently miss the list.
{
  const assets = path.join(DIST, 'assets');
  const js = fs.readdirSync(assets).filter((f) => f.endsWith('.js'));
  const found = ORIGIN_LITERALS.map((re) =>
    js.some((f) => new RegExp(re.source).test(fs.readFileSync(path.join(assets, f), 'utf8'))),
  );
  if (found.includes(false)) {
    console.error(
      `e2e: compiled-in allow-list not found in dist/assets/*.js for ${DEPLOYED_ORIGINS.filter((_, i) => !found[i]).join(' ')}; the stub host could not be allow-listed.`,
    );
    process.exit(1);
  }
}
const RULES = parseHeaders(headersSrc);
const matches = (pattern, p) => (pattern.endsWith('*') ? p.startsWith(pattern.slice(0, -1)) : p === pattern);
function headersFor(p) {
  const h = new Map();
  for (const r of RULES) {
    if (!matches(r.pattern, p)) continue;
    for (const op of r.ops) {
      if (op.del) h.delete(op.del);
      else {
        const k = op.name.toLowerCase();
        h.set(k, h.has(k) ? [op.name, `${h.get(k)[1]}, ${op.value}`] : [op.name, op.value]);
      }
    }
  }
  return Object.fromEntries(h.values());
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
};

let log = [];
const t0 = Date.now();

function serve(res, dir, urlPath, extraHeaders, transformJs, transformHtml) {
  const p = urlPath === '/' ? '/index.html' : urlPath;
  const file = path.join(dir, path.normalize(decodeURIComponent(p)).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(dir + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('not found');
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', ...extraHeaders });
  const body = fs.readFileSync(file);
  const ext = path.extname(file);
  res.end(
    transformJs && ext === '.js' ? transformJs(body) : transformHtml && ext === '.html' ? transformHtml(body) : body,
  );
}

function tool(req, res) {
  const u = new URL(req.url, `http://${req.headers.host}`);
  log.push({
    t: Date.now() - t0,
    method: req.method,
    path: u.pathname + u.search,
    dest: req.headers['sec-fetch-dest'] ?? null,
  });
  serve(res, DIST, u.pathname, headersFor(u.pathname), rewriteAllowList);
}

// Stub host pages get the port base injected, whichever port (host or unlisted) serves them.
const injectBase = (body) => body.toString('utf8').replaceAll('__E2E_PORT_BASE__', String(BASE));
const host = (req, res) =>
  serve(res, HOST_DIR, new URL(req.url, 'http://x').pathname, { 'Cache-Control': 'no-store' }, null, injectBase);

function admin(req, res) {
  const u = new URL(req.url, 'http://x');
  res.setHeader('Content-Type', 'application/json');
  if (u.pathname === '/health') return res.end('{"ok":true}');
  if (u.pathname === '/log') return res.end(JSON.stringify({ now: Date.now() - t0, log }));
  if (u.pathname === '/reset') {
    log = [];
    return res.end('{"ok":true}');
  }
  res.statusCode = 404;
  res.end('{}');
}

http.createServer(tool).listen(PORTS.tool, 'localhost');
http.createServer(host).listen(PORTS.host, 'localhost');
http.createServer(host).listen(PORTS.unlisted, 'localhost');
http.createServer(admin).listen(PORTS.admin, 'localhost');
console.log(`e2e: tool :${PORTS.tool}  host :${PORTS.host}  unlisted :${PORTS.unlisted}  admin :${PORTS.admin}`);
