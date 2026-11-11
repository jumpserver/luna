import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { LocalAgentService, validateAgentProfile } from "../src/agents/service.ts";
import type { AgentEvent, AgentProfile } from "../src/agents/types.ts";

const profile: AgentProfile = { id: "one", name: "Codex", engine: "codex", executable: "codex", model: "", cwd: "" };
const tick = () => new Promise((resolve) => setImmediate(resolve));

async function setup(context: any) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "luna-agents-"));
  let active = true;
  let adaptersClosed = 0;
  const calls: unknown[] = [];
  let emit: (event: AgentEvent) => void = () => {};
  const options = {
    directory,
    site: "https://site.example",
    changed: () => {},
    assertActive: () => {
      if (!active) throw new Error("Login expired");
    },
    adapter: async (selected: AgentProfile, publish: typeof emit) => {
      calls.push(selected);
      emit = publish;
      return {
        send: async (text: string) => {
          calls.push(text);
        },
        approve: async (requestId: string, allow: boolean) => {
          calls.push([requestId, allow]);
        },
        stop: async () => {
          emit({ id: "stopped", type: "status", text: "Stopped", status: "idle" });
        },
        close: () => {
          adaptersClosed++;
        }
      };
    }
  };
  const service = new LocalAgentService(options);
  context.after(async () => {
    service.close();
    await rm(directory, { recursive: true, force: true });
  });
  await service.initialize();
  service.enabled = true;
  await service.saveProfile(profile);
  return {
    service,
    options,
    directory,
    calls,
    emit: (event: AgentEvent) => emit(event),
    expire: () => {
      active = false;
    },
    closed: () => ({ adaptersClosed })
  };
}

test("Agent profile validation rejects shell arguments and relative working directories", () => {
  assert.throws(() => validateAgentProfile({ ...profile, executable: "codex --full-auto" }), /executable/);
  assert.throws(() => validateAgentProfile({ ...profile, executable: "codex;echo" }), /executable/);
  assert.throws(() => validateAgentProfile({ ...profile, cwd: "project" }), /absolute/);
  assert.throws(() => validateAgentProfile({ ...profile, engine: "unknown" }), /Invalid/);
  assert.throws(() => validateAgentProfile({ ...profile, id: "../../site" }), /Invalid/);
  assert.equal(
    validateAgentProfile({ ...profile, executable: path.resolve("folder with space/codex") }).engine,
    "codex"
  );
});

test("concurrent profile saves persist independently and do not mutate an existing conversation", async (context) => {
  const { service, directory, options, calls } = await setup(context);
  await Promise.all([
    service.saveProfile({ ...profile, id: "two", engine: "claude" }),
    service.saveProfile({ ...profile, id: "three", engine: "pi" })
  ]);
  assert.equal(JSON.parse(await readFile(path.join(directory, "profiles.json"), "utf8")).length, 3);
  const session = service.create("one");
  await tick();
  await service.saveProfile({ ...profile, engine: "pi" });
  assert.equal((calls[0] as AgentProfile).engine, "codex");
  assert.equal(service.snapshot().sessions.find((item) => item.id === session.id)?.engine, "codex");
  const restored = new LocalAgentService(options);
  await restored.initialize();
  assert.equal(restored.snapshot().profiles.length, 3);
  assert.equal(restored.snapshot().sessions.length, 0);
  restored.close();
});

test("messages, cumulative deltas and approvals stay bound to one conversation", async (context) => {
  const { service, emit, calls } = await setup(context);
  const session = service.create("one");
  await tick();
  await service.send(session.id, "Check host health");
  await assert.rejects(service.send(session.id, "duplicate"), /not ready/);
  emit({ id: "answer", type: "text", text: "Checking" });
  emit({ id: "answer", type: "text", text: "Checking host" });
  emit({ id: "approval", type: "approval", requestId: "approve-1", text: "Execute command?" });
  await assert.rejects(service.approve(session.id, "other", true), /pending/);
  await service.approve(session.id, "approve-1", false);
  await assert.rejects(service.approve(session.id, "approve-1", true), /pending/);
  assert.deepEqual(calls.at(-1), ["approve-1", false]);
  const events = service.snapshot().sessions[0].events;
  assert.equal(events.filter((event) => event.id === "answer").length, 1);
  assert.equal(events[0].role, "user");
  assert.equal(events.find((event) => event.id === "approval")?.status, "denied");
  await service.stop(session.id);
  assert.equal(service.snapshot().sessions[0].status, "idle");
});

test("logout and unavailable sessions prevent new work; closing releases runtimes and ignores late events", async (context) => {
  const { service, emit, expire, closed } = await setup(context);
  const session = service.create("one");
  await tick();
  service.enabled = false;
  await assert.rejects(service.send(session.id, "No"), /not available/);
  service.enabled = true;
  expire();
  await assert.rejects(service.send(session.id, "No"), /expired/);
  service.close();
  emit({ id: "late", type: "text", text: "late" });
  assert.deepEqual(closed(), { adaptersClosed: 1 });
  assert.equal(service.snapshot().sessions.length, 0);
});

test("closing during native startup cleans a late-created adapter", async (context) => {
  const { options } = await setup(context);
  let ready: () => void;
  const waiting = new Promise<void>((resolve) => {
    ready = resolve;
  });
  let closed = false;
  const service = new LocalAgentService({
    ...options,
    adapter: async () => {
      await waiting;
      return {
        send: async () => {},
        approve: async () => {},
        stop: async () => {},
        close: () => {
          closed = true;
        }
      };
    }
  });
  await service.initialize();
  service.enabled = true;
  const session = service.create("one");
  await tick();
  service.closeSession(session.id);
  ready!();
  await tick();
  assert.equal(closed, true);
  assert.equal(service.snapshot().sessions.length, 0);
  service.close();
});

test("only a running conversation can approve native tool calls", async (context) => {
  const { service, emit, expire } = await setup(context);
  const session = service.create("one");
  await tick();
  await service.send(session.id, "Check local files");
  emit({ id: "approval", type: "approval", requestId: "first", text: "Read file?", status: "pending" });
  emit({ id: "done", type: "status", text: "Ready", status: "idle" });
  await assert.rejects(service.approve(session.id, "first", true), /pending/);
  emit({ id: "late", type: "approval", requestId: "late", text: "Late request", status: "pending" });
  assert.ok(!service.snapshot().sessions[0].events.some((event) => event.id === "late"));
  await service.send(session.id, "Check again");
  emit({ id: "approval-2", type: "approval", requestId: "second", text: "Read file?", status: "pending" });
  emit({ id: "failure", type: "error", text: "Process exited" });
  await assert.rejects(service.approve(session.id, "second", true), /pending/);
  expire();
  await service.stop(session.id);
  service.closeSession(session.id);
});
