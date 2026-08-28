import type { FileTransferStatus, FileTransferTask } from "@jumpserver/connectors-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

import {
  SftpCommand,
  SftpControlData,
  SftpDataStatus,
  SftpMessageType,
  SftpSocketFailureCode,
  SftpWebSocketProtocol
} from "#koko/composables/sftp/protocol";
import { useSftpOperations } from "#koko/composables/sftp/useSftpOperations";
import { useSftpRetry } from "#koko/composables/sftp/useSftpRetry";
import { useSftpSocket } from "#koko/composables/sftp/useSftpSocket";
import { buildSftpDistributionGroups } from "#koko/utils/sftpDistribution";
import { buildSftpTourSteps, SFTP_TOUR_STORAGE_KEY } from "#koko/utils/sftpTour";
import { finishedTransferCount, sftpTransferGroupStatus, sftpTransferProgress } from "#koko/utils/sftpTransferSummary";
import enMessages from "../../../../../i18n/locales/en.json";
import zhMessages from "../../../../../i18n/locales/zh.json";

const context = {
  component: "koko" as const,
  tokenId: "initial-token",
  ticket: "initial-ticket",
  endpointUrl: "https://koko.example.test"
};

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  readyState = 0;
  readonly sent: string[] = [];
  onclose: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;

  constructor(
    readonly url: string,
    readonly protocols: string[]
  ) {
    FakeWebSocket.instances.push(this);
  }

  close() {
    this.readyState = 3;
    this.onclose?.(new Event("close"));
  }

  open() {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }

  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent<string>);
  }

  send(data: string) {
    this.sent.push(data);
  }
}

function lastSent(socket: FakeWebSocket) {
  return JSON.parse(socket.sent.at(-1) || "{}") as {
    id: string;
    type: SftpMessageType;
    cmd?: SftpCommand;
    data?: string;
  };
}

async function nextMessage() {
  await Promise.resolve();
  await Promise.resolve();
}

function openSocket() {
  vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);
  const socket = useSftpSocket();
  socket.connect(context);
  const fake = FakeWebSocket.instances.at(-1)!;
  fake.open();
  return { fake, socket };
}

afterEach(() => {
  FakeWebSocket.instances = [];
  vi.unstubAllGlobals();
});

