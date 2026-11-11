import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  AgentAdapter,
  AdapterFactory,
  AgentEvent,
  AgentProfile,
  AgentSession,
  LocalAgentsSnapshot
} from "./types";

interface AgentRuntime {
  session: AgentSession;
  controller: AbortController;
  adapter?: AgentAdapter;
}

interface ServiceOptions {
  directory: string;
  site: string;
  assertActive(): void;
  adapter: AdapterFactory;
  changed(snapshot: LocalAgentsSnapshot): void;
}

export function validateAgentProfile(value: unknown): AgentProfile {
  if (!value || typeof value !== "object") throw new Error("Invalid Agent profile");
  const input = value as Record<string, unknown>;
  const string = (key: string, limit: number) => {
    if (
      typeof input[key] !== "string" ||
      (input[key] as string).length > limit ||
      /[\0\r\n]/.test(input[key] as string)
    )
      throw new Error(`Invalid Agent ${key}`);
    return (input[key] as string).trim();
  };
  const id = string("id", 64) || randomUUID();
  const name = string("name", 80);
  const engine = string("engine", 16) as AgentProfile["engine"];
  const executable = string("executable", 4096);
  const model = string("model", 256);
  const cwd = string("cwd", 4096);
  if (!/^[a-zA-Z0-9_-]+$/.test(id) || !name || !["codex", "claude", "pi"].includes(engine))
    throw new Error("Invalid Agent profile");
  // An executable is a file or a PATH command, never a shell command line.
  if (!executable || (!path.isAbsolute(executable) && !/^[a-zA-Z0-9_.-]+$/.test(executable)))
    throw new Error("Choose an executable path or a command name without arguments");
  if (cwd && !path.isAbsolute(cwd)) throw new Error("Working directory must be an absolute path");
  return { id, name, engine, executable, model, cwd };
}

export class LocalAgentService {
  private profiles: AgentProfile[] = [];
  private runtimes = new Map<string, AgentRuntime>();
  private initialized?: Promise<void>;
  private writeQueue: Promise<void> = Promise.resolve();
  private notifyTimer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  enabled = false;

  constructor(private readonly options: ServiceOptions) {}

