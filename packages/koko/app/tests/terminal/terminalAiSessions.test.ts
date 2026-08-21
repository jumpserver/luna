import { afterEach, expect, it, vi } from "vitest";

import {
  getKokoTerminalAiSession,
  handleKokoTerminalAiMessage,
  registerKokoTerminalAiSession,
  sendKokoTerminalAiControl,
  unregisterKokoTerminalAiSession
} from "#koko/composables/terminal/useTerminalAiSessions";

const paneIds: string[] = [];

afterEach(() => {
  for (const paneId of paneIds.splice(0)) unregisterKokoTerminalAiSession(paneId);
});

function createSession(paneId: string, readyState: number = WebSocket.OPEN) {
  const socket = { readyState, send: vi.fn() } as unknown as WebSocket;
  paneIds.push(paneId);
  return registerKokoTerminalAiSession(paneId, socket, "9")!;
}

it("retains structured Terminal AI presentation metadata", () => {
  const session = createSession("presentation-metadata");

  handleKokoTerminalAiMessage(session.paneId, {
    id: "capability",
    role: "assistant",
    metadata: { terminalId: 9 },
    parts: [
      {
        type: "data-capability",
        data: {
          enabled: true,
          backgroundExec: false,
          backgroundReason: "legacy reason",
          backgroundReasonCode: "pty_only"
        }
      }
    ]
  });
  handleKokoTerminalAiMessage(session.paneId, {
    id: "progress",
    role: "assistant",
    metadata: { terminalId: 9 },
    parts: [
      {
        type: "data-progress",
        data: { code: "planning", execution: "background_exec", state: "planning", text: "legacy progress" }
      }
    ]
  });

  expect(getKokoTerminalAiSession(session.paneId)).toMatchObject({
    backgroundReason: "legacy reason",
    backgroundReasonCode: "pty_only",
    runtimeExecution: "background_exec",
    runtimeState: "planning",
    runtimeStatus: "legacy progress",
    runtimeStatusCode: "planning"
  });
});

it("keeps structured runtime error codes when the AI SDK reports the stream error", async () => {
  const session = createSession("runtime-error-code");
  handleKokoTerminalAiMessage(session.paneId, {
    id: "capability",
    role: "assistant",
    metadata: { terminalId: 9 },
    parts: [{ type: "data-capability", data: { enabled: true } }]
  });

  const response = session.chat.sendMessage({ text: "run", metadata: { terminalId: 9 } });
  await Promise.resolve();
  await Promise.resolve();
  handleKokoTerminalAiMessage(session.paneId, {
    id: "error",
    role: "assistant",
    metadata: { terminalId: 9 },
    parts: [{ type: "data-error", data: { code: "background_unavailable", message: "legacy detail" } }]
  });
  await response;

  expect(session.errorCode).toBe("background_unavailable");
  expect(session.errorText).toBe("legacy detail");
});

it("exposes local transport failures as translatable error codes", async () => {
  const session = createSession("local-error-code", WebSocket.CLOSED);
  handleKokoTerminalAiMessage(session.paneId, {
    id: "capability",
    role: "assistant",
    metadata: { terminalId: 9 },
    parts: [{ type: "data-capability", data: { enabled: true } }]
  });

  await session.chat.sendMessage({ text: "run", metadata: { terminalId: 9 } });

  expect(session.errorCode).toBe("unavailable");
  expect(session.errorText).toBe("");
});

it("stops the active response after sending an interrupt", async () => {
  const session = createSession("interrupt");
  handleKokoTerminalAiMessage(session.paneId, {
    id: "capability",
    role: "assistant",
    metadata: { terminalId: 9 },
    parts: [{ type: "data-capability", data: { enabled: true } }]
  });

  const response = session.chat.sendMessage({ text: "run", metadata: { terminalId: 9 } });
  await Promise.resolve();
  await Promise.resolve();
  sendKokoTerminalAiControl(session.paneId, {
    id: "interrupt",
    role: "user",
    metadata: { terminalId: 9 },
    parts: [{ type: "data-interrupt", data: { reason: "user" } }]
  });
  await response;

  expect(session.chat.status.value).toBe("ready");
  expect(session.socket?.send).toHaveBeenCalledTimes(2);
});
