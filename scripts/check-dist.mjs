// dist/ scan (ADR-0001 rule 6, MOD-Build): what the build actually ships, against the registry.
//  - every script must have a (hidden, not deployed) source map; third-party packages are read
//    from the maps' node_modules sources, plus `@license <name> v<version>` banners (inlined
//    raw SVG icons have no map entry);
//  - every font, image or other non-code file must trace through the Vite manifest to its
//    source; fonts must come from a registered asset package, files of unknown type fail;
//  - every shipped package must be registered as runtime/asset (an `unbundled` row is a
//    production transitive that tree-shaking removes, so it fails here if it ever ships);
//  - the shipped `third-party-notices.txt` must list exactly the shipped packages and versions.
// Run by `pnpm check:licenses` after `pnpm build`.
import fs from 'node:fs';
import path from 'node:path';
import { isShipped, REGISTRY } from './lib/registry.mjs';

const NOTICES = 'third-party-notices.txt';
/** Files the build itself writes (not third-party content). */
const OWN_FILES = new Set(['index.html', 'sw.js', '_headers', '.assetsignore', NOTICES, '.vite/manifest.json']);
const CODE = /\.(js|mjs|css)$/;
const MAP = /\.map$/;
const FONT = /\.(woff2?|ttf|otf|eot)$/;
const IMAGE = /\.(svg|png|jpe?g|gif|webp|avif|ico)$/;
const NM = 'node_modules/';

function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p, base) : [path.relative(base, p).split(path.sep).join('/')];
  });
}

/** Package name and version (when the pnpm store path carries it) of a node_modules path. */
export function packageOf(source) {
  const i = source.lastIndexOf(NM);
  if (i < 0) return null;
  const parts = source.slice(i + NM.length).split('/');
  const name = parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
  const store = /\.pnpm\/([^/]+)\/node_modules\/?$/.exec(source.slice(0, i + NM.length));
  const flat = name.replace('/', '+');
  const version = store?.[1].startsWith(`${flat}@`) ? store[1].slice(flat.length + 1).split('_')[0] : null;
  return { name, version };
}

/** Package name → version listed in a notices file (section headers `<name> <version> — `). */
export function noticesPackages(text) {
  const out = new Map();
  const lines = text.split('\n');
  for (let i = 1; i < lines.length; i++) {
    if (!/^={20,}$/.test(lines[i - 1])) continue;
    const m = /^(\S+) (\S+) — /.exec(lines[i]);
    if (m) out.set(m[1], m[2]);
  }
  return out;
}

/**
 * Scans a built dist/ folder against registry rows ({ id, names, kind }).
 * Returns { shipped: Map<name, Set<version>>, problems: string[] }.
 */
export function scanDist(dir, registry) {
  const problems = [];
  const shipped = new Map();
  const add = (name, version) => {
    if (!shipped.has(name)) shipped.set(name, new Set());
    if (version) shipped.get(name).add(version);
  };
  const files = walk(dir);
  const manifestPath = path.join(dir, '.vite/manifest.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null;
  if (!manifest) problems.push('dist/.vite/manifest.json missing (build.manifest must stay on)');
  const sourceOf = new Map(Object.entries(manifest ?? {}).map(([key, e]) => [e.file, e.src ?? key]));

  for (const f of files) {
    if (OWN_FILES.has(f) || MAP.test(f)) continue;
    if (CODE.test(f)) {
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      for (const m of text.matchAll(/@license\s+((?:@[\w.-]+\/)?[\w.-]+)\s+v(\d[\w.+-]*)/g)) add(m[1], m[2]);
      if (!f.endsWith('.css')) {
        const mapFile = path.join(dir, `${f}.map`);
        if (!fs.existsSync(mapFile)) {
          problems.push(`${f}: script has no source map, its packages cannot be verified (build.sourcemap 'hidden')`);
          continue;
        }
        for (const s of JSON.parse(fs.readFileSync(mapFile, 'utf8')).sources ?? []) {
          const p = packageOf(s);
          if (p) add(p.name, p.version);
        }
      }
      continue;
    }
    if (FONT.test(f) || IMAGE.test(f)) {
      const src = sourceOf.get(f);
      const p = src && packageOf(src);
      if (p) add(p.name, p.version);
      else if (!src || FONT.test(f))
        problems.push(`${f}: not traced to a registered asset package via the Vite manifest`);
      continue;
    }
    problems.push(`${f}: unexpected file type in dist/ (allowed: html, js, css, fonts, images, source maps)`);
  }

  const byName = new Map(registry.flatMap((r) => r.names.map((n) => [n, r])));
  for (const name of shipped.keys()) {
    const r = byName.get(name);
    if (!r) problems.push(`${name}: shipped in dist/ but not registered in ${REGISTRY}`);
    else if (!isShipped(r) || /removed|spike only/i.test(r.status))
      problems.push(
        `${name}: shipped in dist/ but not registered as runtime/asset (${r.id} is ${r.kind}, ${r.status})`,
      );
  }

  const noticesFile = path.join(dir, NOTICES);
  if (!fs.existsSync(noticesFile)) problems.push(`dist/${NOTICES} missing`);
  else {
    const listed = noticesPackages(fs.readFileSync(noticesFile, 'utf8'));
    for (const [name, versions] of shipped) {
      if (!listed.has(name)) problems.push(`${name}: shipped but missing from ${NOTICES}`);
      else
        for (const v of versions)
          if (v !== listed.get(name)) problems.push(`${name}@${v}: shipped, but the notices list ${listed.get(name)}`);
    }
    for (const name of listed.keys())
      if (!shipped.has(name))
        problems.push(`${name}: listed in ${NOTICES} but not shipped (register it as kind \`unbundled\`)`);
  }
  return { shipped, problems };
}
