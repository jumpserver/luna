import type { FileTransferEndpoint, FileTransferTask } from "@jumpserver/connectors-core";
import { FileTransferUnavailableError, registerFileTransferEndpoint } from "@jumpserver/connectors-core";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFileTransferStore } from "#koko/stores/fileTransfer";
import { loadFileTransferState } from "#koko/utils/file-transfer/persistence";

vi.mock("#koko/utils/file-transfer/checksum", () => ({
  isFileTransferChecksumState: vi.fn((state: string) => state === "checksum-state"),
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

  it("discards failed destination data when clearing the task", async () => {
    const cancelTransfer = vi.fn(async () => undefined);
    const destination = {
      ref: endpoint,
      isAvailable: () => true,
      cancelTransfer
    } as unknown as FileTransferEndpoint;
    const unregister = registerFileTransferEndpoint(destination);

    try {
      const store = useFileTransferStore();
      store.tasks = [task("failed.txt", "failed")];
      store.clearFinished(["failed.txt"]);

      await vi.waitFor(() =>
        expect(cancelTransfer).toHaveBeenCalledWith({
          transferId: "failed.txt",
          targetPath: "/target/failed.txt",
          discard: true
        })
      );
    } finally {
      unregister();
    }
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

  it("generates koko-safe transfer ids without randomUUID", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(0xab);
        return bytes;
      }
    });
    const store = useFileTransferStore();
    store.enqueueBatch([
      {
        batchId: "batch-safe",
        sourceEndpoint: { id: "sftp:source", label: "Source" },
        destinationEndpoint: endpoint,
        source: { path: "/source/file.txt", name: "file.txt", size: 1 },
        destinationPath: "/target",
        conflictPolicy: "ask"
      }
    ]);
    expect(store.tasks[0]?.id).toMatch(/^[\w-]+$/);
    expect(store.tasks[0]?.id).not.toContain(".");
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

  it("prefetches the next read while the current write is in flight", async () => {
    const sourceRef = { id: "sftp:source", label: "Source" };
    const destinationRef = { id: "sftp:target", label: "Target" };
    const chunkSize = 2 * 1024 * 1024;
    let releaseWrite: (() => void) | undefined;
    const writePending = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    const source = {
      ref: sourceRef,
      isAvailable: () => true,
      readChunk: vi.fn(async (input: { offset: number; length: number }) => ({
        offset: input.offset,
        data: new Uint8Array(input.length),
        sha256: "chunk-checksum",
        eof: input.offset + input.length >= chunkSize + 1
      }))
    } as unknown as FileTransferEndpoint;
    const destination = {
      ref: destinationRef,
      isAvailable: () => true,
      prepareTransfer: vi.fn(async () => ({
        transferId: "generated-id",
        committedBytes: 0,
        totalBytes: chunkSize + 1,
        state: "ready" as const
      })),
      writeChunk: vi.fn(async (input: { offset: number }) => {
        if (input.offset === 0) await writePending;
        return { committedBytes: input.offset === 0 ? chunkSize : chunkSize + 1, duplicate: false };
      }),
      commitTransfer: vi.fn(async () => undefined)
    } as unknown as FileTransferEndpoint;
    const unregisterSource = registerFileTransferEndpoint(source);
    const unregisterDestination = registerFileTransferEndpoint(destination);

    try {
      const store = useFileTransferStore();
      store.enqueueBatch([
        {
          batchId: "batch-pipe",
          sourceEndpoint: sourceRef,
          destinationEndpoint: destinationRef,
          source: { path: "/source/file.bin", name: "file.bin", size: chunkSize + 1 },
          destinationPath: "/target",
          conflictPolicy: "ask"
        }
      ]);
      await vi.waitFor(() => {
        expect(source.readChunk).toHaveBeenCalledTimes(2);
        expect(destination.writeChunk).toHaveBeenCalledTimes(2);
      });
      expect(vi.mocked(source.readChunk).mock.calls[1]?.[0]).toMatchObject({ offset: chunkSize, length: 1 });
      expect(vi.mocked(destination.writeChunk).mock.calls[1]?.[0]).toMatchObject({ offset: chunkSize });
      releaseWrite?.();
      await vi.waitFor(() => {
        expect(store.tasks[0]?.status).toBe("completed");
      });
    } finally {
      unregisterSource();
      unregisterDestination();
    }
  });

  it("does not write a prefetched chunk after pause", async () => {
    const sourceRef = { id: "sftp:source", label: "Source" };
    const destinationRef = { id: "sftp:target", label: "Target" };
    const chunkSize = 2 * 1024 * 1024;
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
      readChunk: vi.fn(async (input: { offset: number; length: number }) => ({
        offset: input.offset,
        data: new Uint8Array(input.length),
        sha256: "chunk-checksum",
        eof: input.offset + input.length >= chunkSize + 1
      }))
    } as unknown as FileTransferEndpoint;
    const destination = {
      ref: destinationRef,
      isAvailable: () => true,
      prepareTransfer: vi.fn(async () => ({
        transferId: "generated-id",
        committedBytes: 0,
        totalBytes: chunkSize + 1,
        state: "ready" as const
      })),
      writeChunk: vi.fn(async (input: { offset: number }) => {
        if (input.offset === 0) {
          releaseWrite?.();
          await writePending;
          return { committedBytes: chunkSize, duplicate: false };
        }
        return { committedBytes: chunkSize + 1, duplicate: false };
      })
    } as unknown as FileTransferEndpoint;
    const unregisterSource = registerFileTransferEndpoint(source);
    const unregisterDestination = registerFileTransferEndpoint(destination);

    try {
      const store = useFileTransferStore();
      const batchId = store.enqueueBatch([
        {
          batchId: "batch-pause-pipe",
          sourceEndpoint: sourceRef,
          destinationEndpoint: destinationRef,
          source: { path: "/source/file.bin", name: "file.bin", size: chunkSize + 1 },
          destinationPath: "/target",
          conflictPolicy: "ask"
        }
      ]);
      await writeStarted;
      await vi.waitFor(() => expect(destination.writeChunk).toHaveBeenCalledTimes(2));
      const queuedTask = store.tasks.find((item) => item.batchId === batchId);
      store.pauseTask(queuedTask!.id);
      acknowledgeWrite?.();
      await vi.waitFor(() => {
        expect(store.tasks.find((item) => item.id === queuedTask!.id)).toMatchObject({
          status: "paused"
        });
        expect(store.tasks.find((item) => item.id === queuedTask!.id)?.confirmedBytes).toBeGreaterThanOrEqual(
          chunkSize
        );
      });
      expect(destination.writeChunk).toHaveBeenCalledTimes(2);
    } finally {
      unregisterSource();
      unregisterDestination();
    }
  });

  it("does not complete a 0-byte download without reading the source", async () => {
    const sourceRef = { id: "sftp:source", label: "Source" };
    const destinationRef = { id: "web-download", label: "Download" };
    const source = {
      ref: sourceRef,
      isAvailable: () => true,
      readChunk: vi.fn(async () => {
        throw new FileTransferUnavailableError();
      })
    } as unknown as FileTransferEndpoint;
    const destination = {
      ref: destinationRef,
      isAvailable: () => true,
      prepareTransfer: vi.fn(async () => ({
        transferId: "generated-id",
        committedBytes: 0,
        totalBytes: 0,
        state: "ready" as const
      })),
      commitTransfer: vi.fn(async () => undefined)
    } as unknown as FileTransferEndpoint;
    const unregisterSource = registerFileTransferEndpoint(source);
    const unregisterDestination = registerFileTransferEndpoint(destination);

    try {
      const store = useFileTransferStore();
      store.enqueueBatch([
        {
          batchId: "batch-empty",
          sourceEndpoint: sourceRef,
          destinationEndpoint: destinationRef,
          source: { path: "/source/empty.txt", name: "empty.txt", size: 0 },
          destinationPath: "empty.txt",
          conflictPolicy: "ask"
        }
      ]);
      await vi.waitFor(() => {
        expect(store.tasks[0]).toMatchObject({ status: "failed", error: "endpoint_unavailable" });
      });
      expect(source.readChunk).toHaveBeenCalledOnce();
      expect(destination.commitTransfer).not.toHaveBeenCalled();
    } finally {
      unregisterSource();
      unregisterDestination();
    }
  });

  it("writes sequential chunks when the destination is not sftp", async () => {
    const sourceRef = { id: "sftp:source", label: "Source" };
    const destinationRef = { id: "web-download", label: "Download" };
    const chunkSize = 2 * 1024 * 1024;
    let committed = 0;
    let overlapping = false;
    let inFlight = 0;
    const source = {
      ref: sourceRef,
      isAvailable: () => true,
      readChunk: vi.fn(async (input: { offset: number; length: number }) => ({
        offset: input.offset,
        data: new Uint8Array(input.length),
        sha256: "chunk-checksum",
        eof: input.offset + input.length >= chunkSize + 1
      }))
    } as unknown as FileTransferEndpoint;
    const destination = {
      ref: destinationRef,
      isAvailable: () => true,
      prepareTransfer: vi.fn(async () => ({
        transferId: "generated-id",
        committedBytes: 0,
        totalBytes: chunkSize + 1,
        state: "ready" as const
      })),
      writeChunk: vi.fn(async (input: { offset: number; data: Uint8Array }) => {
        inFlight += 1;
        if (inFlight > 1) overlapping = true;
        if (input.offset !== committed) throw new Error("Invalid browser download chunk");
        committed += input.data.length;
        inFlight -= 1;
        return { committedBytes: committed, duplicate: false };
      }),
      commitTransfer: vi.fn(async () => undefined)
    } as unknown as FileTransferEndpoint;
    const unregisterSource = registerFileTransferEndpoint(source);
    const unregisterDestination = registerFileTransferEndpoint(destination);

    try {
      const store = useFileTransferStore();
      store.enqueueBatch([
        {
          batchId: "batch-download",
          sourceEndpoint: sourceRef,
          destinationEndpoint: destinationRef,
          source: { path: "/source/file.bin", name: "file.bin", size: chunkSize + 1 },
          destinationPath: "file.bin",
          conflictPolicy: "ask"
        }
      ]);
      await vi.waitFor(() => {
        expect(store.tasks[0]?.status).toBe("completed");
      });
      expect(overlapping).toBe(false);
      expect(destination.writeChunk).toHaveBeenCalledTimes(2);
    } finally {
      unregisterSource();
      unregisterDestination();
    }
  });

  it("keeps prefix progress when a later write acks first and the first write fails", async () => {
    const sourceRef = { id: "sftp:source", label: "Source" };
    const destinationRef = { id: "sftp:target", label: "Target" };
    const chunkSize = 2 * 1024 * 1024;
    let rejectFirst: ((error: Error) => void) | undefined;
    const firstWrite = new Promise<never>((_, reject) => {
      rejectFirst = reject;
    });
    const source = {
      ref: sourceRef,
      isAvailable: () => true,
      readChunk: vi.fn(async (input: { offset: number; length: number }) => ({
        offset: input.offset,
        data: new Uint8Array(input.length),
        sha256: "chunk-checksum",
        eof: input.offset + input.length >= chunkSize + 1
      }))
    } as unknown as FileTransferEndpoint;
    const destination = {
      ref: destinationRef,
      isAvailable: () => true,
      prepareTransfer: vi.fn(async () => ({
        transferId: "generated-id",
        committedBytes: 0,
        totalBytes: chunkSize + 1,
        state: "ready" as const
      })),
      writeChunk: vi.fn(async (input: { offset: number }) => {
        if (input.offset === 0) await firstWrite;
        return { committedBytes: chunkSize + 1, duplicate: false };
      }),
      commitTransfer: vi.fn(async () => undefined)
    } as unknown as FileTransferEndpoint;
    const unregisterSource = registerFileTransferEndpoint(source);
    const unregisterDestination = registerFileTransferEndpoint(destination);

    try {
      const store = useFileTransferStore();
      store.enqueueBatch([
        {
          batchId: "batch-prefix",
          sourceEndpoint: sourceRef,
          destinationEndpoint: destinationRef,
          source: { path: "/source/file.bin", name: "file.bin", size: chunkSize + 1 },
          destinationPath: "/target",
          conflictPolicy: "ask"
        }
      ]);
      await vi.waitFor(() => expect(destination.writeChunk).toHaveBeenCalledTimes(2));
      rejectFirst?.(new Error("first write failed"));
      await vi.waitFor(() => {
        expect(store.tasks[0]).toMatchObject({ status: "failed", confirmedBytes: 0 });
      });
      expect(destination.commitTransfer).not.toHaveBeenCalled();
    } finally {
      unregisterSource();
      unregisterDestination();
    }
  });
});
