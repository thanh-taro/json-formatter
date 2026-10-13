/// <reference types="vite/client" />

/** Compiled-in allow-list of host origins (vite.config.ts, from HOST_ORIGINS). */
declare const __HOST_ORIGINS__: readonly string[];

/** False in development and in a kill-switch build (`SW_KILL=1`): no offline worker (ADR-0012). */
declare const __TK_OFFLINE__: boolean;