describe("sFTP browser protocol", () => {
  it("uses enum wire values for CONNECT initialization and PING/PONG", () => {
    const { fake, socket } = openSocket();
    const messages: SftpMessageType[] = [];
    socket.onMessage((message) => messages.push(message.type));

    fake.receive({ id: "connect", type: SftpMessageType.Connect });
    fake.receive({ id: "ping", type: SftpMessageType.Ping });

    expect(fake.protocols).toEqual([SftpWebSocketProtocol.Koko]);
    expect(messages).toEqual([SftpMessageType.Connect]);
    expect(lastSent(fake)).toMatchObject({ type: SftpMessageType.Pong, data: SftpControlData.Pong });
  });

  it("routes CHAT_MESSAGE frames without treating them as malformed SFTP data", () => {
    const { fake, socket } = openSocket();
    const chats: unknown[] = [];
    const failures: SftpSocketFailureCode[] = [];
    socket.onChat((message) => chats.push(message));
    socket.onFailure((failure) => failures.push(failure.code));

    fake.receive({
      id: "chat-1",
      type: SftpMessageType.Chat,
      data: JSON.stringify({
        id: "assistant-1",
        role: "assistant",
        metadata: { domain: "file", targetId: "file-pane-1" },
        parts: [{ type: "data-capability", data: { enabled: true } }]
      })
    });

    expect(chats).toHaveLength(1);
    expect(failures).toEqual([]);
  });

  it("surfaces malformed messages and explicit close failures", () => {
    const { fake, socket } = openSocket();
    const failures: SftpSocketFailureCode[] = [];
    socket.onFailure((failure) => failures.push(failure.code));

    fake.receive({ id: "bad", type: "not-sftp" });
    fake.close();

    expect(failures).toEqual([SftpSocketFailureCode.MalformedMessage, SftpSocketFailureCode.ConnectionClosed]);
  });

  it("correlates concurrent background list requests", async () => {
    const { fake, socket } = openSocket();
    const operations = useSftpOperations(ref("/"), socket).operations;
    const first = operations.listDirectory("/first");
    const second = operations.listDirectory("/second", { background: true });
    await vi.waitFor(() => expect(fake.sent).toHaveLength(2));

    const requests = fake.sent.map(
      (message) =>
        JSON.parse(message) as {
          id: string;
          type: SftpMessageType;
          cmd?: SftpCommand;
          data?: string;
        }
    );
    const firstRequest = requests.find((request) => JSON.parse(request.data || "{}").path === "/first")!;
    const secondRequest = requests.find((request) => JSON.parse(request.data || "{}").path === "/second")!;
    expect(firstRequest).toMatchObject({ type: SftpMessageType.Data, cmd: SftpCommand.List });
    expect(secondRequest.id).not.toBe(firstRequest.id);
    fake.receive({
      id: secondRequest.id,
      type: SftpMessageType.Data,
      cmd: SftpCommand.List,
      data: JSON.stringify([]),
      current_path: "/second"
    });
    await expect(second).resolves.toEqual([]);
    fake.receive({
      id: firstRequest.id,
      type: SftpMessageType.Data,
      cmd: SftpCommand.List,
      data: JSON.stringify([]),
      current_path: "/first"
    });
    await expect(first).resolves.toEqual([]);
  });

  it("uses the server canonical path for file and AI context", async () => {
    const { fake, socket } = openSocket();
    const client = useSftpOperations(ref("/"), socket);
    const paths: Array<string | undefined> = [];
    client.onList(({ currentPath, background }) => {
      if (!background) paths.push(currentPath);
    });

    const listed = client.operations.listDirectory("/");
    await nextMessage();
    const request = lastSent(fake);
    fake.receive({
      id: request.id,
      type: SftpMessageType.Data,
      cmd: SftpCommand.List,
      data: JSON.stringify([]),
      current_path: "/tmp"
    });

    await expect(listed).resolves.toEqual([]);
    expect(paths).toEqual(["/tmp"]);
  });

  it("assembles binary download fragments", async () => {
    const { fake, socket } = openSocket();
    const operations = useSftpOperations(ref("/workspace"), socket).operations;

    const read = operations.readFile({ name: "readme.txt", size: "", perm: "", mod_time: "", type: "", is_dir: false });
    await nextMessage();
    const download = lastSent(fake);
    fake.receive({ id: download.id, type: SftpMessageType.Binary, raw: btoa("hello") });
    fake.receive({ id: download.id, type: SftpMessageType.Data, cmd: SftpCommand.Download, data: "readme.txt" });
    await expect(read.then((blob) => blob.text())).resolves.toBe("hello");
  });

  it("serializes uploads while awaiting their acknowledgements", async () => {
    const { fake, socket } = openSocket();
    const operations = useSftpOperations(ref("/workspace"), socket).operations;

    const firstUpload = operations.uploadFile(new File(["first"], "first.txt"));
    const secondUpload = operations.uploadFile(new File(["second"], "second.txt"));
    await vi.waitFor(() => expect(fake.sent).toHaveLength(1));
    const firstRequest = lastSent(fake);
    fake.receive({ id: firstRequest.id, type: SftpMessageType.Data, cmd: SftpCommand.Upload, data: SftpDataStatus.Ok });
    await expect(firstUpload).resolves.toBeUndefined();
    await vi.waitFor(() => expect(fake.sent).toHaveLength(2));

    const secondRequest = lastSent(fake);
    fake.receive({
      id: secondRequest.id,
      type: SftpMessageType.Data,
      cmd: SftpCommand.Upload,
      data: SftpDataStatus.Ok
    });
    await expect(secondUpload).resolves.toBeUndefined();
  });

  it("uses a numeric upload ID when creating an empty file", async () => {
    const { fake, socket } = openSocket();
    const operations = useSftpOperations(ref("/workspace"), socket).operations;

    const create = operations.createFileAt("/workspace/new.txt");
    await vi.waitFor(() => expect(fake.sent).toHaveLength(1));
    const request = lastSent(fake);

    expect(request).toMatchObject({ type: SftpMessageType.Data, cmd: SftpCommand.Upload });
    expect(request.id).toMatch(/^\d+$/);
    expect(JSON.parse(request.data || "{}")).toMatchObject({
      path: "/workspace/new.txt",
      size: 0,
      chunk: false
    });

    fake.receive({ id: request.id, type: SftpMessageType.Data, cmd: SftpCommand.Upload, data: SftpDataStatus.Ok });
    await expect(create).resolves.toBeUndefined();
  });

  it("rejects failed mutations", async () => {
    const { fake, socket } = openSocket();
    const operations = useSftpOperations(ref("/workspace"), socket).operations;

    const remove = operations.removePath("/workspace/readme.txt");
    await nextMessage();
    const removeRequest = lastSent(fake);
    fake.receive({
      id: removeRequest.id,
      type: SftpMessageType.Data,
      cmd: SftpCommand.Remove,
      err: "permission denied"
    });
    await expect(remove).rejects.toThrow("permission denied");
  });

  it("refreshes the token and ticket only when reconnect is explicitly invoked", async () => {
    const activeContext = ref({ ...context });
    const connect = vi.fn();
    const beforeReconnect = vi.fn();
    const retry = useSftpRetry(activeContext, { connect } as never, {
      beforeReconnect,
      hostAdapter: {
        sftp: { exchangeConnectToken: vi.fn().mockResolvedValue({ id: "fresh-token" }) },
        createTicket: vi.fn().mockResolvedValue({ ticket: "fresh-ticket" }),
        isDesktopRuntime: vi.fn().mockReturnValue(false)
      } as never
    });

    await retry.reconnect();

    expect(activeContext.value).toMatchObject({ tokenId: "fresh-token", ticket: "fresh-ticket" });
    expect(beforeReconnect).toHaveBeenCalledOnce();
    expect(connect).toHaveBeenCalledWith(activeContext.value);
  });
});

