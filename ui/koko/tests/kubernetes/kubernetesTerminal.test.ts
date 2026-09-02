import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
  KubernetesTerminalControlData,
  KubernetesTerminalMessageType,
  KubernetesTerminalSocketFailureCode,
  KubernetesTerminalWebSocketProtocol,
  parseKubernetesTerminalMessage
} from "#koko/composables/kubernetes/protocol";
import { useKubernetesTerminalSocket } from "#koko/composables/kubernetes/useKubernetesTerminalSocket";
import {
  buildJSONEnvelope,
  ENVELOPE_TERMINAL_CLOSE,
  ENVELOPE_TERMINAL_COMMAND,
  ENVELOPE_TERMINAL_CREATE,
  ENVELOPE_TERMINAL_INPUT,
  parseEnvelope,
  parseJSONPayload,
  parseTerminalPayload
} from "#koko/composables/terminal/envelope";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  readonly sent: string[] = [];
  binaryType = "blob";
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
    this.onclose?.(new Event("close") as CloseEvent);
  }

  open() {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }

  receive(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent);
  }

  receiveEnvelope(type: number, payload: unknown) {
    const data = buildJSONEnvelope(type, payload);
    this.onmessage?.({ data: data.buffer } as MessageEvent);
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
      terminalId: 7,
      data: sessionData
    })
  ).toEqual({
    type: KubernetesTerminalMessageType.TerminalSession,
    k8s_id: "tab-1",
    terminalId: 7,
    data: sessionData
  });
  expect(
    parseKubernetesTerminalMessage({
      type: KubernetesTerminalMessageType.Ready,
      k8s_id: "tab-1",
      terminalId: 7
    })
  ).toEqual({ type: KubernetesTerminalMessageType.Ready, k8s_id: "tab-1", terminalId: 7 });
});

it("uses terminal envelopes for Kubernetes tree and terminal traffic", () => {
  const client = useKubernetesTerminalSocket();
  const received: KubernetesTerminalMessageType[] = [];
  const mcpMessages: Array<{ k8sId: string; terminalId: number; type: string }> = [];
  client.onMessage((message) => received.push(message.type));
  client.onMcpMessage(({ frame, k8sId, terminalId }) => {
    mcpMessages.push({ k8sId, terminalId, type: frame.type });
  });

  client.connect(context as never);
  const socket = FakeWebSocket.instances[0]!;
  socket.open();
  socket.receiveEnvelope(ENVELOPE_TERMINAL_COMMAND, {
    command: KubernetesTerminalMessageType.Connect,
    params: { id: "control-1", data: "{}" }
  });
  socket.receiveEnvelope(ENVELOPE_TERMINAL_COMMAND, {
    command: KubernetesTerminalMessageType.Ping,
    params: { id: "control-1" }
  });
  client.requestTree();
  client.initializeTerminal(
    "control-1",
    "tab-1",
    { namespace: "default", pod: "pod-1", container: "main" },
    JSON.stringify({ cols: 80, rows: 24, code: "" })
  );

  const createFrame = parseEnvelope(socket.sent[2] as unknown as Uint8Array);
  const create = parseJSONPayload<{ requestId: string }>(createFrame.payload);
  socket.receiveEnvelope(ENVELOPE_TERMINAL_COMMAND, {
    terminalId: 7,
    command: KubernetesTerminalMessageType.Created,
    requestId: create.requestId,
    params: { type: KubernetesTerminalMessageType.Created }
  });
  socket.receiveEnvelope(ENVELOPE_TERMINAL_COMMAND, {
    terminalId: 7,
    command: "mcp.manifest",
    params: {
      type: "mcp.manifest",
      version: 1,
      resource_session_id: "resource-1",
      data: JSON.stringify({ profile: "terminal", revision: 1, tools: [] })
    }
  });
  client.sendTerminalData("control-1", "tab-1", { namespace: "default", pod: "pod-1", container: "main" }, "whoami");
  client.resizeTerminal("control-1", "tab-1", 100, 30);
  client.sendMcpFrame("tab-1", {
    type: "mcp.request",
    version: 1,
    resource_session_id: "resource-1",
    data: { jsonrpc: "2.0", id: "call-1", method: "tools/call", params: { name: "terminal_snapshot" } }
  });
  client.closeTerminal("control-1", "tab-1");

  expect(socket.protocols).toEqual([KubernetesTerminalWebSocketProtocol.Koko]);
  expect(socket.binaryType).toBe("arraybuffer");
  expect(socket.url).toContain("token=token-1");
  expect(socket.url).toContain("ticket=ticket-1");
  expect(client.connected.value).toBe(true);
  expect(received).toEqual([KubernetesTerminalMessageType.Connect, KubernetesTerminalMessageType.Created]);
  expect(mcpMessages).toEqual([{ type: "mcp.manifest", k8sId: "tab-1", terminalId: 7 }]);

  const frames = socket.sent.map((message) => parseEnvelope(message as unknown as Uint8Array));
  expect(frames.map((frame) => frame.type)).toEqual([
    ENVELOPE_TERMINAL_COMMAND,
    ENVELOPE_TERMINAL_COMMAND,
    ENVELOPE_TERMINAL_CREATE,
    ENVELOPE_TERMINAL_INPUT,
    ENVELOPE_TERMINAL_COMMAND,
    ENVELOPE_TERMINAL_COMMAND,
    ENVELOPE_TERMINAL_CLOSE
  ]);
  expect(parseJSONPayload(frames[0]!.payload)).toMatchObject({
    command: KubernetesTerminalMessageType.Pong,
    params: { data: KubernetesTerminalControlData.Pong }
  });
  expect(parseJSONPayload(frames[1]!.payload)).toMatchObject({ command: KubernetesTerminalMessageType.Tree });
  expect(parseJSONPayload(frames[2]!.payload)).toMatchObject({
    params: { type: "kubernetes", kubernetes: { id: "tab-1", pod: "pod-1" } }
  });
  expect(new TextDecoder().decode(parseTerminalPayload(frames[3]!.payload).data)).toBe("whoami");
  expect(parseJSONPayload(frames[4]!.payload)).toMatchObject({
    terminalId: 7,
    command: "TERMINAL_RESIZE",
    params: { data: JSON.stringify({ cols: 100, rows: 30 }) }
  });
  expect(parseJSONPayload(frames[5]!.payload)).toMatchObject({
    terminalId: 7,
    command: "mcp.request",
    params: { type: "mcp.request", resource_session_id: "resource-1" }
  });
  expect(parseJSONPayload(frames[6]!.payload)).toEqual({ terminalId: 7 });
});

