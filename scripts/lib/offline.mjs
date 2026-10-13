// MOD-Build — the offline service worker in the build (ADR-0012):
// - emits src/host/sw.ts as the stable, unhashed /sw.js (its headers: scripts/gen-headers.mjs);
// - lists the build's JS/CSS chunks in a <meta> of index.html, so the page can name the worker
//   (and any lazy) chunk in its seed list (MOD-Host `startOffline`);
// - kill switch: `SW_KILL=1` emits src/host/sw-kill.ts as /sw.js instead (deletes the tool's
//   caches and unregisters itself) and compiles the page without registration (`__TK_OFFLINE__`).
import { abs } from './util.mjs';

export const SW_SOURCE = 'src/host/sw.ts';
export const SW_KILL_SOURCE = 'src/host/sw-kill.ts';
export const SW_FILE = 'sw.js';
export const CHUNKS_META = 'tk-chunks';

/** True when the deploy ships the kill switch. */
export const swKill = (env = process.env) => env.SW_KILL === '1';

/** Hashed JS/CSS chunks of a bundle (keys are output file names), as absolute paths. */
export function chunkList(fileNames) {
  return fileNames
    .filter((f) => /^assets\/[^/]+\.(js|css)$/.test(f))
    .sort()
    .map((f) => '/' + f);
}

/** @returns {import('vite').Plugin} */
export function offline() {
  const kill = swKill();
  let build = false;
  return {
    name: 'tk-offline',
    enforce: 'post',
    config: (_config, { command }) => {
      build = command === 'build';
      return { define: { __TK_OFFLINE__: JSON.stringify(build && !kill) } };
    },
    buildStart() {
      if (!build) return;
      this.emitFile({ type: 'chunk', id: abs(kill ? SW_KILL_SOURCE : SW_SOURCE), fileName: SW_FILE });
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!build || !ctx.bundle || kill) return html;
        const chunks = chunkList(Object.keys(ctx.bundle));
        return html.replace('</head>', `  <meta name="${CHUNKS_META}" content="${chunks.join(' ')}" />\n  </head>`);
      },
    },
    generateBundle(_options, bundle) {
      if (!build) return;
      const sw = bundle[SW_FILE];
      if (!sw || sw.type !== 'chunk') throw new Error(`offline: ${SW_FILE} was not emitted`);
      if (/^\s*(import|export)\b/m.test(sw.code)) {
        throw new Error(`offline: ${SW_FILE} must be a classic script (it imports code shared with the page)`);
      }
    },
  };
}
