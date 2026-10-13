// License audit (ADR-0001, MOD-Build): every installed package against the allow-lists, by kind.
//  - shipped (production dependencies): allowed licenses only, and registered as runtime/asset;
//  - direct dev dependencies: registered in the registry;
//  - everything else (build/dev/test transitives): allowed licenses, or a named build-only exception.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { abs } from './lib/util.mjs';
import { isActive, isShipped, readRegistry, REGISTRY } from './lib/registry.mjs';

const ALLOWED = new Set([
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'Apache-2.0',
  'Unlicense',
  'CC0-1.0',
  'BlueOak-1.0.0',
  'Python-2.0',
]);
const FONT_LICENSES = new Set(['OFL-1.1']);
/** Build/dev/test-only exceptions of ADR-0001 rule 2, by package name. */
const BUILD_ONLY_EXCEPTIONS = {
  'MPL-2.0': [/^lightningcss(-[\w-]+)?$/, /^axe-core$/, /^@axe-core\/playwright$/],
  'CC-BY-4.0': [/^caniuse-lite$/],
};
/** Packages whose metadata names no SPDX license; the license file was reviewed by hand. */
const REVIEWED = {
  'parse-cache-control@1.0.1': 'BSD-3-Clause', // "BSD" in package.json; LICENSE is BSD-3-Clause text (dev: @lhci/cli → lighthouse)
};

function licenses(prod) {
  const out = execFileSync('pnpm', ['licenses', 'list', '--json', ...(prod ? ['--prod'] : [])], { encoding: 'utf8' });
  const byLicense = JSON.parse(out || '{}');
  return Object.entries(byLicense).flatMap(([license, pkgs]) =>
    pkgs.flatMap((p) =>
      p.versions.map((v) => ({ name: p.name, version: v, license: REVIEWED[`${p.name}@${v}`] ?? license })),
    ),
  );
}

/** Evaluates a simple SPDX expression (OR / AND, parentheses ignored) against a predicate. */
function spdxOk(expr, ok) {
  const e = expr.replace(/[()]/g, ' ').trim();
  if (/\sOR\s/i.test(e)) return e.split(/\s+OR\s+/i).some((x) => spdxOk(x, ok));
  if (/\sAND\s/i.test(e)) return e.split(/\s+AND\s+/i).every((x) => spdxOk(x, ok));
  return ok(e.trim());
}

const registry = readRegistry().filter(isActive);
const registered = new Map(registry.flatMap((r) => r.names.map((n) => [n, r])));
const pkg = JSON.parse(fs.readFileSync(abs('package.json'), 'utf8'));
const problems = [];

const shipped = licenses(true);
const shippedNames = new Set(shipped.map((p) => p.name));
for (const p of shipped) {
  const r = registered.get(p.name);
  if (!r || !isShipped(r))
    problems.push(`${p.name}@${p.version}: shipped but not registered as runtime/asset in ${REGISTRY}`);
  const ok = spdxOk(p.license, (l) => ALLOWED.has(l) || (FONT_LICENSES.has(l) && r && /asset/i.test(r.kind)));
  if (!ok) problems.push(`${p.name}@${p.version}: license ${p.license} not allowed in shipped code`);
}

for (const name of Object.keys(pkg.devDependencies ?? {})) {
  if (!registered.has(name)) problems.push(`${name}: direct dev dependency not registered in ${REGISTRY}`);
}

const all = licenses(false);
for (const p of all) {
  if (shippedNames.has(p.name)) continue;
  const ok = spdxOk(p.license, (l) => ALLOWED.has(l) || (BUILD_ONLY_EXCEPTIONS[l] ?? []).some((re) => re.test(p.name)));
  if (!ok) problems.push(`${p.name}@${p.version}: license ${p.license} not allowed (ADR-0001)`);
}

const counts = all.reduce((m, p) => m.set(p.license, (m.get(p.license) ?? 0) + 1), new Map());
console.log(
  `licenses: ${all.length} packages (${shipped.length} shipped) — ${[...counts].map(([l, n]) => `${l} ${n}`).join(', ')}`,
);
if (problems.length) {
  console.error(problems.map((p) => `✗ ${p}`).join('\n'));
  process.exit(1);
}
console.log('licenses: all within the ADR-0001 allow-lists');
