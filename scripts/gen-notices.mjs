// Dependency registry → acknowledgements (`/third-party-notices.txt`, ADR-0001, MOD-Build).
// Lists every shipped (runtime/asset) registry entry that is installed, with its license text,
// plus the attribution required for CC-BY data used at build time.
import fs from 'node:fs';
import path from 'node:path';
import { abs, emit, GENERATED_HEADER } from './lib/util.mjs';
import { findInstalled, isActive, isShipped, readRegistry, REGISTRY } from './lib/registry.mjs';

const OUT = abs('public/third-party-notices.txt');
const LICENSE_FILES = /^(licen[cs]e|copying|notice)(\.(md|txt))?$/i;

function licenseText(dir) {
  const f = fs.readdirSync(dir).find((n) => LICENSE_FILES.test(n));
  return f ? fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n').trim() : null;
}

export function genNotices({ check }) {
  const rows = readRegistry().filter(isActive);
  const sections = [];
  const pending = [];
  for (const r of rows.filter(isShipped)) {
    for (const name of r.names) {
      const dir = findInstalled(name);
      if (!dir) {
        pending.push(`${name} (${r.id})`);
        continue;
      }
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      const text = licenseText(dir);
      sections.push(
        [
          `${pkg.name} ${pkg.version} — ${pkg.license ?? r.license} (${r.id}, ${r.kind})`,
          pkg.homepage ? `Homepage: ${pkg.homepage}` : null,
          '',
          text ?? `License: ${r.license} (no license file in the package)`,
        ]
          .filter((l) => l !== null)
          .join('\n'),
      );
    }
  }
  const attributions = rows
    .filter((r) => /CC-BY/i.test(r.license))
    .map((r) => {
      const name = r.names[0];
      const dir = name && findInstalled(name);
      const version = dir ? JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version : r.range;
      return `${name ?? r.label} ${version} (${r.id}) — ${r.license}. Used at build time only; not shipped.`;
    });
  const rule = '='.repeat(72);
  const out = [
    'JSON Formatter — third-party notices',
    GENERATED_HEADER(REGISTRY, 'scripts/gen-notices.mjs'),
    '',
    'This tool ships the following third-party code and assets.',
    ...sections.flatMap((s) => [rule, s]),
    rule,
    'Attributions (build-time data):',
    ...(attributions.length ? attributions.map((a) => `- ${a}`) : ['- none']),
    '',
  ].join('\n');
  if (pending.length) console.log(`notices: registered but not installed yet: ${pending.join(', ')}`);
  return emit(OUT, out, { check });
}
