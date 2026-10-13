// `pnpm bench`: the NFR-03 throughput benchmarks (slow; not part of `pnpm test` or CI by default).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: new URL('../..', import.meta.url).pathname,
    include: ['tests/bench/**/*.bench.test.ts'],
    environment: 'node',
    silent: false,
  },
});