it("keeps legacy JSON transport compatible and reports unexpected socket closures", () => {
  const client = useKubernetesTerminalSocket();
  const failures: KubernetesTerminalSocketFailureCode[] = [];
  const mcpMessages: string[] = [];
  client.onFailure((failure) => failures.push(failure.code));
  client.onMcpMessage(({ k8sId }) => mcpMessages.push(k8sId));

  client.connect(context as never);
  const socket = FakeWebSocket.instances[0]!;
  socket.open();
  socket.receive({ id: "control-1", type: KubernetesTerminalMessageType.Connect });
  client.requestTree();
  socket.receive({
    type: KubernetesTerminalMessageType.TerminalSession,
    k8s_id: "tab-1",
    terminalId: 8,
    data: "{}"
  });
  socket.receive({
    type: "mcp.manifest",
    terminalId: 8,
    version: 1,
    resource_session_id: "resource-1",
    data: JSON.stringify({ profile: "terminal", revision: 1, tools: [] })
  });
  client.sendMcpFrame("tab-1", {
    type: "mcp.cancel",
    version: 1,
    resource_session_id: "resource-1",
    data: {
      jsonrpc: "2.0",
      method: "notifications/cancelled",
      params: { requestId: "call-1", _meta: {} }
    }
  });
  socket.receive({ type: "UNSUPPORTED" });
  socket.close();

  expect(JSON.parse(socket.sent[0]!)).toEqual({ type: KubernetesTerminalMessageType.Tree });
  expect(JSON.parse(socket.sent[1]!)).toMatchObject({
    type: "mcp.cancel",
    terminalId: 8,
    resource_session_id: "resource-1"
  });
  expect(mcpMessages).toEqual(["tab-1"]);
  expect(failures).toEqual([
    KubernetesTerminalSocketFailureCode.MalformedMessage,
    KubernetesTerminalSocketFailureCode.ConnectionClosed
  ]);
});
