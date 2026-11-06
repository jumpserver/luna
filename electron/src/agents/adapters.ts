import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { agentCommand, AgentProcess } from "./process";
import type { AgentAdapter, AgentEvent, AgentProfile, McpConnection } from "./types";

export { probeAgent } from "./process";

type Pending = { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
type Approval = {
  event: AgentEvent;
  respond: (allow: boolean) => Promise<void>;
  timer?: ReturnType<typeof setTimeout>;
};

const instructions =
  "You are operating inside Luna. Use the injected JumpServer MCP server for JumpServer asset operations. " +
  "Local shell and file tools operate on this computer and the configured working directory, not a remote asset or the user's terminal. " +
  "An execute_command response containing action_id means submitted, not completed: use query_actions to obtain the final result. " +
  "Stopping generation does not cancel a remote operation. If an operation's result is unknown, do not automatically replay a write or other side effect.";

// Pi has native MCP but no one-shot CLI MCP configuration flag. This extension
// registers a session-only server and gates tools using Pi's native RPC UI.
// https://pi.dev/docs/latest/extensions#MCP-Servers
const piExtension = `export default function (pi) {
  if (typeof pi.registerMcpServer !== "function") throw new Error("Luna requires Pi with native MCP support");
  const ownedMcpPrefix = "mcp__" + process.env.LUNA_MCP_NAME + "__";
  pi.registerMcpServer(process.env.LUNA_MCP_NAME, {
    url: process.env.LUNA_MCP_URL, headers: JSON.parse(process.env.LUNA_MCP_HEADERS), exposure: "direct"
  });
  pi.on("tool_call", async (event, ctx) => {
    if (ctx.signal?.aborted) return { block: true, reason: "Agent turn cancelled" };
    // Pi's documented native naming is mcp__<server>__<tool>. This server name
    // contains only letters, digits and underscores, so no normalization occurs.
    // Only these calls reach Luna's proxy, which always performs host approval.
    if (event.toolName.startsWith(ownedMcpPrefix) && event.toolName.length > ownedMcpPrefix.length) return;
    const detail = event.toolName + "\\n" + JSON.stringify(event.input);
    if (!ctx.hasUI || detail.length > 60000 || ctx.signal?.aborted)
      return { block: true, reason: "Luna cannot safely confirm this tool call" };
    const allowed = await ctx.ui.confirm("Allow tool call?", detail, { signal: ctx.signal });
    if (!allowed || ctx.signal?.aborted) return { block: true, reason: "Denied by user" };
  });
  pi.on("session_start", (_event, ctx) => ctx.ui.notify(process.env.LUNA_READY, "info"));
}`;

class NativeAdapter implements AgentAdapter {
  private process!: AgentProcess;
  private pending = new Map<string, Pending>();
  private approvals = new Map<string, Approval>();
  private texts = new Map<string, { id: string; text: string }>();
  private directory?: string;
  private closed = false;
  private busy = false;
  private stopping = false;
  private threadId = "";
  private turnId = "";
  private messageId = "";
  private submission: Promise<void> = Promise.resolve();
  private piReady = "";
  private ownedMcpPrefix = "";
  private readyResolve?: () => void;
  private readyReject?: (error: Error) => void;
  private turnError = false;
  private stopTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private profile: AgentProfile,
    private mcp: McpConnection,
    private emit: (event: AgentEvent) => void
  ) {}

  private redact = (text: string) => {
    let safe = text;
    for (const value of Object.values(this.mcp.headers)) if (value) safe = safe.split(value).join("[redacted]");
    return safe;
  };

  private event(type: AgentEvent["type"], text: string, extra: Partial<AgentEvent> = {}) {
    this.emit({ id: randomUUID(), type, text: this.redact(text), ...extra });
  }

  private text(key: string, value: string, complete = false) {
    if (typeof value !== "string" || !value) return;
    const previous = this.texts.get(key);
    if (complete && previous) return;
    const entry = { id: previous?.id || randomUUID(), text: (previous?.text || "") + value };
    if (Buffer.byteLength(entry.text, "utf8") > 256 * 1024)
      return this.fail(new Error("Agent message exceeded the 256 KB chat limit"));
    this.texts.set(key, entry);
    this.event("text", entry.text, { id: entry.id, role: "assistant" });
  }

  private request(method: string, params: any = {}) {
    const id = randomUUID();
    const message =
      this.profile.engine === "codex"
        ? { id, method, params }
        : this.profile.engine === "claude"
          ? { type: "control_request", request_id: id, request: { subtype: method, ...params } }
          : { id, type: method, ...params };
    return new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error(`Agent request timed out: ${method}`)), 30_000);
      this.pending.set(id, { resolve, reject, timer });
      this.process.write(message).catch((error) => this.fail(error));
    });
  }

  private response(id: unknown, value: unknown, error?: string) {
    const pending = this.pending.get(String(id));
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(String(id));
    if (error) pending.reject(new Error(this.redact(error)));
    else pending.resolve(value);
  }

  private async approval(id: string, text: string, respond: Approval["respond"], timeout?: number) {
    if (this.closed || this.stopping || !this.busy || text.length > 60_000) return respond(false);
    if (this.approvals.has(id)) throw new Error("Duplicate agent approval request");
    const event: AgentEvent = {
      id: randomUUID(),
      type: "approval",
      requestId: id,
      text: this.redact(text),
      status: "pending"
    };
    const approval: Approval = { event, respond };
    if (timeout && timeout > 0)
      approval.timer = setTimeout(
        () => {
          this.resolveApproval(id, false).catch((error) => this.fail(error));
        },
        Math.min(timeout, 2_147_483_647)
      );
    this.approvals.set(id, approval);
    this.emit(event);
  }

  private async resolveApproval(id: string, allow: boolean) {
    const approval = this.approvals.get(id);
    if (!approval) throw new Error("Approval request is no longer pending");
    this.approvals.delete(id);
    clearTimeout(approval.timer);
    await approval.respond(allow);
    this.emit({ ...approval.event, status: allow ? "approved" : "denied" });
  }

  async approve(requestId: string, allow: boolean) {
    if (this.closed || this.stopping) throw new Error("Agent is not accepting approvals");
    await this.resolveApproval(requestId, allow);
  }

  private clearApprovals() {
    for (const approval of this.approvals.values()) {
      clearTimeout(approval.timer);
      this.emit({ ...approval.event, status: "cancelled" });
    }
    this.approvals.clear();
  }

  private settled(error?: string) {
    clearTimeout(this.stopTimer);
    this.busy = false;
    this.stopping = false;
    this.turnId = "";
    this.clearApprovals();
    if (error) this.event("error", error);
    this.event("status", error || this.turnError ? "Agent turn failed" : "Ready", {
      status: error || this.turnError ? "error" : "idle"
    });
  }

  private fail(error: Error) {
    if (this.closed) return;
    this.event("error", error.message);
    this.event("status", "Agent disconnected", { status: "error" });
    this.dispose(error);
  }

  private dispose(error = new Error("Agent session closed")) {
    clearTimeout(this.stopTimer);
    this.closed = true;
    this.busy = false;
    this.clearApprovals();
    this.readyReject?.(error);
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.process?.close();
    if (this.directory) void rm(this.directory, { recursive: true, force: true }).catch(() => {});
  }

  close() {
    if (!this.closed) this.dispose();
  }

  async start() {
    const plan = await agentCommand(this.profile);
    const env = { ...process.env };
    const name = `luna_${randomUUID().replaceAll("-", "")}`;
    this.ownedMcpPrefix = `mcp__${name}__`;
    let args: string[];
    if (this.profile.engine === "codex") {
      const headers = Object.entries(this.mcp.headers)
        .map(([key, value], index) => {
          const variable = `LUNA_MCP_HEADER_${index}`;
          env[variable] = value;
          return `${JSON.stringify(key)} = ${JSON.stringify(variable)}`;
        })
        .join(", ");
      args = [
        "app-server",
        "-c",
        // This exact session-only server gates every tool call in Luna's host proxy.
        // Avoid Codex's extra elicitation approval; other servers retain their policy.
        `mcp_servers.${name} = { url = ${JSON.stringify(this.mcp.url)}, required = true, default_tools_approval_mode = "approve", env_http_headers = { ${headers} } }`
      ];
    } else {
      this.directory = await mkdtemp(path.join(tmpdir(), "luna-agent-"));
      if (this.profile.engine === "claude") {
        const config = path.join(this.directory, "mcp.json");
        await writeFile(config, JSON.stringify({ mcpServers: { [name]: { type: "http", ...this.mcp } } }), {
          mode: 0o600
        });
        args = [
          "--output-format",
          "stream-json",
          "--input-format",
          "stream-json",
          "--verbose",
          "--include-partial-messages",
          "--no-session-persistence",
          "--permission-prompt-tool",
          "stdio",
          "--permission-mode",
          "default",
          "--setting-sources=",
          "--strict-mcp-config",
          "--mcp-config",
          config,
          "--append-system-prompt",
          instructions
        ];
      } else {
        const extension = path.join(this.directory, "luna.ts");
        await writeFile(extension, piExtension, { mode: 0o600 });
        this.piReady = `LUNA_READY:${randomUUID()}`;
        Object.assign(env, {
          LUNA_MCP_NAME: name,
          LUNA_MCP_URL: this.mcp.url,
          LUNA_MCP_HEADERS: JSON.stringify(this.mcp.headers),
          LUNA_READY: this.piReady
        });
        args = ["--mode", "rpc", "--no-session", "-e", extension, "--append-system-prompt", instructions];
      }
      if (this.profile.model) args.push("--model", this.profile.model);
    }
    let ready: Promise<void> | undefined;
    if (this.profile.engine === "pi")
      ready = new Promise((resolve, reject) => {
        this.readyResolve = resolve;
        this.readyReject = reject;
      });
    this.process = new AgentProcess(
      plan.command,
      [...plan.args, ...args],
      this.profile.cwd,
      env,
      (message) => this.receive(message),
      (error) => {
        if (error) this.fail(error);
      },
      this.redact
    );
    if (this.profile.engine === "codex") {
      await this.request("initialize", {
        clientInfo: { name: "luna", title: "Luna", version: "1.0" },
        capabilities: {}
      });
      await this.process.write({ method: "initialized" });
      const result = await this.request("thread/start", {
        cwd: this.profile.cwd || undefined,
        model: this.profile.model || undefined,
        approvalPolicy: "untrusted",
        approvalsReviewer: "user",
        sandbox: "workspace-write",
        ephemeral: true,
        developerInstructions: instructions
      });
      if (!result?.thread?.id) throw new Error("Codex did not return a thread ID");
      this.threadId = result.thread.id;
    } else if (this.profile.engine === "claude") {
      await this.request("initialize", { hooks: null });
    } else {
      const timer = setTimeout(
        () => this.fail(new Error("Pi did not load the native MCP and approval extension; update Pi")),
        30_000
      );
      try {
        await Promise.all([ready, this.request("get_state")]);
      } finally {
        clearTimeout(timer);
      }
    }
    if (this.closed) throw new Error("Agent closed during startup");
    this.event("status", "Ready", { status: "idle" });
    return this;
  }

  async send(text: string) {
    if (this.closed) throw new Error("Agent session is closed");
    if (this.busy) throw new Error("Wait for the current agent turn to finish");
    if (!text.trim()) throw new Error("Message is empty");
    this.busy = true;
    this.turnError = false;
    this.texts.clear();
    this.messageId = randomUUID();
    this.event("status", "Running", { status: "running" });
    this.submission = (async () => {
      if (this.profile.engine === "codex") {
        const result = await this.request("turn/start", {
          threadId: this.threadId,
          input: [{ type: "text", text, text_elements: [] }]
        });
        if (this.busy) this.turnId = result?.turn?.id || this.turnId;
        if (this.busy && !this.turnId) throw new Error("Codex did not return a turn ID");
      } else if (this.profile.engine === "claude") {
        await this.process.write({
          type: "user",
          message: { role: "user", content: text },
          parent_tool_use_id: null,
          session_id: ""
        });
      } else await this.request("prompt", { message: text });
    })();
    try {
      await this.submission;
    } catch (error) {
      this.fail(error as Error);
      throw error;
    }
  }

  async stop() {
    if (this.closed || !this.busy || this.stopping) return;
    this.stopping = true;
    this.stopTimer = setTimeout(
      () =>
        this.fail(
          new Error("Agent did not settle after cancellation and was stopped; remote operations may still be running")
        ),
      10_000
    );
    this.event("status", "Stopping", { status: "running" });
    try {
      await Promise.all([...this.approvals.keys()].map((id) => this.resolveApproval(id, false)));
      await this.submission;
      if (this.closed || !this.busy) return;
      if (this.profile.engine === "codex")
        await this.request("turn/interrupt", { threadId: this.threadId, turnId: this.turnId });
      else if (this.profile.engine === "claude") await this.request("interrupt");
      else {
        await this.request("clear_queue");
        await this.request("abort");
      }
    } catch (error) {
      this.fail(error as Error);
      throw error;
    }
  }

  private receive(message: any) {
    if (this.closed) return;
    if (!message || typeof message !== "object") throw new Error("Invalid message");
    if (this.profile.engine === "codex") this.codex(message);
    else if (this.profile.engine === "claude") this.claude(message);
    else this.pi(message);
  }

  private codex(message: any) {
    const p = message.params || {};
    if (message.id !== undefined && !message.method)
      return this.response(message.id, message.result, message.error?.message);
    if (message.id !== undefined) {
      const reply = (result: unknown) => this.process.write({ id: message.id, result });
      if (["item/commandExecution/requestApproval", "item/fileChange/requestApproval"].includes(message.method)) {
        void this.approval(String(message.id), JSON.stringify(p, null, 2), (allow) =>
          reply({ decision: allow ? "accept" : "decline" })
        ).catch((error) => this.fail(error));
      } else if (message.method === "item/permissions/requestApproval") {
        // Additional permission scopes differ between Codex versions; fail closed.
        void reply({ permissions: {}, scope: "turn" }).catch((error) => this.fail(error));
        this.event("status", "Additional permissions declined; use an individual tool approval");
      } else if (message.method === "mcpServer/elicitation/request") {
        void reply({ action: "decline", content: null, _meta: null }).catch((error) => this.fail(error));
        this.event("status", "MCP form input is not supported in this chat");
      } else {
        void this.process
          .write({ id: message.id, error: { code: -32601, message: "This request is not supported by Luna" } })
          .catch((error) => this.fail(error));
        this.event("status", `Unsupported agent request: ${message.method}`);
      }
      return;
    }
    if (message.method === "item/agentMessage/delta") this.text(p.itemId || this.messageId, p.delta);
    else if (message.method === "turn/started") this.turnId = p.turn?.id || this.turnId;
    else if (message.method === "turn/completed")
      this.settled(p.turn?.status === "failed" ? p.turn?.error?.message || "Codex turn failed" : undefined);
    else if (message.method === "error") {
      this.turnError = !p.willRetry;
      this.event("error", p.error?.message || "Codex error");
    } else if (message.method === "mcpServer/startupStatus/updated" && p.status === "failed")
      this.event("error", p.error || `MCP server failed: ${p.name}`);
    else if (message.method === "serverRequest/resolved") {
      const approval = this.approvals.get(String(p.requestId));
      if (approval) {
        clearTimeout(approval.timer);
        this.approvals.delete(String(p.requestId));
        this.emit({ ...approval.event, status: "cancelled" });
      }
    } else if (message.method === "item/started" || message.method === "item/completed") {
      const item = p.item || {};
      if (item.type === "agentMessage" && message.method === "item/completed")
        this.text(item.id || this.messageId, item.text, true);
      else if (["commandExecution", "fileChange", "mcpToolCall"].includes(item.type))
        this.event("tool", JSON.stringify(item, null, 2), {
          id: `tool:${item.id}`,
          status: item.status || (message.method === "item/started" ? "running" : "completed")
        });
    }
  }

  private claude(message: any) {
    if (message.type === "control_response") {
      const r = message.response || {};
      this.response(
        r.request_id,
        r.response,
        r.subtype === "error" ? r.error || "Claude control request failed" : undefined
      );
    } else if (message.type === "control_request") {
      const r = message.request || {};
      if (r.subtype === "can_use_tool") {
        const respond = (allow: boolean) =>
          this.process.write({
            type: "control_response",
            response: {
              subtype: "success",
              request_id: message.request_id,
              response: allow
                ? { behavior: "allow", updatedInput: r.input }
                : { behavior: "deny", message: "Denied by user" }
            }
          });
        // The exact ephemeral server is approved by Luna's host proxy. Other
        // MCP servers and local tools still follow the native approval channel.
        if (
          typeof r.tool_name === "string" &&
          r.tool_name.startsWith(this.ownedMcpPrefix) &&
          r.tool_name.length > this.ownedMcpPrefix.length
        ) {
          void respond(this.busy && !this.stopping && !this.closed).catch((error) => this.fail(error));
        } else
          void this.approval(message.request_id, `${r.tool_name}\n${JSON.stringify(r.input, null, 2)}`, respond).catch(
            (error) => this.fail(error)
          );
      } else
        void this.process
          .write({
            type: "control_response",
            response: { subtype: "error", request_id: message.request_id, error: "Unsupported control request" }
          })
          .catch((error) => this.fail(error));
    } else if (message.type === "control_cancel_request") {
      const approval = this.approvals.get(message.request_id);
      if (approval) {
        clearTimeout(approval.timer);
        this.approvals.delete(message.request_id);
        this.emit({ ...approval.event, status: "cancelled" });
      }
    } else if (message.type === "stream_event") {
      const event = message.event || {};
      if (event.type === "message_start") this.messageId = event.message?.id || randomUUID();
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta")
        this.text(this.messageId, event.delta.text);
    } else if (message.type === "assistant") {
      const content = message.message?.content || [];
      this.text(
        message.message?.id || this.messageId,
        content
          .filter((block: any) => block.type === "text")
          .map((block: any) => block.text)
          .join(""),
        true
      );
      for (const block of content) {
        if (block.type === "tool_use")
          this.event("tool", `${block.name}\n${JSON.stringify(block.input, null, 2)}`, {
            id: `tool:${block.id}`,
            status: "running"
          });
      }
    } else if (message.type === "user") {
      for (const block of message.message?.content || [])
        if (block.type === "tool_result")
          this.event("tool", JSON.stringify(block.content), {
            id: `tool:${block.tool_use_id}`,
            status: block.is_error ? "error" : "completed"
          });
    } else if (message.type === "result") {
      if (!this.texts.size && message.result) this.text(this.messageId, message.result, true);
      this.settled(
        message.is_error ? (message.errors || [message.subtype || "Claude turn failed"]).join("\n") : undefined
      );
    }
  }

  private pi(message: any) {
    if (message.type === "response")
      this.response(
        message.id,
        message.data,
        message.success === false ? message.error || "Pi command failed" : undefined
      );
    else if (message.type === "extension_ui_request") {
      if (message.method === "notify") {
        if (message.message === this.piReady) this.readyResolve?.();
        else this.event(message.notifyType === "error" ? "error" : "status", String(message.message || ""));
      } else if (message.method === "confirm") {
        void this.approval(
          message.id,
          `${message.title || "Confirm"}\n${message.message || ""}`,
          (allow) => this.process.write({ type: "extension_ui_response", id: message.id, confirmed: allow }),
          message.timeout
        ).catch((error) => this.fail(error));
      } else if (["select", "input", "editor"].includes(message.method)) {
        // ponytail: this chat supports binary approvals; richer native forms need
        // an explicit shared input event/response contract before being enabled.
        void this.process
          .write({ type: "extension_ui_response", id: message.id, cancelled: true })
          .catch((error) => this.fail(error));
        this.event("status", `Pi ${message.method} input cancelled: unsupported in this chat`);
      }
    } else if (message.type === "message_start" && message.message?.role === "assistant") this.messageId = randomUUID();
    else if (message.type === "message_update" && message.assistantMessageEvent?.type === "text_delta")
      this.text(this.messageId, message.assistantMessageEvent.delta);
    else if (message.type === "message_end" && message.message?.errorMessage) {
      this.turnError = true;
      this.event("error", message.message.errorMessage);
    } else if (message.type === "tool_execution_start" || message.type === "tool_execution_end")
      this.event("tool", `${message.toolName || "Tool"}\n${JSON.stringify(message.args ?? message.result, null, 2)}`, {
        id: `tool:${message.toolCallId}`,
        status: message.type === "tool_execution_start" ? "running" : message.isError ? "error" : "completed"
      });
    // agent_end may be followed by queued work and is not the idle boundary.
    else if (message.type === "agent_settled") this.settled();
  }
}

export async function createAgentAdapter(
  profile: AgentProfile,
  mcp: McpConnection,
  emit: (event: AgentEvent) => void
): Promise<AgentAdapter> {
  const adapter = new NativeAdapter(profile, mcp, emit);
  try {
    return await adapter.start();
  } catch (error) {
    adapter.close();
    throw error;
  }
}
