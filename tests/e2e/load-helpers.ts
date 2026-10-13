// Helpers for F-001 e2e tests: generated fixtures (tests/fixtures/generated/, gitignored),
// editor read-outs, synthetic paste and drop, and test-side worker seams.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';
import { MESSAGES } from '../../src/copy/messages.gen';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GEN = path.join(ROOT, 'tests/fixtures/generated');

export const COPY = MESSAGES;
/** A COPY text with its placeholders filled. */
export function copy(id: keyof typeof MESSAGES, params: Record<string, string | number> = {}): string {
  return (MESSAGES[id] as string).replace(/\{(\w+)\}/g, (w, k: string) => (k in params ? String(params[k]) : w));
}

/** Writes a small fixture file and returns its path. */
export function smallFixture(name: string, content: string | Buffer): string {
  fs.mkdirSync(GEN, { recursive: true });
  const p = path.join(GEN, name);
  fs.writeFileSync(p, content);
  return p;
}

/**
 * A valid JSON array of exactly `bytes` bytes (LF line endings), seeded by `label` so different
 * fixtures differ in their first line. Generated once and reused.
 */
export function largeFixture(label: string, bytes: number): string {
  fs.mkdirSync(GEN, { recursive: true });
  const p = path.join(GEN, `${label}-${bytes}.json`);
  if (fs.existsSync(p) && fs.statSync(p).size === bytes) return p;
  const fd = fs.openSync(p, 'w');
  const head = `[\n  {"fixture": "${label}"},\n`;
  const tail = '  {"end": true}\n]\n';
  let written = 0;
  const write = (s: string) => {
    fs.writeSync(fd, s);
    written += Buffer.byteLength(s);
  };
  write(head);
  const block: string[] = [];
  for (let i = 0; i < 2000; i++) block.push(`  {"id": ${100000 + i}, "name": "item-${label}", "ok": true},\n`);
  const blockText = block.join('');
  const blockBytes = Buffer.byteLength(blockText);
  while (written + blockBytes + 200 < bytes) write(blockText);
  // pad with one string member to reach the exact size
  const padPrefix = '  {"pad": "';
  const padSuffix = '"},\n';
  const pad = bytes - written - Buffer.byteLength(padPrefix + padSuffix + tail);
  write(padPrefix + 'x'.repeat(pad) + padSuffix + tail);
  fs.closeSync(fd);
  expect(fs.statSync(p).size).toBe(bytes);
  return p;
}

/** The editor content element (inside the editor's open shadow root). */
export const content = (page: Page) => page.locator('.cm-content');
/** The app root with the document facts as data attributes. */
export const app = (page: Page) => page.locator('[data-screen="SCR-Formatter"]');

/** Visible text of a small document (all lines rendered). */
export async function docText(page: Page): Promise<string> {
  const lines = await page.locator('.cm-line').allTextContents();
  return lines.join('\n');
}

export async function waitIdle(page: Page): Promise<void> {
  await expect(app(page)).toHaveAttribute('data-busy', 'false', { timeout: 60_000 });
}

/** Opens a file through COPY-action.open and the device file chooser (F-001.R3). */
export async function openFile(page: Page, file: string | { name: string; mimeType: string; buffer: Buffer }) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('toolbar').getByRole('button', { name: COPY['action.open'] }).click();
  await (await chooser).setFiles(file);
}

/** Dispatches a paste of `text` (or of a string built in the page) into the editor. */
export async function paste(page: Page, text: string | { repeat: string; times: number }) {
  await content(page).focus();
  await content(page).evaluate((el, t) => {
    const value = typeof t === 'string' ? t : t.repeat.repeat(t.times);
    const dt = new DataTransfer();
    dt.setData('text/plain', value);
    el.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true, composed: true }),
    );
  }, text);
}

export interface DropItem {
  name: string;
  text: string;
}

/** Drags files (or plain text when `files` is empty) over a target and drops them (F-001.R2). */
export async function drop(page: Page, target: string, files: DropItem[], text?: string) {
  const dt = await page.evaluateHandle(
    ({ files, text }) => {
      const dt = new DataTransfer();
      for (const f of files) dt.items.add(new File([f.text], f.name, { type: 'application/json' }));
      if (text !== undefined) dt.setData('text/plain', text);
      return dt;
    },
    { files, text },
  );
  const el = page.locator(target).first();
  await el.dispatchEvent('dragenter', { dataTransfer: dt });
  await el.dispatchEvent('dragover', { dataTransfer: dt });
  await el.dispatchEvent('drop', { dataTransfer: dt });
}

/** Records every notice bar shown (by COPY ID), in `window.__notices`. */
export async function recordNotices(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __notices: string[] };
    w.__notices = [];
    const seen = new WeakSet<Element>();
    new MutationObserver(() => {
      for (const el of document.querySelectorAll('[data-notice-id]')) {
        if (seen.has(el)) continue;
        seen.add(el);
        w.__notices.push(el.getAttribute('data-notice-id') ?? '');
      }
    }).observe(document, { childList: true, subtree: true });
  });
}

export const notices = (page: Page) => page.evaluate(() => (window as unknown as { __notices: string[] }).__notices);

/**
 * Test-side worker seam (no product hook): wraps `Worker` so that
 * - `slowMs`: every message from the worker is delivered `slowMs` later, in order (a slow read);
 * - `tooLarge`: a `loadFile` job for a file of that name fails as if the device ran out of memory.
 */
export async function seamWorker(page: Page, opts: { slowMs?: number; tooLarge?: string }) {
  await page.addInitScript((o) => {
    const Native = window.Worker;
    class Seamed extends Native {
      private queue: Promise<void> = Promise.resolve();
      override addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
      ) {
        if (type !== 'message' || !o.slowMs) return super.addEventListener(type, listener, options);
        const fn = typeof listener === 'function' ? listener : (e: Event) => listener.handleEvent(e);
        return super.addEventListener(
          'message',
          (e: Event) => {
            const data = (e as MessageEvent).data;
            this.queue = this.queue.then(
              () =>
                new Promise<void>((r) => setTimeout(() => (fn(new MessageEvent('message', { data })), r()), o.slowMs)),
            );
          },
          options,
        );
      }
      override postMessage(message: unknown, transfer?: Transferable[] | StructuredSerializeOptions) {
        const m = message as { type?: string; jobId?: number; job?: { kind?: string; file?: File } };
        if (o.tooLarge && m.type === 'job' && m.job?.kind === 'loadFile' && m.job.file?.name === o.tooLarge) {
          const jobId = m.jobId;
          setTimeout(() => {
            this.dispatchEvent(new MessageEvent('message', { data: { type: 'progress', jobId, fraction: 0.4 } }));
            this.dispatchEvent(new MessageEvent('message', { data: { type: 'failed', jobId, reason: 'too-large' } }));
          }, 50);
          return;
        }
        return super.postMessage(message, transfer as Transferable[]);
      }
    }
    window.Worker = Seamed;
  }, opts);
}
