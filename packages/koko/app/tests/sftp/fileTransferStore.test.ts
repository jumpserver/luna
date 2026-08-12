import type { FileTransferEndpoint, FileTransferTask } from "~/shared/file-transfer/types";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerFileTransferEndpoint } from "~/shared/file-transfer/registry";
import { useFileTransferStore } from "~/store/modules/fileTransfer";

vi.mock("~/shared/file-transfer/checksum", () => ({
  updateFileTransferChecksum: vi.fn(async () => ({ chunkChecksum: "chunk-checksum", state: "checksum-state" })),
  finalizeFileTransferChecksum: vi.fn(async () => "file-checksum")
}));

const endpoint = { id: "sftp:target", label: "Target" };

function task(id: string, status: FileTransferTask["status"], endpointId = endpoint.id): FileTransferTask {
  return {
    id,
    batchId: "batch-1",
    sourceEndpoint: { id: "sftp:source", label: "Source" },
    destinationEndpoint: { id: endpointId, label: "Target" },
    source: { path: `/source/${id}`, name: id, size: 100 },
    destinationPath: "/target",
    conflictPolicy: "ask",
    status,
    confirmedBytes: 25,
    checksumState: "state",
    error: "network error",
    createdAt: 1,
    updatedAt: 1
  };
}

describe("file transfer store recovery actions", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubGlobal("crypto", { randomUUID: () => "generated-id" });
  });

  it("preserves resumable progress when retry waits for endpoints to reconnect", () => {
    const store = useFileTransferStore();
    store.tasks = [task("failed.txt", "failed")];

    store.retryTask("failed.txt");

    expect(store.tasks[0]).toMatchObject({
      status: "paused",
      confirmedBytes: 25,
      checksumState: "state",
      error: "File transfer endpoint is unavailable"
    });
  });

  it("clears only the requested terminal tasks and preserves remaining batch membership", () => {
    const store = useFileTransferStore();
    store.tasks = [task("sftp-done", "completed"), task("other-done", "completed", "local:target")];
    store.batches = [{ id: "batch-1", taskIds: ["sftp-done", "other-done"], createdAt: 1 }];

    store.clearFinished(["sftp-done"]);

    expect(store.tasks.map((item) => item.id)).toEqual(["other-done"]);
    expect(store.batches[0]?.taskIds).toEqual(["other-done"]);
  });

  it("persists an acknowledged chunk before a requested pause takes effect", async () => {
    const sourceRef = { id: "sftp:source", label: "Source" };
    const destinationRef = { id: "sftp:target", label: "Target" };
    let releaseWrite: (() => void) | undefined;
    const writeStarted = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    let acknowledgeWrite: (() => void) | undefined;
    const writePending = new Promise<void>((resolve) => {
      acknowledgeWrite = resolve;
    });
    const source = {
      ref: sourceRef,
      isAvailable: () => true,
      readChunk: vi.fn(async () => ({
        offset: 0,
        data: new Uint8Array([1]),
        sha256: "chunk-checksum",
        eof: true
      }))
    } as unknown as FileTransferEndpoint;
    const destination = {
      ref: destinationRef,
      isAvailable: () => true,
      prepareTransfer: vi.fn(async () => ({
        transferId: "generated-id",
        committedBytes: 0,
        totalBytes: 1,
        state: "ready" as const
      })),
      writeChunk: vi.fn(async () => {
        releaseWrite?.();
        await writePending;
        return { committedBytes: 1, duplicate: false };
      })
    } as unknown as FileTransferEndpoint;
    const unregisterSource = registerFileTransferEndpoint(source);
    const unregisterDestination = registerFileTransferEndpoint(destination);

    try {
      const store = useFileTransferStore();
      const batchId = store.enqueueBatch([
        {
          batchId: "",
          sourceEndpoint: sourceRef,
          destinationEndpoint: destinationRef,
          source: { path: "/source/file.txt", name: "file.txt", size: 1 },
          destinationPath: "/target",
          conflictPolicy: "ask"
        }
      ]);
      await writeStarted;
      const queuedTask = store.tasks.find((item) => item.batchId === batchId);
      expect(queuedTask).toBeDefined();
      store.pauseTask(queuedTask!.id);
      acknowledgeWrite?.();
      await vi.waitFor(() => {
        expect(store.tasks.find((item) => item.id === queuedTask!.id)).toMatchObject({
          status: "paused",
          confirmedBytes: 1
        });
      });
    } finally {
      unregisterSource();
      unregisterDestination();
    }
  });
});
