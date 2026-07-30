interface ChecksumWorkerResponse {
  id: string
  chunkChecksum?: string
  checksum?: string
  state?: string
  error?: string
}

let worker: Worker | null = null;
const pending = new Map<
  string,
  { resolve: (value: ChecksumWorkerResponse) => void, reject: (reason: Error) => void }
>();

function requestId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}

function checksumWorker() {
  if (!import.meta.client) throw new Error("File transfer checksum worker is only available in the browser");
  if (worker) return worker;
  worker = new Worker(new URL("../../workers/fileTransferChecksum.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<ChecksumWorkerResponse>) => {
    const response = event.data;
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    if (response.error) request.reject(new Error(response.error));
    else request.resolve(response);
  };
  worker.onerror = () => {
    for (const request of pending.values()) request.reject(new Error("File transfer checksum worker failed"));
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

function send(request: { kind: "update" | "finalize", state: string, data?: ArrayBuffer }, transfer?: Transferable[]) {
  const id = requestId();
  return new Promise<ChecksumWorkerResponse>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    checksumWorker().postMessage({ ...request, id }, transfer || []);
  });
}

export async function updateFileTransferChecksum(state: string, bytes: Uint8Array) {
  const copy = bytes.slice();
  const response = await send({ kind: "update", state, data: copy.buffer }, [copy.buffer]);
  if (!response.chunkChecksum || response.state === undefined)
    throw new Error("Invalid file transfer checksum response");
  return { chunkChecksum: response.chunkChecksum, state: response.state };
}

export async function finalizeFileTransferChecksum(state: string) {
  const response = await send({ kind: "finalize", state });
  if (!response.checksum) throw new Error("Invalid file transfer checksum response");
  return response.checksum;
}
