import { computed, shallowRef, watch } from "vue";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { serverWorkspaceAiEnabled } from "~/shared/aiAvailability";
import { desktopInvoke, desktopListen } from "~/shared/desktop/bridge";
import { localCodexSettings, localCodexRevision } from "~/composables/useLocalCodex";
import { agentClient } from "./agentClient";
import type { AgentClient } from "./agentClient";
import type { AgentSseOptions } from "./agentSse";
import type { AgentSessionOptions, AgentSessionController, AgentConnection } from "./useAgentSession";
import type {
  AgentApprovalMode,
  AgentApprovalModeRequest,
  AgentApprovalRequest,
  AgentBootstrapResponse,
  AgentEvent,
  AgentHistoryResponse,
  AgentMcpManifest,
  AgentMessageRequest,
  AgentMessageResponse,
  AgentSessionCreateResponse,
  AgentToolResultRequest
} from "./types";

/** The existing session controller owns history presentation, approvals and the tool relay for both transports. */
function invoke<T>(command: string, args: Record<string, unknown>) {
  return desktopInvoke<T>(command, JSON.parse(JSON.stringify(args)));
}

export class LocalCodexClient {
  private users = new Map<string, number>();
  retainResource(id: string) {
    this.users.set(id, (this.users.get(id) || 0) + 1);
  }
  releaseResource(id: string) {
    const count = (this.users.get(id) || 1) - 1;
    if (count) this.users.set(id, count);
    else this.users.delete(id);
    return count === 0;
  }
  async bootstrap(): Promise<AgentBootstrapResponse> {
    return {
      instance_id: "local-codex",
      protocol_version: 1,
      capability_version: 1,
      csrf_token: "",
      expires_at: 0,
      refresh_at: 0
    };
  }
  createSession(manifest: AgentMcpManifest, approvalMode: AgentApprovalMode) {
    return invoke<AgentSessionCreateResponse>("local_codex_create", {
      input: { manifest, approvalMode, language: agentClient.getResponseLanguage() }
    });
  }
  sendMessage(sessionId: string, resourceSessionId: string, message: AgentMessageRequest) {
    return invoke<AgentMessageResponse>("local_codex_send", {
      sessionId,
      resourceSessionId,
      message,
      language: agentClient.getResponseLanguage()
    });
  }
  updateContext(sessionId: string, resourceSessionId: string, context: Record<string, unknown>) {
    return invoke<void>("local_codex_context", { sessionId, resourceSessionId, context });
  }
  resolveApproval(sessionId: string, resourceSessionId: string, approvalId: string, request: AgentApprovalRequest) {
    return invoke<void>("local_codex_approve", {
      sessionId,
      resourceSessionId,
      approvalId,
      decision: request.decision
    });
  }
  setApprovalMode(sessionId: string, resourceSessionId: string, request: AgentApprovalModeRequest) {
    return invoke<void>("local_codex_mode", { sessionId, resourceSessionId, mode: request.mode });
  }
  sendToolResult(sessionId: string, resourceSessionId: string, toolCallId: string, result: AgentToolResultRequest) {
    return invoke<void>("local_codex_result", { sessionId, resourceSessionId, toolCallId, result });
  }
  history(sessionId: string, resourceSessionId: string, after = 0) {
    return invoke<AgentHistoryResponse>("local_codex_history", { sessionId, resourceSessionId, after });
  }
  cancel(sessionId: string, resourceSessionId: string) {
    return invoke<void>("local_codex_cancel", { sessionId, resourceSessionId });
  }
  deleteSession(sessionId: string, resourceSessionId: string) {
    return invoke<void>("local_codex_delete", { sessionId, resourceSessionId });
  }
}
const localClient = new LocalCodexClient();

