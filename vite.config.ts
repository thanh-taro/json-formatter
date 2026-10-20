// Build configuration (ADR-0003, MOD-Build).
import preact from '@preact/preset-vite';
import { defineConfig, type Plugin } from 'vite';
// @ts-expect-error -- plain ESM build script without type declarations
import { readBootScript } from './scripts/lib/boot.mjs';
// @ts-expect-error -- plain ESM build script without type declarations
import { hostOrigins } from './scripts/gen-headers.mjs';
// @ts-expect-error -- plain ESM build script without type declarations
import { offline } from './scripts/lib/offline.mjs';

/** Inlines the boot script (MOD-Host) at the top of <head>; its hash is in public/_headers. */
function bootScript(): Plugin {
  return {
    name: 'tk-boot-script',
    transformIndexHtml(html) {
      return html.replace('<!--boot-->', `<script>${readBootScript() as string}</script>`);
    },
  };
}

export default defineConfig({
  plugins: [preact(), bootScript(), offline() as Plugin],
  define: {
    __HOST_ORIGINS__: JSON.stringify(hostOrigins()),
  },
  build: {
    target: 'es2022',
    // The polyfill uses fetch, which `connect-src 'none'` blocks; all targets support modulepreload.
    modulePreload: { polyfill: false },
    manifest: true,
    sourcemap: 'hidden',
    assetsInlineLimit: 0,
  },
  worker: { format: 'es' },
  // Own ports, so this tool runs beside the other taro-kit tools (they use Vite's 5173/4173).
  preview: { port: 4180, strictPort: true },
  server: { port: 5180, strictPort: true },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/property/**/*.test.ts', 'tests/conformance/**/*.test.ts'],
    environment: 'node',
  },
});
