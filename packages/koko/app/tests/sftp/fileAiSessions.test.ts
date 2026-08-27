import { afterEach, expect, it, vi } from "vitest";
import { ref } from "vue";
import {
  connectKokoFileAiSession,
  getActiveKokoFileAiSession,
  handleKokoFileAiMessage,
  isKokoFileAiAvailable,
  isSuccessfulKokoFileAiMutationResult,
  registerKokoFileAiSession,
  resolveKokoFileAiApproval,
  setActiveKokoFileAiTarget,
  submitKokoFileAiPrompt,
  unregisterKokoFileAiSession
} from "#koko/composables/sftp/useFileAiSessions";
import { createSftpFileAiReadiness } from "#koko/composables/sftp/useSftpFileManager";
import { SftpMessageType } from "#koko/composables/sftp/protocol";

const targetIds: string[] = [];

afterEach(() => {
  for (const targetId of targetIds.splice(0)) unregisterKokoFileAiSession(targetId);
  setActiveKokoFileAiTarget(null);
});

function createSession(targetId: string, connected = true) {
  const socket = { readyState: WebSocket.OPEN, send: vi.fn() } as unknown as WebSocket;
  targetIds.push(targetId);
  return registerKokoFileAiSession(targetId, socket, {
    targetId,
    assetId: "asset-1",
    assetName: "web-01",
    account: "deploy",
    currentPath: "/srv/app",
    selectedEntries: [
      {
        name: "config.yaml",
        path: "/srv/app/config.yaml",
        size: "128",
        perm: "-rw-r--r--",
        modTime: "2026-08-27T00:00:00Z",
        type: "file",
        isDirectory: false,
        version: "version-1"
      }
    ],
    connected
  })!;
}

it("keeps File AI unavailable until the SFTP CONNECT message", () => {
  const readiness = createSftpFileAiReadiness(ref("/tmp"), ref(false));
  const session = createSession("remote-sftp:asset-1:initializing", false);

  expect(readiness.ready.value).toBe(false);
  expect(isKokoFileAiAvailable(session.targetId)).toBe(false);

  readiness.handleMessage({ id: "connect", type: SftpMessageType.Connect });
  connectKokoFileAiSession(session.targetId, session.socket!);

  expect(readiness.ready.value).toBe(true);
  expect(isKokoFileAiAvailable(session.targetId)).toBe(true);
});

it("keeps File AI unavailable until the canonical SFTP path is known", () => {
  const currentPath = ref("");
  const loading = ref(true);
  const readiness = createSftpFileAiReadiness(currentPath, loading);

  readiness.handleMessage({ id: "connect", type: SftpMessageType.Connect });
  expect(readiness.ready.value).toBe(false);

  currentPath.value = "/tmp";
  expect(readiness.ready.value).toBe(false);

  loading.value = false;
  expect(readiness.ready.value).toBe(true);
});

it("sends a target-scoped File AI prompt without SFTP credentials", async () => {
  const session = createSession("remote-sftp:asset-1:pane-1");
  setActiveKokoFileAiTarget(session.targetId);

  await submitKokoFileAiPrompt(session.targetId, "  explain the selected file  ");

  const wire = JSON.parse(vi.mocked(session.socket!.send).mock.calls[0]![0] as string) as {
    type: SftpMessageType;
    data: string;
  };
  const message = JSON.parse(wire.data) as Record<string, any>;
  expect(wire.type).toBe(SftpMessageType.Chat);
  expect(message).toMatchObject({
    role: "user",
    metadata: {
      domain: "file",
      targetId: session.targetId,
      context: {
        assetId: "asset-1",
        account: "deploy",
        currentPath: "/srv/app",
        selectedEntries: [{ name: "config.yaml", version: "version-1" }]
      }
    },
    parts: [{ type: "text", text: "explain the selected file" }]
  });
  expect(wire.data).not.toContain("tokenId");
  expect(wire.data).not.toContain("ticket");
  expect(wire.data).not.toContain("endpointUrl");
  expect(getActiveKokoFileAiSession()).toBe(session);
});

