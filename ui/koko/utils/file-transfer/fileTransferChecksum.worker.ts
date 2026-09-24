import { chainTransferChecksum, emptyTransferChecksumState, sha256Hex } from "./sha256";

interface ChecksumRequest {
  id: string;
  kind: "update" | "finalize";
  state: string;
  data?: ArrayBuffer;
}

interface ChecksumWorkerScope {
  onmessage: ((event: MessageEvent<ChecksumRequest>) => void) | null;
  postMessage: (message: unknown) => void;
}

// SAFETY: this file is only loaded as a dedicated checksum worker.
const workerScope = globalThis as unknown as ChecksumWorkerScope;

workerScope.onmessage = async (event) => {
  try {
    const request = event.data;
    const state = request.state || emptyTransferChecksumState();

    if (request.kind === "finalize") {
      workerScope.postMessage({ id: request.id, checksum: state, state });
      return;
    }

    const bytes = new Uint8Array(request.data || new ArrayBuffer(0));
    const chunkChecksum = await sha256Hex(bytes);

    workerScope.postMessage({
      id: request.id,
      chunkChecksum,
      state: await chainTransferChecksum(state, chunkChecksum)
    });
  } catch (error) {
    workerScope.postMessage({ id: event.data.id, error: error instanceof Error ? error.message : String(error) });
  }
};
