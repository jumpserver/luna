import type { FileTransferEndpoint, FileTransferTask } from "@jumpserver/connectors-core";
import { registerFileTransferEndpoint } from "@jumpserver/connectors-core";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFileTransferStore } from "#koko/stores/fileTransfer";
import { loadFileTransferState } from "#koko/utils/file-transfer/persistence";

vi.mock("#koko/utils/file-transfer/checksum", () => ({
  updateFileTransferChecksum: vi.fn(async () => ({ chunkChecksum: "chunk-checksum", state: "checksum-state" })),
  finalizeFileTransferChecksum: vi.fn(async () => "file-checksum")
}));

vi.mock("#koko/utils/file-transfer/persistence", () => ({
  loadFileTransferState: vi.fn(async () => null),
  saveFileTransferState: vi.fn(async () => undefined)
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
    vi.mocked(loadFileTransferState).mockReset();
    vi.mocked(loadFileTransferState).mockResolvedValue(null);
  });

  it("fails a retry without dropping progress when endpoints are unavailable", () => {
    const store = useFileTransferStore();
    store.tasks = [task("failed.txt", "failed")];

    store.retryTask("failed.txt");

    expect(store.tasks[0]).toMatchObject({
      status: "failed",
      confirmedBytes: 25,
      checksumState: "state",
      error: "endpoint_unavailable"
    });
  });

  it("does not retry a connection-lost failure", () => {
    const store = useFileTransferStore();
    store.tasks = [task("lost.txt", "failed")];
    store.tasks[0]!.error = "endpoint_unavailable";

    store.retryTask("lost.txt");

    expect(store.tasks[0]).toMatchObject({
      status: "failed",
      error: "endpoint_unavailable",
      confirmedBytes: 25
    });
  });

  it("fails only the unavailable destination in a one-to-many batch", () => {
    const store = useFileTransferStore();
    store.tasks = [task("alpha.txt", "queued", "sftp:alpha"), task("beta.txt", "transferring", "sftp:beta")];

    store.failUnavailableEndpoint({ id: "sftp:alpha", label: "Alpha" });

    expect(store.tasks[0]).toMatchObject({ status: "failed", error: "endpoint_unavailable" });
    expect(store.tasks[1]).toMatchObject({ status: "transferring", error: "network error" });
  });

  it("keeps a user pause as paused", () => {
    const store = useFileTransferStore();
    store.tasks = [task("paused.txt", "transferring")];
    store.tasks[0]!.error = undefined;

    store.pauseTask("paused.txt");

    expect(store.tasks[0]).toMatchObject({ status: "paused" });
    expect(store.tasks[0]?.error).toBeUndefined();
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

  it("fails resumable persisted tasks on restore and ignores a second restore", async () => {
    vi.mocked(loadFileTransferState).mockResolvedValue({
      batches: [{ id: "batch-1", taskIds: ["a.txt"], createdAt: 1 }],
      tasks: [task("a.txt", "transferring")]
    });

    const store = useFileTransferStore();
    await store.restore();

    expect(store.restored).toBe(true);
    expect(store.tasks).toHaveLength(1);
    expect(store.tasks[0]).toMatchObject({
      id: "a.txt",
      status: "failed",
      confirmedBytes: 25,
      checksumState: "state",
      error: "endpoint_unavailable"
    });
    expect(store.batches).toEqual([{ id: "batch-1", taskIds: ["a.txt"], createdAt: 1 }]);

    vi.mocked(loadFileTransferState).mockResolvedValue({
      batches: [],
      tasks: [task("other.txt", "queued")]
    });
    await store.restore();
    expect(store.tasks.map((item) => item.id)).toEqual(["a.txt"]);
  });

  it("keeps completed persisted tasks completed after restore", async () => {
    vi.mocked(loadFileTransferState).mockResolvedValue({
      batches: [{ id: "batch-1", taskIds: ["done.txt"], createdAt: 1 }],
      tasks: [task("done.txt", "completed")]
    });

    const store = useFileTransferStore();
    await store.restore();

    expect(store.tasks[0]?.status).toBe("completed");
  });

  it("migrates persisted unavailable pauses to failed on restore", async () => {
    vi.mocked(loadFileTransferState).mockResolvedValue({
      batches: [{ id: "batch-1", taskIds: ["lost.txt"], createdAt: 1 }],
      tasks: [{ ...task("lost.txt", "paused"), error: "File transfer endpoint is unavailable" }]
    });

    const store = useFileTransferStore();
    await store.restore();

    expect(store.tasks[0]).toMatchObject({
      status: "failed",
      error: "endpoint_unavailable",
      confirmedBytes: 25
    });
  });

  it("keeps a user-paused persisted task paused on restore", async () => {
    vi.mocked(loadFileTransferState).mockResolvedValue({
      batches: [{ id: "batch-1", taskIds: ["paused.txt"], createdAt: 1 }],
      tasks: [{ ...task("paused.txt", "paused"), error: undefined }]
    });

    const store = useFileTransferStore();
    await store.restore();

    expect(store.tasks[0]).toMatchObject({ status: "paused", confirmedBytes: 25 });
    expect(store.tasks[0]?.error).toBeUndefined();
  });
});