it("returns the server approval digest with a File AI decision", () => {
  const session = createSession("remote-sftp:asset-1:pane-2");
  handleKokoFileAiMessage(session.targetId, {
    id: "approval",
    role: "assistant",
    metadata: { domain: "file", targetId: session.targetId },
    parts: [{ type: "data-file-approval", data: { id: "approval-1", digest: "digest-1" } }]
  });

  resolveKokoFileAiApproval(session.targetId, "approval-1", "approve");

  const wire = JSON.parse(vi.mocked(session.socket!.send).mock.calls[0]![0] as string) as { data: string };
  expect(JSON.parse(wire.data)).toMatchObject({
    metadata: { domain: "file", targetId: session.targetId },
    parts: [
      {
        type: "data-file-approval",
        data: { id: "approval-1", digest: "digest-1", decision: "approve" }
      }
    ]
  });
  expect(session.resolvingApprovals.has("approval-1")).toBe(true);

  handleKokoFileAiMessage(session.targetId, {
    id: "approval-resolved",
    role: "assistant",
    metadata: { domain: "file", targetId: session.targetId },
    parts: [{ type: "data-file-approval", data: { id: "approval-1", digest: "digest-1", state: "cancelled" } }]
  });
  expect(session.pendingApprovals.has("approval-1")).toBe(false);
  expect(session.resolvingApprovals.has("approval-1")).toBe(false);
  expect(session.approvalDigests.has("approval-1")).toBe(false);
});

it("keeps capability and idle control messages out of the visible conversation", () => {
  const session = createSession("remote-sftp:asset-1:pane-3");
  handleKokoFileAiMessage(session.targetId, {
    id: "capability",
    role: "assistant",
    metadata: { domain: "file", targetId: session.targetId },
    parts: [{ type: "data-capability", data: { enabled: true } }]
  });
  handleKokoFileAiMessage(session.targetId, {
    id: "idle",
    role: "assistant",
    metadata: { domain: "file", targetId: session.targetId },
    parts: [{ type: "data-progress", data: { state: "idle", text: "" } }]
  });

  expect(session.chat.messages.value).toEqual([]);
});

it("rejects an event whose target does not match the socket-bound session", () => {
  const source = createSession("remote-sftp:asset-1:source");
  const other = createSession("remote-sftp:asset-2:other");

  handleKokoFileAiMessage(source.targetId, {
    id: "cross-pane-event",
    role: "assistant",
    metadata: { domain: "file", targetId: other.targetId },
    parts: [{ type: "data-error", data: { message: "wrong target" } }]
  });

  expect(source.errorText).toBe("");
  expect(other.errorText).toBe("");
  expect(source.chat.messages.value).toEqual([]);
  expect(other.chat.messages.value).toEqual([]);
});

it("keeps run-level errors out of the visible File AI timeline", () => {
  const session = createSession("remote-sftp:asset-1:error");
  handleKokoFileAiMessage(session.targetId, {
    id: "run-error",
    role: "assistant",
    metadata: { domain: "file", targetId: session.targetId },
    parts: [{ type: "data-error", data: { code: "failed", message: "save_text failed" } }]
  });

  expect(session.errorCode).toBe("failed");
  expect(session.errorText).toBe("save_text failed");
  expect(session.chat.messages.value).toEqual([]);
});

it("refreshes only for successful mutating results from the bound target", () => {
  const targetId = "remote-sftp:asset-1:refresh";
  const result = (tool: string, outcome: string, messageTargetId = targetId) => ({
    id: `${tool}-${outcome}`,
    role: "assistant",
    metadata: { domain: "file", targetId: messageTargetId },
    parts: [{ type: "data-file-result", data: { tool, outcome } }]
  });

  for (const tool of ["save_text", "mkdir", "rename", "delete"]) {
    expect(isSuccessfulKokoFileAiMutationResult(result(tool, "success"), targetId)).toBe(true);
  }
  expect(isSuccessfulKokoFileAiMutationResult(result("read_text", "success"), targetId)).toBe(false);
  expect(isSuccessfulKokoFileAiMutationResult(result("delete", "error"), targetId)).toBe(false);
  expect(isSuccessfulKokoFileAiMutationResult(result("delete", "success", "other-target"), targetId)).toBe(false);
});
