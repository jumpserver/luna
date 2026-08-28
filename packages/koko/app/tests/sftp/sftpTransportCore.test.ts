import type { SftpIncomingMessage, SftpSocketFailure } from "#koko/composables/sftp/protocol";
import type { SftpSocketClient } from "#koko/composables/sftp/useSftpSocket";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import {
  createSftpMessageId,
  decodeSftpRawBytes,
  encodeSftpBytes,
  joinSftpPath
} from "#koko/composables/sftp/core/codec";
import { createSerialTaskQueue } from "#koko/composables/sftp/core/queues";
import { parseSftpTransferState, parseSftpTransferWriteAck } from "#koko/composables/sftp/core/transfer";
import { SftpCommand, SftpMessageType, SftpSocketFailureCode } from "#koko/composables/sftp/protocol";
import { useSftpTransferEndpoint } from "#koko/composables/sftp/useSftpTransferEndpoint";
import { FileTransferUnavailableError } from "@jumpserver/connectors-core";

function createSocket(connected = true) {
  const messageListeners = new Set<(message: SftpIncomingMessage) => void>();
  const chatListeners = new Set<(message: unknown) => void>();
  const failureListeners = new Set<(failure: SftpSocketFailure) => void>();

  const socket: SftpSocketClient & {
    emitFailure: (failure: SftpSocketFailure) => void;
    emitMessage: (message: SftpIncomingMessage) => void;
  } = {
    socket: ref(null),
    connected: ref(connected),
    failure: ref(null),
    close: vi.fn(),
    connect: vi.fn(),
    onFailure: (listener) => {
      failureListeners.add(listener);
      return () => failureListeners.delete(listener);
    },
    onChat: (listener) => {
      chatListeners.add(listener);
      return () => chatListeners.delete(listener);
    },
    onMessage: (listener) => {
      messageListeners.add(listener);
      return () => messageListeners.delete(listener);
    },
    send: vi.fn(),
    emitFailure: (failure) => {
      for (const listener of failureListeners) listener(failure);
    },
    emitMessage: (message) => {
      for (const listener of messageListeners) listener(message);
    }
  };

  return socket;
}

describe("sftp transport core helpers", () => {
  beforeEach(() => {
    let index = 0;
    vi.stubGlobal("crypto", { randomUUID: () => `request-${++index}` });
  });

  it("shares message ids, path joins, and byte codecs", () => {
    const bytes = new Uint8Array([0, 1, 2, 255]);

    expect(createSftpMessageId()).toBe("request-1");
    expect(joinSftpPath("/", "file.txt")).toBe("/file.txt");
    expect(joinSftpPath("/tmp/", "file.txt")).toBe("/tmp/file.txt");
    expect(decodeSftpRawBytes(encodeSftpBytes(bytes))).toEqual(bytes);
    expect(decodeSftpRawBytes([4, 5, 6])).toEqual(new Uint8Array([4, 5, 6]));
  });

  it("keeps serial queues ordered even after a rejected task", async () => {
    const queue = createSerialTaskQueue();
    const order: string[] = [];

    const first = queue.enqueue(async () => {
      order.push("first");
      throw new Error("boom");
    });
    const second = queue.enqueue(async () => {
      order.push("second");
      return "ok";
    });

    await expect(first).rejects.toThrow("boom");
    await expect(second).resolves.toBe("ok");
    expect(order).toEqual(["first", "second"]);
  });

  it("validates transfer state and write acknowledgements", () => {
    expect(
      parseSftpTransferState({
        id: "state-1",
        type: SftpMessageType.Data,
        cmd: SftpCommand.TransferStatus,
        data: JSON.stringify({
          transfer_id: "transfer-1",
          committed_bytes: 4,
          total_bytes: 8,
          state: "ready"
        })
      })
    ).toEqual({
      transferId: "transfer-1",
      committedBytes: 4,
      totalBytes: 8,
      state: "ready"
    });

    expect(
      parseSftpTransferWriteAck({
        id: "ack-1",
        type: SftpMessageType.Data,
        cmd: SftpCommand.TransferWrite,
        data: JSON.stringify({ committed_bytes: 4, duplicate: true })
      })
    ).toEqual({ committedBytes: 4, duplicate: true });

    expect(() =>
      parseSftpTransferState({
        id: "state-2",
        type: SftpMessageType.Data,
        cmd: SftpCommand.TransferStatus,
        data: JSON.stringify({ transfer_id: "transfer-2", committed_bytes: "bad" })
      })
    ).toThrow("Invalid SFTP transfer response");

    expect(() =>
      parseSftpTransferWriteAck({
        id: "ack-2",
        type: SftpMessageType.Data,
        cmd: SftpCommand.TransferWrite,
        data: JSON.stringify({ committed_bytes: 1.2 })
      })
    ).toThrow("Invalid SFTP transfer write acknowledgement");
  });
});

