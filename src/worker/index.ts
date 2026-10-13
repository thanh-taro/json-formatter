// MOD-Worker — mirror, job scheduling, cancellation, file decode, export Blobs (ADR-0005).
// Imports only MOD-Core and @codemirror/state; never DOM code. Entry is created by the
// main-side WorkerClient (`./client.ts`) as a same-origin module worker (no `blob:` URL).
import { WorkerEngine } from './engine';
import type { FromWorker, ToWorker } from './protocol';

interface WorkerScope {
  postMessage(message: FromWorker, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<ToWorker>) => void): void;
}

const scope = self as unknown as WorkerScope;
const engine = new WorkerEngine((msg, transfer) => scope.postMessage(msg, transfer ?? []));
scope.addEventListener('message', (event) => engine.handle(event.data));
scope.postMessage({ type: 'ready' });