export class LocalCodexConnection implements AgentConnection {
  private stopped = false;
  private unlisten?: () => void;
  private cursor: number;
  constructor(
    private readonly options: AgentSseOptions,
    private readonly client = localClient
  ) {
    this.cursor = options.after || 0;
  }
  async start() {
    let catchingUp = true;
    const buffered: AgentEvent[] = [];
    let bufferedBytes = 0;
    const fail = (error: Error) => {
      if (this.stopped) return;
      this.stop();
      void this.client.cancel(this.options.sessionId, this.options.resourceSessionId).catch(() => {});
      this.options.onUnavailable?.(error);
    };
    const accept = (event: AgentEvent) => {
      if (
        this.stopped ||
        event.session_id !== this.options.sessionId ||
        event.resource_session_id !== this.options.resourceSessionId ||
        event.seq <= this.cursor
      )
        return;
      this.cursor = event.seq;
      this.options.onEvent(event);
    };
    try {
      const stop = await desktopListen<AgentEvent>("local-codex-event", ({ payload }) => {
        if (
          this.stopped ||
          payload.session_id !== this.options.sessionId ||
          payload.resource_session_id !== this.options.resourceSessionId
        )
          return;
        try {
          if (catchingUp) {
            bufferedBytes += JSON.stringify(payload).length * 2;
            if (buffered.length >= 4096 || bufferedBytes > 4 * 1024 * 1024)
              throw new Error("Local Codex event buffer exceeded its limit");
            buffered.push(payload);
          } else accept(payload);
        } catch (error) {
          fail(error as Error);
        }
      });
      if (this.stopped) return stop();
      this.unlisten = stop;
      this.options.onState?.("connecting");
      for (let pages = 0; !this.stopped; pages++) {
        if (pages >= 32) throw new Error("Local Codex event recovery exceeded its limit");
        const history = await this.client.history(this.options.sessionId, this.options.resourceSessionId, this.cursor);
        for (const event of history.events) accept(event);
        if (!history.has_more) break;
      }
      catchingUp = false;
      for (const event of buffered) accept(event);
      if (!this.stopped) this.options.onState?.("connected");
    } catch (error) {
      fail(error as Error);
    }
  }
  stop() {
    this.stopped = true;
    this.unlisten?.();
    this.unlisten = undefined;
    this.options.onState?.("closed");
  }
}
export type AgentSessionClient = Pick<
  AgentClient,
  | "retainResource"
  | "releaseResource"
  | "bootstrap"
  | "createSession"
  | "sendMessage"
  | "updateContext"
  | "resolveApproval"
  | "setApprovalMode"
  | "sendToolResult"
  | "history"
  | "cancel"
  | "deleteSession"
> & { getApproval?: AgentClient["getApproval"] };

export function useDesktopCodexSession(
  options: AgentSessionOptions,
  create: (options: AgentSessionOptions) => AgentSessionController
): AgentSessionController {
  const user = useUserInfoStore();
  const context = computed(() => JSON.stringify([user.currentSite, user.currentAccountId, user.orgId]));
  const initialContext = context.value;
  const current = computed(() => user.loggedIn && context.value === initialContext);
  const localOptions = () => ({
    ...options,
    client: localClient,
    enabled: computed(() => localCodexSettings.value.enabled && current.value),
    createSse: (stream: AgentSseOptions) => new LocalCodexConnection(stream)
  });
  const selected = () =>
    localCodexSettings.value.enabled
      ? localOptions()
      : { ...options, enabled: computed(() => serverWorkspaceAiEnabled.value && current.value) };
  const controller = shallowRef(create(selected()));
  let manifest: AgentMcpManifest | undefined;
  let disposed = false;
  let generation = 0;
  let switching = Promise.resolve();
  const stop = watch(
    () =>
      localCodexSettings.value.enabled
        ? `${localCodexSettings.value.executable}\0${localCodexSettings.value.model}\0${localCodexRevision.value}`
        : "server",
    () => {
      const current = ++generation;
      switching = switching
        .catch(() => {})
        .then(async () => {
          if (disposed || current !== generation) return;
          await controller.value.actions.dispose();
          if (disposed || current !== generation) return;
          controller.value = create(selected());
          if (manifest) await controller.value.actions.attachManifest(manifest);
        });
      void switching.catch(() => {});
    },
    { flush: "sync" }
  );
  return {
    get state() {
      return controller.value.state;
    },
    actions: {
      async attachManifest(value) {
        manifest = value;
        await switching;
        if (!disposed) await controller.value.actions.attachManifest(value);
      },
      async updateContext(value) {
        await switching;
        if (!disposed) await controller.value.actions.updateContext(value);
      },
      async sendMessage(value) {
        await switching;
        if (disposed) throw new Error("AI session is closed");
        await controller.value.actions.sendMessage(value);
      },
      resolveApproval: (...args) => controller.value.actions.resolveApproval(...args),
      receiveKokoFrame: (value) => controller.value.actions.receiveKokoFrame(value),
      cancel: () => controller.value.actions.cancel(),
      newSession: () => controller.value.actions.newSession(),
      setApprovalMode: (mode) => controller.value.actions.setApprovalMode(mode),
      async dispose() {
        disposed = true;
        ++generation;
        stop();
        await controller.value.actions.dispose();
        await switching.catch(() => {});
      }
    }
  };
}
