import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
  KubernetesTerminalControlData,
  KubernetesTerminalMessageType,
  KubernetesTerminalSocketFailureCode,
  KubernetesTerminalWebSocketProtocol,
  parseKubernetesTerminalMessage
} from "#koko/composables/kubernetes/protocol";
import { useKubernetesTerminalSocket } from "#koko/composables/kubernetes/useKubernetesTerminalSocket";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  readonly sent: string[] = [];
  readyState = 0;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;

  constructor(
    readonly url: string,
    readonly protocols: string[]
  ) {
    FakeWebSocket.instances.push(this);
  }

  close() {
    this.readyState = 3;
    this.onclose?.(new CloseEvent("close"));
  }

  open() {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }

  receive(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent);
  }

  send(payload: string) {
    this.sent.push(payload);
  }
}

const context = {
  endpointUrl: "https://koko.example.test",
  ticket: "ticket-1",
  tokenId: "token-1"
};

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeWebSocket);
});

afterEach(() => vi.unstubAllGlobals());

it("preserves clipboard policy payloads from connection and terminal session messages", () => {
  const connectData = JSON.stringify({ permission: { actions: ["copy"] } });
  const sessionData = JSON.stringify({ clipboard_policy: { paste: { enabled: false } } });

  expect(
    parseKubernetesTerminalMessage({
      type: KubernetesTerminalMessageType.Connect,
      id: "terminal-1",
      data: connectData
    })
  ).toEqual({ type: KubernetesTerminalMessageType.Connect, id: "terminal-1", data: connectData });
  expect(
    parseKubernetesTerminalMessage({
      type: KubernetesTerminalMessageType.TerminalSession,
      k8s_id: "tab-1",
      data: sessionData
    })
  ).toEqual({ type: KubernetesTerminalMessageType.TerminalSession, k8s_id: "tab-1", data: sessionData });
});

it("initializes the Kubernetes socket, replies to PING, and sends typed commands", () => {
  const client = useKubernetesTerminalSocket();
  const received: KubernetesTerminalMessageType[] = [];
  client.onMessage((message) => received.push(message.type));

  client.connect(context as never);
  const socket = FakeWebSocket.instances[0]!;
  socket.open();
  socket.receive({ id: "control-1", type: KubernetesTerminalMessageType.Ping });
  socket.receive({ data: "{}", type: KubernetesTerminalMessageType.Tree });
  client.requestTree();
  client.closeTerminal("terminal-1", "tab-1");

  expect(socket.protocols).toEqual([KubernetesTerminalWebSocketProtocol.Koko]);
  expect(socket.url).toContain("token=token-1");
  expect(socket.url).toContain("ticket=ticket-1");
  expect(client.connected.value).toBe(true);
  expect(received).toEqual([KubernetesTerminalMessageType.Tree]);
  expect(socket.sent.map((message) => JSON.parse(message))).toEqual([
    {
      id: "control-1",
      type: KubernetesTerminalMessageType.Pong,
      data: KubernetesTerminalControlData.Pong
    },
    { type: KubernetesTerminalMessageType.Tree },
    { id: "terminal-1", k8s_id: "tab-1", type: KubernetesTerminalMessageType.Close }
  ]);
});

it("reports malformed messages and unexpected socket closures", () => {
  const client = useKubernetesTerminalSocket();
  const failures: KubernetesTerminalSocketFailureCode[] = [];
  client.onFailure((failure) => failures.push(failure.code));

  client.connect(context as never);
  const socket = FakeWebSocket.instances[0]!;
  socket.open();
  socket.receive({ type: "UNSUPPORTED" });
  socket.close();

  expect(failures).toEqual([
    KubernetesTerminalSocketFailureCode.MalformedMessage,
    KubernetesTerminalSocketFailureCode.ConnectionClosed
  ]);
});
