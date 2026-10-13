// End-to-end tests (ADR-0010): production build + generated headers, three engines, stub host
// on a second origin. Run `pnpm build` first. Test titles start with the spec ID they verify
// (adapters/tests.md).
import { defineConfig, devices } from '@playwright/test';

const CI = !!process.env['CI'];

export default defineConfig({
  testDir: './tests/e2e',
  // The server-side request log is shared, so tests run one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  timeout: 30_000,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node tests/e2e/server.mjs',
    url: 'http://localhost:4179/health',
    reuseExistingServer: !CI,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
