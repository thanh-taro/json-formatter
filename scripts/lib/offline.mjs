// MOD-Build — the offline service worker in the build (ADR-0012):
// - emits src/host/sw.ts as the stable, unhashed /sw.js (its headers: scripts/gen-headers.mjs);
// - stamps it with a build id derived from the hashed output, so each build has its own cache
//   and a changed app is a changed /sw.js;
// - lists the build's JS/CSS chunks in a <meta> of index.html, so the page can name the worker
//   (and any lazy) chunk in its seed list (MOD-Host `startOffline`).
import crypto from 'node:crypto';
import { abs } from './util.mjs';

export const SW_SOURCE = 'src/host/sw.ts';
export const SW_FILE = 'sw.js';
export const BUILD_ID_PLACEHOLDER = '__TK_BUILD_ID__';
export const CHUNKS_META = 'tk-chunks';

/** Hashed JS/CSS chunks of a bundle (keys are output file names), as absolute paths. */
export function chunkList(fileNames) {
  return fileNames
    .filter((f) => /^assets\/[^/]+\.(js|css)$/.test(f))
    .sort()
    .map((f) => '/' + f);
}

/** A short id of a build: the hashed file names plus the bytes of the files without a hash. */
export function buildId(fileNames, unhashedSources = []) {
  const h = crypto.createHash('sha256');
  for (const f of [...fileNames].sort()) h.update(f + '\n');
  for (const s of unhashedSources) h.update(s);
  return h.digest('hex').slice(0, 12);
}

/** @returns {import('vite').Plugin} */
export function offline() {
  return {
    name: 'tk-offline',
    apply: 'build',
    enforce: 'post',
    buildStart() {
      this.emitFile({ type: 'chunk', id: abs(SW_SOURCE), fileName: SW_FILE });
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const chunks = chunkList(Object.keys(ctx.bundle ?? {}));
        return html.replace('</head>', `  <meta name="${CHUNKS_META}" content="${chunks.join(' ')}" />\n  </head>`);
      },
    },
    generateBundle(_options, bundle) {
      const sw = bundle[SW_FILE];
      if (!sw || sw.type !== 'chunk') throw new Error(`offline: ${SW_FILE} was not emitted`);
      if (/^\s*(import|export)\b/m.test(sw.code)) {
        throw new Error(`offline: ${SW_FILE} must be a classic script (it imports code shared with the page)`);
      }
      const names = Object.keys(bundle).filter((f) => f.startsWith('assets/') && !f.endsWith('.map'));
      const html = bundle['index.html'];
      const id = buildId(names, [sw.code, html && html.type === 'asset' ? String(html.source) : '']);
      if (!sw.code.includes(BUILD_ID_PLACEHOLDER)) throw new Error('offline: build id placeholder missing');
      sw.code = sw.code.replaceAll(BUILD_ID_PLACEHOLDER, id);
    },
  };
}
