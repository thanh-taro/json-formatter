// NFR-01 measured with the e2e server's request log (D-021): after the page has loaded, the tool
// makes no requests of its own. The one exception is the browser's own fetching of the tool's
// files for the offline cache (ADR-0012): the worker's seeding fetch (destination "empty", which
// the page itself cannot make under `connect-src 'none'`) and the worker-script update check.
import { expect, test, type APIRequestContext } from '@playwright/test';
import { ADMIN } from './fixtures';

export interface LogEntry {
  t: number;
  method: string;
  path: string;
  dest: string | null;
  sw: string | null;
}

const serverLog = async (request: APIRequestContext) =>
  (await (await request.get(`${ADMIN}/log`)).json()) as { now: number; log: LogEntry[] };

/** The server clock now: requests logged later happened after this point. */
export const logNow = async (request: APIRequestContext) => (await serverLog(request)).now;

export const workerCacheFetch = (e: LogEntry) =>
  e.method === 'GET' &&
  ((e.path === '/sw.js' && e.sw === 'script') ||
    (e.dest === 'empty' && (/^\/(\?theme=(dark|light))?$/.test(e.path) || /^\/assets\/[\w.-]+$/.test(e.path))));

/** Asserts the tool made no request after `mark` other than the D-021 offline-cache exception. */
export async function expectNoRequestsAfter(request: APIRequestContext, mark: number): Promise<void> {
  await new Promise((r) => setTimeout(r, 1000));
  const after = (await serverLog(request)).log.filter((e) => e.t > mark);
  test.info().annotations.push({
    type: 'requests after load',
    description: JSON.stringify(after.map((e) => `${e.method} ${e.path} dest=${e.dest} sw=${e.sw}`)),
  });
  expect(after.filter((e) => !workerCacheFetch(e)).map((e) => `${e.method} ${e.path} dest=${e.dest}`)).toEqual([]);
}
