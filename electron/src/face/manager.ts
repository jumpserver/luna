import type { App } from "electron";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import path from "node:path";
import type { Interface as ReadlineInterface } from "node:readline";
import { createInterface } from "node:readline";

interface CameraDevice {
  deviceId?: string;
  groupId?: string;
  label?: string;
}

interface CameraPolicy {
  mode?: "any" | "allowlist";
  allowedDeviceIds?: unknown[];
  allowedLabels?: unknown[];
  labelPattern?: string;
}

interface EffectiveCameraPolicy {
  mode: "any" | "allowlist";
  allowedDeviceIds: string[];
  allowedLabels: string[];
  labelPattern: string;
  managed: boolean;
}

interface FaceActionInput {
  type?: string;
  method?: string;
  url?: string;
}

type NormalizedAction =
  | { type: "none" }
  | { type: "method"; method: string }
  | { type: "api" | "redirect"; url: string };

interface FaceFlowEvent {
  event: string;
  [key: string]: unknown;
}

interface FaceSessionOwner {
  id: number;
  label: string;
}

interface FaceSessionStartArgs {
  camera?: CameraDevice;
  cameraPolicy?: CameraPolicy;
  actions?: Record<string, FaceActionInput>;
  mode?: string;
  name?: string;
  personId?: string;
  requiredSamples?: number;
  targetId?: string;
  targetName?: string;
  timeoutSeconds?: number;
  awayAfterSeconds?: number;
  threshold?: number;
  debug?: boolean;
}

interface FaceFrameArgs {
  sessionId?: string;
  image?: string;
}

interface FaceSessionRecord {
  ownerId: number;
  label: string;
  actions: Record<string, NormalizedAction>;
  camera: ReturnType<typeof validateCamera>;
}

interface FaceWorkerFrameResult extends Record<string, unknown> {
  flow?: { events?: FaceFlowEvent[] };
}

interface FaceEngineLaunch {
  command: string;
  args: string[];
  cwd: string;
  runtime: "bundle" | "python";
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  command: string;
}

interface WorkerResponse {
  id?: number;
  ok?: boolean;
  result?: unknown;
  error?: { message?: string };
}

interface FaceEngineManagerOptions {
  app: App;
  projectRoot: string;
  isDevelopment: boolean;
  emit: (event: string, payload: unknown, label?: string) => void;
  fetch: (url: string, options?: Record<string, unknown>) => Promise<{ ok: boolean; status: number }>;
  env?: NodeJS.ProcessEnv;
}

const MAX_FRAME_CHARACTERS = 12 * 1024 * 1024;
const DEFAULT_REQUEST_TIMEOUT = 30_000;
const INITIALIZE_TIMEOUT = 180_000;