describe("useSftpTransferEndpoint transport core wiring", () => {
  beforeEach(() => {
    let index = 0;
    vi.stubGlobal("crypto", { randomUUID: () => `request-${++index}` });
  });

  it("sends requests with shared ids/codecs and resolves validated responses", async () => {
    const socket = createSocket();
    const endpoint = useSftpTransferEndpoint(socket, { id: "target", label: "Target" });

    const preparePromise = endpoint.prepareTransfer({
      transferId: "transfer-a",
      targetPath: "/remote",
      fileName: "demo.txt",
      size: 3,
      conflictPolicy: "ask"
    });
    expect(socket.send).toHaveBeenNthCalledWith(1, {
      id: "request-1",
      type: SftpMessageType.Data,
      cmd: SftpCommand.TransferPrepare,
      data: JSON.stringify({
        transfer_id: "transfer-a",
        path: "/remote",
        file_name: "demo.txt",
        size: 3,
        conflict_policy: "ask"
      }),
      raw: ""
    });
    socket.emitMessage({
      id: "request-1",
      type: SftpMessageType.Data,
      cmd: SftpCommand.TransferPrepare,
      data: JSON.stringify({
        transfer_id: "transfer-a",
        committed_bytes: 0,
        total_bytes: 3,
        state: "ready"
      })
    });
    await expect(preparePromise).resolves.toEqual({
      transferId: "transfer-a",
      committedBytes: 0,
      totalBytes: 3,
      state: "ready"
    });

    const readPromise = endpoint.readChunk({
      transferId: "transfer-a",
      path: "/remote/demo.txt",
      offset: 0,
      length: 3
    });
    socket.emitMessage({
      id: "request-2",
      type: SftpMessageType.Binary,
      data: JSON.stringify({ offset: 0, sha256: "chunk-sha", eof: true }),
      raw: [1, 2, 3]
    });
    await expect(readPromise).resolves.toEqual({
      offset: 0,
      sha256: "chunk-sha",
      eof: true,
      data: new Uint8Array([1, 2, 3])
    });

    const writePromise = endpoint.writeChunk({
      transferId: "transfer-a",
      targetPath: "/remote/demo.txt",
      totalBytes: 3,
      offset: 0,
      data: new Uint8Array([1, 2, 3]),
      sha256: "chunk-sha"
    });
    expect(socket.send).toHaveBeenNthCalledWith(3, {
      id: "request-3",
      type: SftpMessageType.Data,
      cmd: SftpCommand.TransferWrite,
      data: JSON.stringify({
        transfer_id: "transfer-a",
        path: "/remote/demo.txt",
        size: 3,
        offset: 0,
        sha256: "chunk-sha"
      }),
      raw: "AQID"
    });
    socket.emitMessage({
      id: "request-3",
      type: SftpMessageType.Data,
      cmd: SftpCommand.TransferWrite,
      data: JSON.stringify({ committed_bytes: 3, duplicate: false })
    });
    await expect(writePromise).resolves.toEqual({ committedBytes: 3, duplicate: false });
  });

  it("rejects pending requests when the socket reports a failure", async () => {
    const socket = createSocket();
    const endpoint = useSftpTransferEndpoint(socket, { id: "target", label: "Target" });

    const statusPromise = endpoint.getTransferStatus({
      transferId: "transfer-b",
      targetPath: "/remote/demo.txt",
      totalBytes: 3
    });

    socket.emitFailure({
      code: SftpSocketFailureCode.ConnectionClosed,
      message: "socket closed"
    });

    await expect(statusPromise).rejects.toEqual(new FileTransferUnavailableError("socket closed"));
  });
});