  async initialize() {
    this.initialized ??= (async () => {
      try {
        const saved = JSON.parse(await readFile(path.join(this.options.directory, "profiles.json"), "utf8"));
        if (!Array.isArray(saved) || saved.length > 30) throw new Error("Invalid saved Agent profiles");
        this.profiles = saved.map(validateAgentProfile);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    })();
    await this.initialized;
  }

  snapshot(): LocalAgentsSnapshot {
    return {
      enabled: this.enabled,
      site: this.options.site,
      profiles: structuredClone(this.profiles),
      sessions: structuredClone([...this.runtimes.values()].map(({ session }) => session))
    };
  }

  private active() {
    if (this.disposed) throw new Error("Agent service is closed");
    this.options.assertActive();
    if (!this.enabled) throw new Error("Local agents are not available for this session");
  }

  private notify() {
    if (this.disposed || this.notifyTimer) return;
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = undefined;
      if (!this.disposed) this.options.changed(this.snapshot());
    }, 40);
    this.notifyTimer.unref?.();
  }

  private persist(update: (profiles: AgentProfile[]) => AgentProfile[]) {
    const save = async () => {
      this.active();
      const profiles = update(this.profiles);
      await mkdir(this.options.directory, { recursive: true, mode: 0o700 });
      const file = path.join(this.options.directory, "profiles.json");
      await writeFile(`${file}.tmp`, JSON.stringify(profiles, null, 2), { mode: 0o600 });
      await rename(`${file}.tmp`, file);
      this.profiles = profiles;
      this.notify();
    };
    const next = this.writeQueue.then(save);
    this.writeQueue = next.catch(() => {});
    return next;
  }

  async saveProfile(value: unknown) {
    this.active();
    const profile = validateAgentProfile(value);
    if (profile.cwd && !(await stat(profile.cwd)).isDirectory())
      throw new Error("Working directory is not a directory");
    this.active();
    await this.persist((profiles) => {
      if (profiles.length >= 30 && !profiles.some((item) => item.id === profile.id))
        throw new Error("At most 30 Agent profiles can be saved");
      return [...profiles.filter((item) => item.id !== profile.id), profile];
    });
    return profile;
  }

  async deleteProfile(id: string) {
    this.active();
    await this.persist((profiles) => profiles.filter((profile) => profile.id !== id));
  }

  create(profileId: string) {
    this.active();
    const profile = this.profiles.find((item) => item.id === profileId);
    if (!profile) throw new Error("Agent profile does not exist");
    if (this.runtimes.size >= 20) throw new Error("Close an existing conversation before creating another");
    const session: AgentSession = {
      id: randomUUID(),
      profileId,
      profileName: profile.name,
      engine: profile.engine,
      title: profile.name,
      status: "starting",
      events: []
    };
    const runtime: AgentRuntime = {
      session,
      controller: new AbortController()
    };
    this.runtimes.set(session.id, runtime);
    this.notify();
    void this.start(runtime, { ...profile });
    return structuredClone(session);
  }

  private async start(runtime: AgentRuntime, profile: AgentProfile) {
    try {
      this.active();
      if (runtime.controller.signal.aborted) throw new Error("Agent startup cancelled");
      const adapter = await this.options.adapter(profile, (event) => this.accept(runtime, event));
      if (runtime.controller.signal.aborted || this.disposed) {
        adapter.close();
        throw new Error("Agent startup cancelled");
      }
      runtime.adapter = adapter;
      runtime.session.status = "idle";
      this.notify();
    } catch (error) {
      runtime.adapter?.close();
      this.accept(runtime, { id: randomUUID(), type: "error", text: this.errorText(error) });
    }
  }

  private errorText(error: unknown) {
    return error instanceof Error ? error.message.slice(0, 4000) : "Agent request failed";
  }

  private denyApprovals(runtime: AgentRuntime) {
    for (const event of runtime.session.events) {
      if (event.type === "approval" && (!event.status || event.status === "pending")) event.status = "cancelled";
    }
  }

  private accept(runtime: AgentRuntime, event: AgentEvent) {
    if (this.disposed || this.runtimes.get(runtime.session.id) !== runtime) return;
    if (event.type === "approval" && runtime.session.status !== "running") return;
    if (event.type === "error" || (event.type === "status" && ["idle", "error"].includes(event.status || ""))) {
      this.denyApprovals(runtime);
    }
    const events = runtime.session.events;
    const entry = { ...event, text: String(event.text || "").slice(-256_000) };
    const index = events.findIndex((item) => item.id === entry.id);
    if (index >= 0) events[index] = entry;
    else events.push(entry);
    // ponytail: conversation history lives for this app session, capped at 2,000 events.
    // Add encrypted on-disk history if conversations must survive app restarts.
    if (events.length > 2000) events.splice(0, events.length - 2000);
    let characters = events.reduce((count, item) => count + item.text.length, 0);
    while (characters > 2_000_000 && events.length > 1) {
      const oldest = events.findIndex(
        (item) => item.type !== "approval" || (!!item.status && item.status !== "pending")
      );
      if (oldest < 0 || oldest === events.length - 1) break;
      characters -= events[oldest].text.length;
      events.splice(oldest, 1);
    }
    if (event.type === "error") runtime.session.status = "error";
    if (event.type === "status" && ["idle", "running", "error"].includes(event.status || ""))
      runtime.session.status = event.status as AgentSession["status"];
    this.notify();
  }

  private get(id: string) {
    this.active();
    const runtime = this.runtimes.get(id);
    if (!runtime) throw new Error("Conversation does not exist");
    return runtime;
  }

  async send(id: string, text: string) {
    const runtime = this.get(id);
    if (typeof text !== "string" || !text.trim() || text.length > 100_000) throw new Error("Invalid message");
    if (runtime.session.status !== "idle" || !runtime.adapter)
      throw new Error("Agent is not ready for another message");
    runtime.session.status = "running";
    runtime.session.title = text.trim().slice(0, 60);
    this.accept(runtime, { id: randomUUID(), type: "text", role: "user", text });
    try {
      await runtime.adapter.send(text);
    } catch (error) {
      this.accept(runtime, { id: randomUUID(), type: "error", text: this.errorText(error) });
    }
  }

  async approve(id: string, requestId: string, allow: boolean) {
    const runtime = this.get(id);
    const event = runtime.session.events.find(
      (item) => item.type === "approval" && item.requestId === requestId && (!item.status || item.status === "pending")
    );
    if (!event || !runtime.adapter || runtime.session.status !== "running" || typeof allow !== "boolean")
      throw new Error("Approval is no longer pending");
    event.status = "responding";
    this.notify();
    try {
      await runtime.adapter.approve(requestId, allow);
      event.status = allow ? "approved" : "denied";
    } catch (error) {
      event.status = "failed";
      throw error;
    } finally {
      this.notify();
    }
  }

  async stop(id: string) {
    const runtime = this.runtimes.get(id);
    if (!runtime) return;
    this.denyApprovals(runtime);
    if (!runtime.adapter) {
      runtime.controller.abort();
      runtime.session.status = "error";
    } else {
      await runtime.adapter.stop();
    }
    this.accept(runtime, {
      id: randomUUID(),
      type: "status",
      text: "Generation stopped."
    });
  }

  closeSession(id: string) {
    const runtime = this.runtimes.get(id);
    if (!runtime) return;
    this.runtimes.delete(id);
    this.denyApprovals(runtime);
    runtime.controller.abort();
    runtime.adapter?.close();
    this.notify();
  }

  suspend() {
    for (const runtime of this.runtimes.values()) {
      if (runtime.controller.signal.aborted) continue;
      this.denyApprovals(runtime);
      runtime.controller.abort();
      runtime.adapter?.close();
      runtime.adapter = undefined;
      this.accept(runtime, {
        id: randomUUID(),
        type: "error",
        text: "The client was locked. Create a new conversation after unlocking."
      });
    }
  }

  close() {
    this.disposed = true;
    clearTimeout(this.notifyTimer);
    for (const id of this.runtimes.keys()) this.closeSession(id);
  }
}