async function isExecutable(candidate: string) {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

function executableName() {
  return process.platform === "win32" ? "facelive-worker.exe" : "facelive-worker";
}

function localPython(faceRoot: string) {
  return process.platform === "win32"
    ? path.join(faceRoot, ".venv", "Scripts", "python.exe")
    : path.join(faceRoot, ".venv", "bin", "python");
}

function normalizeStringList(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function managedCameraPolicy(policy: CameraPolicy = {}, env: NodeJS.ProcessEnv = process.env): EffectiveCameraPolicy {
  const enforcedIds = String(env.JMS_FACE_CAMERA_DEVICE_IDS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const enforcedPattern = String(env.JMS_FACE_CAMERA_LABEL_PATTERN || "").trim();
  if (enforcedIds.length || enforcedPattern) {
    return {
      mode: "allowlist",
      allowedDeviceIds: enforcedIds,
      allowedLabels: [],
      labelPattern: enforcedPattern,
      managed: true
    };
  }

  return {
    mode: policy.mode === "allowlist" ? "allowlist" : "any",
    allowedDeviceIds: normalizeStringList(policy.allowedDeviceIds),
    allowedLabels: normalizeStringList(policy.allowedLabels),
    labelPattern: String(policy.labelPattern || "").trim(),
    managed: false
  };
}

function validateCamera(camera: CameraDevice = {}, policy: CameraPolicy = {}, env: NodeJS.ProcessEnv = process.env) {
  const effective = managedCameraPolicy(policy, env);
  const device = {
    deviceId: String(camera.deviceId || "").trim(),
    groupId: String(camera.groupId || "").trim(),
    label: String(camera.label || "").trim()
  };
  if (!device.deviceId) throw new Error("Camera deviceId is required");
  if (effective.mode === "any") return { device, policy: effective, matchedBy: "any" };

  const idMatch = effective.allowedDeviceIds.includes(device.deviceId);
  const labelMatch = effective.allowedLabels.some((label) => label.toLowerCase() === device.label.toLowerCase());
  let patternMatch = false;
  if (effective.labelPattern) {
    if (effective.labelPattern.length > 160) throw new Error("Camera label pattern is too long");
    try {
      patternMatch = new RegExp(effective.labelPattern, "i").test(device.label);
    } catch {
      throw new Error("Camera label pattern is invalid");
    }
  }
  if (!idMatch && !labelMatch && !patternMatch) {
    throw new Error(`Camera '${device.label || device.deviceId}' is not allowed by the device policy`);
  }
  return {
    device,
    policy: effective,
    matchedBy: idMatch ? "device_id" : labelMatch ? "label" : "label_pattern"
  };
}

function normalizeAction(action?: FaceActionInput): NormalizedAction {
  const candidate = action?.type;
  const type: NormalizedAction["type"] =
    candidate === "api" || candidate === "redirect" || candidate === "method" ? candidate : "none";
  if (type === "none") return { type };
  if (type === "method") {
    const method = String(action.method || "").trim();
    if (!/^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/.test(method)) {
      throw new Error("Face flow method name is invalid");
    }
    return { type, method };
  }

  const value = String(action.url || "").trim();
  if (type === "redirect" && value.startsWith("/")) return { type, url: value };
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Face flow action URL must be HTTP/HTTPS and must not contain credentials");
  }
  return { type, url: url.toString() };
}

function normalizeActions(actions: Record<string, FaceActionInput> = {}) {
  return Object.fromEntries(Object.entries(actions).map(([event, action]) => [event, normalizeAction(action)]));
}

export class FaceEngineManager {
  private readonly app: App;
  private readonly projectRoot: string;
  private readonly isDevelopment: boolean;
  private readonly emit: FaceEngineManagerOptions["emit"];
  private readonly fetch: FaceEngineManagerOptions["fetch"];
  private readonly env: NodeJS.ProcessEnv;
  private readonly faceRoot: string;
  private child: ChildProcessWithoutNullStreams | null = null;
  private reader: ReadlineInterface | null = null;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly sessions = new Map<string, FaceSessionRecord>();
  private nextRequestId = 1;
  private readonly stderrTail: string[] = [];
  private stopping = false;

  constructor({
    app,
    projectRoot,
    isDevelopment,
    emit,
    fetch: fetchImpl,
    env = process.env
  }: FaceEngineManagerOptions) {
    this.app = app;
    this.projectRoot = projectRoot;
    this.isDevelopment = isDevelopment;
    this.emit = emit;
    this.fetch = fetchImpl;
    this.env = env;
    this.faceRoot = path.join(projectRoot, "electron", "face-engine");
  }

  async status() {
    const launch = await this.resolveLaunch();
    if (!launch) {
      return {
        available: false,
        running: false,
        setupCommand: "uv sync --project electron/face-engine --group dev",
        error: "Face engine runtime is not installed"
      };
    }
    if (!this.child) return { available: true, running: false, runtime: launch.runtime, executable: launch.command };
    const worker = await this.request<Record<string, unknown>>("status", {});
    return { available: true, running: true, runtime: launch.runtime, executable: launch.command, ...worker };
  }

  async initialize() {
    const worker = await this.request<Record<string, unknown>>("initialize", {}, INITIALIZE_TIMEOUT);
    return { available: true, running: true, ...worker };
  }

  async configure(config: unknown) {
    const worker = await this.request<Record<string, unknown>>("configure", config || {}, INITIALIZE_TIMEOUT);
    return { available: true, running: true, ...worker };
  }

  listPeople() {
    return this.request("list_people", {});
  }

  removePerson(personId: string) {
    return this.request("remove_person", { person_id: personId });
  }

  async startSession(owner: FaceSessionOwner, args: FaceSessionStartArgs) {
    const camera = validateCamera(args.camera, args.cameraPolicy, this.env);
    const sessionId = randomUUID();
    const actions = normalizeActions(args.actions);
    const result = await this.request<Record<string, unknown>>(
      "start_session",
      {
        session_id: sessionId,
        mode: args.mode,
        name: args.name,
        person_id: args.personId,
        required_samples: args.requiredSamples,
        target_id: args.targetId,
        target_name: args.targetName,
        timeout_seconds: args.timeoutSeconds,
        away_after_seconds: args.awayAfterSeconds,
        threshold: args.threshold,
        debug: Boolean(args.debug)
      },
      INITIALIZE_TIMEOUT
    );
    this.sessions.set(sessionId, {
      ownerId: owner.id,
      label: owner.label,
      actions,
      camera
    });
    return { ...result, camera };
  }

  async processFrame(ownerId: number, args: FaceFrameArgs) {
    const session = this.requireSession(ownerId, args.sessionId);
    const image = String(args.image || "");
    if (!image || image.length > MAX_FRAME_CHARACTERS) throw new Error("Face frame is empty or too large");
    const result = await this.request<FaceWorkerFrameResult>("process_frame", { session_id: args.sessionId, image });
    this.dispatchFlowEvents(session, result.flow?.events || []);
    return result;
  }

  async stopSession(ownerId: number, sessionId: string) {
    this.requireSession(ownerId, sessionId);
    this.sessions.delete(sessionId);
    return this.request("stop_session", { session_id: sessionId });
  }

  stopOwner(ownerId: number) {
    const ids = [...this.sessions].filter(([, session]) => session.ownerId === ownerId).map(([sessionId]) => sessionId);
    for (const sessionId of ids) {
      this.sessions.delete(sessionId);
      void this.request("stop_session", { session_id: sessionId }).catch(() => {});
    }
  }

  async shutdown() {
    this.stopping = true;
    this.sessions.clear();
    const child = this.child;
    if (!child) return;
    try {
      await this.request("shutdown", {}, 1_500);
    } catch {}
    if (this.child === child && child.exitCode == null) child.kill("SIGTERM");
    this.clearProcess(child, new Error("Face engine stopped"));
  }

  async request<T = Record<string, unknown>>(
    command: string,
    payload: unknown,
    timeout = DEFAULT_REQUEST_TIMEOUT
  ): Promise<T> {
    const child = await this.ensureProcess();
    const id = this.nextRequestId++;
    const message = `${JSON.stringify({ id, command, payload })}\n`;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Face engine request timed out: ${command}`));
      }, timeout);
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer, command });
      child.stdin.write(message, (error) => {
        if (!error) return;
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      });
    });
  }

  async resolveLaunch(): Promise<FaceEngineLaunch | null> {
    const explicitExecutable = String(this.env.JMS_FACE_ENGINE_EXECUTABLE || "").trim();
    if (explicitExecutable) {
      const command = path.resolve(explicitExecutable);
      if (!(await isExecutable(command))) throw new Error(`Face engine executable not found: ${command}`);
      return { command, args: [], cwd: path.dirname(command), runtime: "bundle" };
    }

    const explicitPython = String(this.env.JMS_FACE_ENGINE_PYTHON || "").trim();
    if (explicitPython) {
      const command = path.resolve(explicitPython);
      if (!(await isExecutable(command))) throw new Error(`Face engine Python not found: ${command}`);
      return { command, args: [path.join(this.faceRoot, "worker.py")], cwd: this.faceRoot, runtime: "python" };
    }

    if (!this.isDevelopment) {
      const command = path.join(process.resourcesPath, "face-engine", executableName());
      return (await isExecutable(command))
        ? { command, args: [], cwd: path.dirname(command), runtime: "bundle" }
        : null;
    }

    const command = localPython(this.faceRoot);
    return (await isExecutable(command))
      ? { command, args: [path.join(this.faceRoot, "worker.py")], cwd: this.faceRoot, runtime: "python" }
      : null;
  }

  async ensureProcess(): Promise<ChildProcessWithoutNullStreams> {
    if (this.child && this.child.exitCode == null && !this.child.killed) return this.child;
    const launch = await this.resolveLaunch();
    if (!launch) {
      throw new Error("Face engine is not installed. Run: uv sync --project electron/face-engine --group dev");
    }
    const configuredModelRoot = String(this.env.JMS_FACE_MODEL_ROOT || "").trim();
    const packagedModelRoot = !this.isDevelopment ? path.join(process.resourcesPath, "face-engine", "model-root") : "";
    const modelRoot =
      configuredModelRoot || (packagedModelRoot && (await isExecutable(packagedModelRoot)) ? packagedModelRoot : "");
    this.stopping = false;
    const child = spawn(launch.command, launch.args, {
      cwd: launch.cwd,
      env: {
        ...this.env,
        PYTHONUNBUFFERED: "1",
        JMS_FACE_DATA_DIR: path.join(this.app.getPath("userData"), "face-engine"),
        ...(modelRoot ? { JMS_FACE_MODEL_ROOT: modelRoot } : {})
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
    this.child = child;
    this.reader = createInterface({ input: child.stdout });
    this.reader.on("line", (line) => this.handleLine(child, line));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => this.handleStderr(chunk));
    child.once("error", (error) => this.clearProcess(child, error));
    child.once("exit", (code, signal) => {
      const detail = signal || code === 0 ? String(signal || code) : `code ${code}`;
      this.clearProcess(child, new Error(`Face engine exited with ${detail}`));
    });
    this.emit("face-engine-status", { status: "starting", runtime: launch.runtime });
    return child;
  }

  handleLine(child: ChildProcessWithoutNullStreams, line: string) {
    if (child !== this.child) return;
    let response: WorkerResponse;
    try {
      response = JSON.parse(line);
    } catch {
      this.handleStderr(`Invalid worker response: ${line.slice(0, 500)}`);
      return;
    }
    const pending = this.pending.get(response.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(response.id);
    if (response.ok) pending.resolve(response.result);
    else pending.reject(new Error(response.error?.message || `Face engine command failed: ${pending.command}`));
  }

  handleStderr(chunk: string | Buffer) {
    for (const line of String(chunk).split(/\r?\n/).filter(Boolean)) {
      this.stderrTail.push(line);
      if (this.stderrTail.length > 30) this.stderrTail.shift();
      if (this.env.JMS_FACE_DEBUG === "1") console.warn(`[face-engine] ${line}`);
    }
  }

  clearProcess(child: ChildProcessWithoutNullStreams, error: Error) {
    if (child !== this.child) return;
    this.reader?.close();
    this.reader = null;
    this.child = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.sessions.clear();
    this.emit("face-engine-status", {
      status: this.stopping ? "stopped" : "error",
      error: error.message,
      stderr: this.stderrTail.slice(-8)
    });
  }

  requireSession(ownerId: number, sessionId?: string) {
    const session = this.sessions.get(String(sessionId || ""));
    if (!session || session.ownerId !== ownerId) throw new Error("Face session not found for this window");
    return session;
  }

  dispatchFlowEvents(session: FaceSessionRecord, events: FaceFlowEvent[]) {
    for (const event of events) {
      const payload = { ...event, occurred_at: new Date().toISOString() };
      this.emit("face-flow-event", payload, session.label);
      const action = session.actions[event.event];
      if (!action || action.type === "none") continue;
      if (action.type === "redirect") {
        this.emit("face-flow-redirect", { url: action.url, event: payload }, session.label);
      } else if (action.type === "method") {
        this.emit("face-flow-method", { method: action.method, event: payload }, session.label);
      } else if (action.type === "api") {
        void this.postCallback(action.url, payload, session.label);
      }
    }
  }

  async postCallback(url: string, payload: FaceFlowEvent, label: string) {
    try {
      const response = await this.fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5_000)
      });
      this.emit(
        "face-flow-action-result",
        { event: payload.event, action: "api", ok: response.ok, status: response.status },
        label
      );
    } catch (error) {
      this.emit(
        "face-flow-action-result",
        {
          event: payload.event,
          action: "api",
          ok: false,
          error: String(error instanceof Error ? error.message : error)
        },
        label
      );
    }
  }
}

export const faceEngineInternals = {
  managedCameraPolicy,
  normalizeAction,
  normalizeActions,
  validateCamera
};
