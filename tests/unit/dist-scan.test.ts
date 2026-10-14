// MOD-Build: the dist/ scan of ADR-0001 rule 6 — third-party code, fonts and other files that
// ship must be registered as runtime/asset, and the shipped notices list exactly what ships.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error -- plain ESM build script without type declarations
import { noticesPackages, scanDist } from '../../scripts/check-dist.mjs';

type Row = { id: string; names: string[]; kind: string; status: string };
const REGISTRY: Row[] = [
  { id: 'DEP-01', names: ['preact'], kind: 'runtime', status: 'approved' },
  { id: 'DEP-11', names: ['lucide-static'], kind: 'asset', status: 'approved' },
  { id: 'DEP-12', names: ['@fontsource-variable/manrope'], kind: 'asset', status: 'approved' },
  { id: 'DEP-16', names: ['vite'], kind: 'build', status: 'approved' },
  { id: 'DEP-39', names: ['crelt'], kind: 'unbundled', status: 'approved' },
];
const RULE = '='.repeat(72);
const notice = (...pkgs: string[]) =>
  [
    'JSON Formatter — third-party notices',
    '',
    ...pkgs.flatMap((p) => [RULE, `${p} — MIT (DEP-x, runtime)`, '', 'text']),
    RULE,
    'Attributions (build-time data):',
    '- none',
    '',
  ].join('\n');

const PRE = '../node_modules/.pnpm';
const FONT_SRC =
  'node_modules/.pnpm/@fontsource-variable+manrope@5.3.0/node_modules/@fontsource-variable/manrope/files/m.woff2';
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

/** Writes a fake dist/ from a map of relative path → content (objects become JSON). */
function dist(files: Record<string, unknown>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'tk-dist-'));
  dirs.push(dir);
  for (const [f, c] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    writeFileSync(path.join(dir, f), typeof c === 'string' ? c : JSON.stringify(c));
  }
  return dir;
}

function good(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    'index.html': '<!doctype html>',
    _headers: '/*',
    '.assetsignore': '*.map',
    'sw.js': 'self',
    'sw.js.map': { sources: ['../src/host/sw.ts'] },
    'assets/index-a.js': 'x/*! @license lucide-static v1.55.0 - ISC */',
    'assets/index-a.js.map': {
      sources: ['../../src/main.tsx', `${PRE}/preact@10.29.8/node_modules/preact/dist/preact.module.js`],
    },
    'assets/index-a.css': 'body{}',
    'assets/manrope-x.woff2': 'font',
    '.vite/manifest.json': {
      [FONT_SRC]: { file: 'assets/manrope-x.woff2', src: FONT_SRC },
    },
    'third-party-notices.txt': notice('preact 10.29.8', 'lucide-static 1.55.0', '@fontsource-variable/manrope 5.3.0'),
    ...extra,
  };
}

describe('dist/ scan (ADR-0001 rule 6)', () => {
  it('ADR-0001 finds bundled packages from source maps, banners and the manifest; a clean build passes', () => {
    const r = scanDist(dist(good()), REGISTRY);
    expect([...r.shipped.keys()].sort()).toEqual(['@fontsource-variable/manrope', 'lucide-static', 'preact']);
    expect(r.shipped.get('preact')).toEqual(new Set(['10.29.8']));
    expect(r.problems).toEqual([]);
  });

  it('ADR-0001 fails on bundled third-party code that is not registered as runtime/asset', () => {
    const r = scanDist(
      dist(
        good({
          'assets/index-a.js.map': {
            sources: [
              `${PRE}/preact@10.29.8/node_modules/preact/x.js`,
              `${PRE}/left-pad@1.3.0/node_modules/left-pad/i.js`,
              `${PRE}/vite@8.3.1/node_modules/vite/dist/client/env.mjs`,
            ],
          },
        }),
      ),
      REGISTRY,
    );
    expect(r.problems.join('\n')).toMatch(/left-pad.*not registered/);
    expect(r.problems.join('\n')).toMatch(/vite.*not registered as runtime\/asset.*DEP-16/);
  });

  it('ADR-0001 fails on a font or other file that does not come from a registered asset package', () => {
    const r = scanDist(
      dist(
        good({
          'assets/other-y.woff2': 'font',
          'assets/logo.png': 'png',
          'assets/stray.wasm': 'wasm',
        }),
      ),
      REGISTRY,
    );
    const all = r.problems.join('\n');
    expect(all).toMatch(/other-y\.woff2.*not traced/);
    expect(all).toMatch(/logo\.png.*not traced/);
    expect(all).toMatch(/stray\.wasm.*file type/);
  });

  it('ADR-0001 fails on a script without a source map (its packages cannot be verified)', () => {
    const r = scanDist(dist(good({ 'assets/lazy-b.js': 'y' })), REGISTRY);
    expect(r.problems.join('\n')).toMatch(/lazy-b\.js.*no source map/);
  });

  it('ADR-0001 the notices must list exactly the shipped packages and versions', () => {
    const r = scanDist(
      dist(good({ 'third-party-notices.txt': notice('preact 10.29.7', 'lucide-static 1.55.0', 'crelt 1.0.7') })),
      REGISTRY,
    );
    const all = r.problems.join('\n');
    expect(all).toMatch(/preact@10\.29\.8.*notices list 10\.29\.7/);
    expect(all).toMatch(/@fontsource-variable\/manrope.*missing from .*notices/);
    expect(all).toMatch(/crelt.*listed in .*notices.* but not shipped/);
  });

  it('ADR-0001 reads package names and versions from the notices sections', () => {
    expect(noticesPackages(notice('preact 10.29.8', '@lezer/lr 1.4.11'))).toEqual(
      new Map([
        ['preact', '10.29.8'],
        ['@lezer/lr', '1.4.11'],
      ]),
    );
  });
});
