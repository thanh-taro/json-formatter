// Minimal typings for the few Node APIs used by Node-side tests. @types/node is not a
// registered dependency (specs/40-technical/dependencies.md), so only these are declared.
declare module 'node:fs' {
  export function existsSync(path: string | URL): boolean;
  export function readdirSync(path: string | URL): string[];
  export function readFileSync(path: string | URL): Uint8Array;
  export function readFileSync(path: string | URL, encoding: 'utf8'): string;
  export function writeFileSync(path: string, data: string | Uint8Array): void;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function statSync(path: string): { size: number };
  export function openSync(path: string, flags: string): number;
  export function writeSync(fd: number, data: string): number;
  export function closeSync(fd: number): void;
}
declare module 'node:path' {
  export function resolve(...parts: string[]): string;
  export function dirname(p: string): string;
  export function join(...parts: string[]): string;
}
declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}
declare class Buffer extends Uint8Array {
  static from(data: string | ArrayLike<number>, encoding?: 'utf8'): Buffer;
  static alloc(size: number): Buffer;
  static concat(list: readonly Uint8Array[]): Buffer;
  static byteLength(s: string): number;
}

declare const process: { env: Record<string, string | undefined> };
