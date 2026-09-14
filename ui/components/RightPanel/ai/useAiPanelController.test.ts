import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { computed, effectScope, shallowRef } from "vue";
import {
  disconnectKokoFileAiSession,
  handleKokoFileAiWireMessage,
  registerKokoFileAiSession,
  unregisterKokoFileAiSession
} from "#koko/composables/sftp/useFileAiSessions";
import { installAgentSessionHarness } from "#koko/tests/agent/sessionHarness";
import {
  handleKokoTerminalAiWireMessage,
  registerKokoTerminalAiSession,
  unregisterKokoTerminalAiSession
} from "#koko/composables/terminal/useTerminalAiSessions";
import {
  handleChenSqlAiWireMessage,
  registerChenSqlAiSession,
  unregisterChenSqlAiSession
} from "~/chen/composables/useChenSqlAiSessions";
import { registerScriptAiSession, unregisterScriptAiSession } from "~/composables/useScriptAiSessions";
import { useAiPanelController } from "./useAiPanelController";

vi.mock("vue", async (original) => ({
  ...(await original<typeof import("vue")>()),
  onBeforeUnmount: vi.fn()
}));

const targetId = "file-panel-actions";
let scope: ReturnType<typeof effectScope>;
let agent: ReturnType<typeof installAgentSessionHarness>;

beforeEach(() => {
  scope = effectScope();
  agent = installAgentSessionHarness();
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
});

afterEach(() => {
  unregisterKokoFileAiSession(targetId);
  unregisterKokoTerminalAiSession(targetId);
  unregisterChenSqlAiSession(targetId);
  unregisterScriptAiSession(targetId);
  scope.stop();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function createPanel() {
  const socket = { readyState: WebSocket.OPEN, send: vi.fn() } as unknown as WebSocket;
  const session = registerKokoFileAiSession(targetId, socket, {
    targetId,
    assetId: "asset-1",
    assetName: "web-01",
    currentPath: "/",
    selectedEntries: [],
    connected: true
  })!;
  await agent.attach(handleKokoFileAiWireMessage, targetId, "file");
  session.chat.messages.value = [{ id: "history", role: "assistant", parts: [{ type: "text", text: "Prior reply" }] }];
  session.draft = "Continue";
  const panel = scope.run(() => useAiPanelController({ paneId: shallowRef(targetId), surface: computed(() => null) }))!;
  return { session, panel };
}

it("retains disconnected history, blocks new chats and allows clearing only local messages and draft", async () => {
  const { session, panel } = await createPanel();
  session.runtimeState = "executing";
  disconnectKokoFileAiSession(targetId);
  const start = vi.spyOn(session.agent.actions, "newSession");

  expect(panel.presentation.value?.headerDescription).toBe("RightPanel.FileAIReconnectDescription");
  expect(panel.unavailableState.value.description).toBe("RightPanel.FileAIReconnectDescription");
  expect(panel.presenceStatusLabel.value).toBe("RightPanel.FileAIUnavailableTitle");
  expect(panel.canNewSession.value).toBe(false);
  expect(panel.presentation.value?.runtimeStatusLabel).toBe("");
  await panel.newSession();
  expect(start).not.toHaveBeenCalled();
  expect(session.draft).toBe("Continue");
  expect(panel.messages.value).toHaveLength(1);

  expect(panel.canClearLocalHistory.value).toBe(true);
  panel.clearLocalHistory();
  expect(panel.messages.value).toHaveLength(0);
  expect(session.draft).toBe("");
  expect(panel.canClearLocalHistory.value).toBe(false);
  expect(agent.sendMessage).not.toHaveBeenCalled();
});

it("restores new chats after reconnect and does not allow local clearing of a connected conversation", async () => {
  const { session, panel } = await createPanel();
  disconnectKokoFileAiSession(targetId);
  const socket = { readyState: WebSocket.OPEN, send: vi.fn() } as unknown as WebSocket;
  registerKokoFileAiSession(targetId, socket, { ...session.context, connected: true });
  await agent.attach(handleKokoFileAiWireMessage, targetId, "file");
  session.chat.messages.value = [
    { id: "reconnected", role: "assistant", parts: [{ type: "text", text: "New reply" }] }
  ];

  expect(panel.canNewSession.value).toBe(true);
  panel.clearLocalHistory();
  expect(panel.messages.value).toHaveLength(1);
  await panel.newSession();
  expect(panel.messages.value).toHaveLength(0);
  expect(session.draft).toBe("");
  expect(panel.canNewSession.value).toBe(true);
});

it("prevents duplicate new-chat requests and preserves the draft when creation fails", async () => {
  const { session, panel } = await createPanel();
  let reject!: (error: Error) => void;
  const start = vi.spyOn(session.agent.actions, "newSession").mockImplementation(
    () =>
      new Promise<void>((_resolve, rejectPromise) => {
        reject = rejectPromise;
      })
  );
  const pending = panel.newSession();
  expect(panel.canNewSession.value).toBe(false);
  await panel.newSession();
  expect(start).toHaveBeenCalledOnce();
  reject(new Error("Session creation failed"));
  await pending;
  expect(session.draft).toBe("Continue");
  expect(session.errorText).toBe("Session creation failed");
  expect(panel.canNewSession.value).toBe(true);
});

it.each(["terminal", "sql", "script"] as const)(
  "respects %s availability for new chats without exposing local history clearing",
  async (domain) => {
    const socket = { readyState: WebSocket.OPEN, send: vi.fn() } as unknown as WebSocket;
    const session =
      domain === "terminal"
        ? registerKokoTerminalAiSession(targetId, socket, "9")!
        : domain === "sql"
          ? registerChenSqlAiSession(
              targetId,
              () => true,
              () => null,
              () => ({ applied: true })
            )!
          : registerScriptAiSession(
              targetId,
              () => ({
                paneId: targetId,
                scriptId: "script-1",
                name: "Script",
                content: "",
                module: "shell",
                comment: "",
                scope: "private",
                variables: [],
                revision: 1
              }),
              () => ({ applied: true })
            )!;
    if (domain === "terminal") await agent.attach(handleKokoTerminalAiWireMessage, targetId, domain);
    else if (domain === "sql") await agent.attach(handleChenSqlAiWireMessage, targetId, domain);
    else await vi.waitFor(() => expect(session.agent.state.available).toBe(true));

    const panel = scope.run(() =>
      useAiPanelController({ paneId: shallowRef(targetId), surface: computed(() => null) })
    )!;
    const start = vi.spyOn(session.agent.actions, "newSession");
    session.draft = "Continue";
    session.enabled = false;
    expect(panel.canNewSession.value).toBe(false);
    expect(panel.canClearLocalHistory.value).toBe(false);
    panel.clearLocalHistory();
    await panel.newSession();
    expect(start).not.toHaveBeenCalled();
    expect(session.draft).toBe("Continue");

    session.enabled = true;
    expect(panel.canNewSession.value).toBe(true);
    await panel.newSession();
    expect(start).toHaveBeenCalledOnce();
    expect(session.draft).toBe("");
  }
);
