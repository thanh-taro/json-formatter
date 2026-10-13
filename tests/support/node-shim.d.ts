// Minimal typings for the few Node APIs used by Node-side tests. @types/node is not a
// registered dependency (specs/40-technical/dependencies.md), so only these are declared.
declare module 'node:fs' {
  export function existsSync(path: string | URL): boolean;
  export function readdirSync(path: string | URL): string[];
  export function readFileSync(path: string | URL): Uint8Array;
  export function readFileSync(path: string | URL, encoding: 'utf8'): string;
}

declare const process: { env: Record<string, string | undefined> };
