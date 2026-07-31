import { afterEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

import {
  SftpCommand,
  SftpControlData,
  SftpDataStatus,
  SftpMessageType,
  SftpSocketFailureCode,
  SftpWebSocketProtocol
} from "./protocol";
import { useSftpOperations } from "./useSftpOperations";
import { useSftpRetry } from "./useSftpRetry";
import { useSftpSocket } from "./useSftpSocket";

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
        isTauriRuntime: vi.fn().mockReturnValue(false)
      } as never
    });

    await retry.reconnect();

    expect(activeContext.value).toMatchObject({ tokenId: "fresh-token", ticket: "fresh-ticket" });
    expect(beforeReconnect).toHaveBeenCalledOnce();
    expect(connect).toHaveBeenCalledWith(activeContext.value);
  });
});
