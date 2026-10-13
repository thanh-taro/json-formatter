// Boot script + deploy setting → `public/_headers` (Cloudflare static assets syntax, ADR-0009).
// HOST_ORIGINS: space-separated origins allowed to frame the tool (default https://tarokit.app;
// empty → 'none'). The same list is compiled into MOD-Host by vite.config.ts.
import { abs, emit, GENERATED_HEADER } from './lib/util.mjs';
import { BOOT_SOURCE, bootScriptHash } from './lib/boot.mjs';

const OUT = abs('public/_headers');
export const DEFAULT_HOST_ORIGINS = 'https://tarokit.app';

export function hostOrigins() {
  const v = process.env.HOST_ORIGINS ?? DEFAULT_HOST_ORIGINS;
  return v.split(/[\s,]+/).filter(Boolean);
}

export function pageCsp(origins = hostOrigins()) {
  return [
    "default-src 'none'",
    `script-src 'self' '${bootScriptHash()}'`,
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "worker-src 'self'",
    "connect-src 'none'",
    "manifest-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    `frame-ancestors ${origins.length ? origins.join(' ') : "'none'"}`,
  ].join('; ');
}

export const SW_CSP = "default-src 'none'; connect-src 'self'";

export function genHeaders({ check }) {
  const out = `# ${GENERATED_HEADER(BOOT_SOURCE + ' and HOST_ORIGINS', 'scripts/gen-headers.mjs')}
# Every matching rule applies; "! Name" detaches a header set by an earlier rule.
/*
  Content-Security-Policy: ${pageCsp()}
  Permissions-Policy: clipboard-write=(self), camera=(), microphone=(), geolocation=(), clipboard-read=(), payment=(), usb=()
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
  Cross-Origin-Opener-Policy: same-origin
  Cache-Control: no-cache
/assets/*
  ! Cache-Control
  Cache-Control: public, max-age=31536000, immutable
/sw.js
  ! Content-Security-Policy
  ! Cache-Control
  Content-Security-Policy: ${SW_CSP}
  Cache-Control: public, max-age=86400
`;
  return emit(OUT, out, { check });
}