describe("sFTP multi-target distribution", () => {
  it("creates an isolated batch input group for every destination", () => {
    const sourceEndpoint = { id: "sftp:source", label: "Source" };
    const groups = buildSftpDistributionGroups({
      distributionId: "release-42",
      sourceEndpoint,
      sourcePath: "/tmp/release/",
      entries: [
        { name: "app.tar.gz", size: "1024" },
        { name: "config.env", size: "64" },
        { name: "invalid", size: "not-a-number" }
      ],
      targets: [
        { endpoint: { id: "sftp:target-a", label: "Target A" }, destinationPath: "/opt/app/" },
        { endpoint: { id: "sftp:target-b", label: "Target B" }, destinationPath: "/srv/releases" },
        { endpoint: sourceEndpoint, destinationPath: "/same-endpoint" }
      ],
      conflictPolicy: "overwrite"
    });

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.destination.id)).toEqual(["sftp:target-a", "sftp:target-b"]);
    expect(groups[0]?.inputs).toHaveLength(2);
    expect(groups[0]?.inputs[0]).toMatchObject({
      batchId: "sftp-dist:release-42::target::sftp%3Atarget-a",
      source: { name: "app.tar.gz", size: 1024, path: "/tmp/release/app.tar.gz" },
      destinationPath: "/opt/app",
      conflictPolicy: "overwrite"
    });
    expect(groups[1]?.inputs[1]).toMatchObject({
      source: { name: "config.env", size: 64, path: "/tmp/release/config.env" },
      destinationPath: "/srv/releases"
    });
  });

  it("preserves byte progress and partial status for mixed terminal outcomes", () => {
    const task = (status: FileTransferStatus, size: number, confirmedBytes: number) =>
      ({ status, source: { size }, confirmedBytes }) as FileTransferTask;
    const tasks = [task("completed", 100, 100), task("canceled", 150, 0)];

    expect(finishedTransferCount(tasks)).toBe(2);
    expect(sftpTransferProgress(tasks)).toBe(40);
    expect(sftpTransferGroupStatus(tasks)).toBe("partial");
  });

  it("keeps byte progress while a group still has active tasks", () => {
    const tasks = [
      { status: "completed", source: { size: 100 }, confirmedBytes: 100 },
      { status: "transferring", source: { size: 150 }, confirmedBytes: 0 }
    ] as FileTransferTask[];

    expect(finishedTransferCount(tasks)).toBe(1);
    expect(sftpTransferProgress(tasks)).toBe(40);
    expect(sftpTransferGroupStatus(tasks)).toBe("transferring");
  });
});

describe("sFTP feature tour", () => {
  it("covers the primary file-management workflow in both languages", () => {
    const translate = (messages: unknown) => (key: string) => {
      const value = key.split(".").reduce<unknown>((current, segment) => {
        if (!current || typeof current !== "object") return undefined;
        return (current as Record<string, unknown>)[segment];
      }, messages);
      if (typeof value !== "string") throw new TypeError(`Missing translation: ${key}`);
      return value;
    };
    const chineseSteps = buildSftpTourSteps(translate(zhMessages));
    const englishSteps = buildSftpTourSteps(translate(enMessages));

    expect(SFTP_TOUR_STORAGE_KEY).toBe("koko:sftp-tour:v2");
    expect(chineseSteps).toHaveLength(6);
    expect(englishSteps).toHaveLength(chineseSteps.length);
    expect(chineseSteps.map((step) => step.element)).toEqual([
      '[data-sftp-tour="workspace"]',
      '[data-sftp-tour="navigation"]',
      '[data-sftp-tour="file-actions"]',
      '[data-sftp-tour="file-table"]',
      '[data-sftp-tour="remote-connect"]',
      '[data-sftp-tour="transfer-center"]'
    ]);
    expect(chineseSteps[0]?.popover?.title).toBe("SFTP 文件工作区");
    expect(englishSteps[0]?.popover?.title).toBe("SFTP file workspace");
    expect(chineseSteps[4]?.popover?.title).toBe("添加远程 SFTP");
    expect(chineseSteps[5]?.popover?.side).toBe("top");
  });

  it("keeps the SFTP interaction translation trees aligned", () => {
    const leafKeys = (value: unknown, prefix = ""): string[] => {
      if (!value || typeof value !== "object") return [prefix];
      return Object.entries(value).flatMap(([key, child]) => leafKeys(child, prefix ? `${prefix}.${key}` : key));
    };
    const zhKoko = zhMessages.koko;
    const enKoko = enMessages.koko;

    for (const section of ["fileManagement", "sftpTransferCenter", "sftpTour"] as const) {
      expect(leafKeys(enKoko[section]).sort()).toEqual(leafKeys(zhKoko[section]).sort());
    }
  });
});
