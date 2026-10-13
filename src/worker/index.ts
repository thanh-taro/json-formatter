// MOD-Worker — mirror, job scheduling, cancellation, file decode, export Blobs (ADR-0005).
// Imports only MOD-Core and @codemirror/state; never DOM code. Entry is created with
// `new Worker(new URL('./worker/index.ts', import.meta.url), { type: 'module' })`.
export {};
