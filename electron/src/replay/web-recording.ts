import type { Session, WebContents } from "electron";
import { BrowserWindow, ipcMain, session } from "electron";
import { randomUUID } from "node:crypto";
import { Agent } from "node:http";
import { requestWebProxyControl } from "@jumpserver/web-proxy/control";

const RECORDING_PATH = "/_jumpserver/web-recordings";
const RECORDER_URL = "https://weblite-recording.invalid/";
const MAX_CHUNK_BYTES = 8 << 20;
const activeRecorders = new Set<WebVideoRecording>();

interface RecordingOptions {
  label: string;
  sessionId: string;
  targetUrl: string;
  proxyUrl: string;
  proxyAuth: { username: string; password: string };
  webContents: WebContents;
  width: number;
  height: number;
  getPauseReasons: () => string[];
  emit: (state: any) => void;
}

export class WebVideoRecording {
  window: BrowserWindow;
  id = "";
  format = "";
  frameCount = 0;
  pauseReasons = new Set<string>();
  capturePending = Promise.resolve();
  private channel = `jms:web-recording:${randomUUID()}`;
  private resolveInitialized: () => void;
  private rejectInitialized: (error: Error) => void;
  private initialized = new Promise<void>((resolve, reject) => {
    this.resolveInitialized = resolve;
    this.rejectInitialized = reject;
  });
  private controls = new Map<number, { resolve: () => void; reject: (error: Error) => void }>();
  private nextControl = 0;
  private stopped = false;
  private disposed = false;
  private failure: Error;
  private finishing: Promise<any>;
  private startedAt = Date.now();
  private agent = new Agent({ keepAlive: true, maxSockets: 1, maxFreeSockets: 1 });
  private recorderSession: Session;
  private slot = Array.from({ length: 8 }, (_, index) => index).find(
    (slot) => ![...activeRecorders].some((recording) => recording.slot === slot)
  );

  static async start(options: RecordingOptions, preload: string) {
    if (activeRecorders.size >= 8) throw new Error("At most 8 website video recordings can run concurrently");
    if (![options.width, options.height].every((value) => Number.isInteger(value) && value > 0 && value <= 8192))
      throw new Error("WebProxy.InvalidRecordingDimensions");
    const recording = new WebVideoRecording(options, preload);
    try {
      await recording.initialize();
      return recording;
    } catch (error) {
      if (recording.id) await recording.request("", "DELETE").catch(() => undefined);
      recording.dispose();
      throw error;
    }
  }

  static hasActiveRecordings() {
    return activeRecorders.size > 0;
  }

  static async finishAll() {
    await Promise.allSettled([...activeRecorders].map((recording) => recording.finish()));
  }

  private constructor(
    private options: RecordingOptions,
    preload: string
  ) {
    // Reuse a bounded set of in-memory sessions; Electron retains partitions until exit.
    const recorderSession = (this.recorderSession = session.fromPartition(`web-recording:${this.slot}`, {
      cache: false
    }));
    this.window = new BrowserWindow({
      show: false,
      width: 16,
      height: 16,
      skipTaskbar: true,
      focusable: false,
      webPreferences: {
        preload,
        session: recorderSession,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        devTools: false,
        backgroundThrottling: false,
        additionalArguments: [`--web-recording-channel=${this.channel}`]
      }
    });
    this.window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    this.window.webContents.on("will-navigate", (event) => event.preventDefault());
    this.window.webContents.on("render-process-gone", () => this.fail(new Error("Website video encoder exited")));
    this.window.on("closed", () => {
      if (!this.disposed) this.fail(new Error("Website video encoder closed"));
    });
    recorderSession.setPermissionRequestHandler((contents, permission, callback, details) => {
      callback(
        contents === this.window.webContents &&
          permission === "media" &&
          "mediaTypes" in details &&
          details.mediaTypes?.every((type) => type === "video")
      );
    });
    recorderSession.setPermissionCheckHandler(
      (contents, permission, origin, details) =>
        contents === this.window.webContents &&
        permission === "media" &&
        origin === new URL(RECORDER_URL).origin &&
        details.mediaType === "video"
    );
    recorderSession.setDisplayMediaRequestHandler((_request, callback) => callback(null));
    ipcMain.handle(this.channel, async (event, command, data) => {
      if (event.sender !== this.window.webContents || event.senderFrame !== event.sender.mainFrame)
        throw new Error("Invalid website recorder sender");
      if (command === "bootstrap") {
        const scale = Math.min(1, 1920 / this.options.width, 1080 / this.options.height);
        return {
          sourceId: this.options.webContents.getMediaSourceId(this.window.webContents),
          width: Math.max(2, Math.floor((this.options.width * scale) / 2) * 2),
          height: Math.max(2, Math.floor((this.options.height * scale) / 2) * 2)
        };
      }
      if (command === "ready") {
        if (this.id || !["mp4", "webm"].includes(data?.format)) throw new Error("Invalid website video format");
        if (
          ![data.width, data.height].every((value) => Number.isInteger(value) && value > 0) ||
          data.width > 1920 ||
          data.height > 1080
        )
          throw new Error("Invalid website video dimensions");
        this.format = data.format;
        const result = await this.request("", "POST", {
          session_id: this.options.sessionId,
          target_url: this.options.targetUrl,
          width: data.width,
          height: data.height,
          format: this.format
        });
        if (typeof result.id !== "string" || !result.id) throw new Error("WebProxy.RecordingIdMissing");
        this.id = result.id;
        if (result.format !== this.format)
          throw new Error("Koko does not support website video recording; upgrade Koko");
        this.pauseReasons = new Set(this.options.getPauseReasons());
        this.startedAt = Date.now();
        return { paused: this.pauseReasons.size > 0 };
      }
      if (command === "started") {
        this.resolveInitialized();
        this.emitState("WebProxy.WebRecordingStarted");
        return;
      }
      if (command === "chunk") {
        if (
          !this.id ||
          !(data?.bytes instanceof Uint8Array) ||
          !data.bytes.length ||
          data.bytes.length > MAX_CHUNK_BYTES ||
          !Number.isSafeInteger(data.sequence) ||
          data.sequence < 0
        )
          throw new Error("Invalid website video chunk");
        let result;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            result = await this.request(
              `/chunks?sequence=${data.sequence}&resized=${data.resized === true ? 1 : 0}`,
              "POST",
              data.bytes
            );
            break;
          } catch (error) {
            if (attempt === 2 || (error.status && error.status < 500)) throw error;
            await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
          }
        }
        if (!Number.isSafeInteger(result?.chunk_count) || result.chunk_count !== data.sequence + 1)
          throw new Error("Invalid website video chunk response");
        this.frameCount = result.chunk_count;
        return;
      }
      if (command === "ack") {
        this.controls.get(data)?.resolve();
        return;
      }
      if (command === "error") {
        this.fail(new Error(typeof data === "string" ? data.slice(0, 1024) : "Website video recording failed"));
        return;
      }
      throw new Error("Unknown website recorder command");
    });
    activeRecorders.add(this);
  }

  private async initialize() {
    const timer = setTimeout(
      () => this.rejectInitialized(new Error("Website video encoder startup timed out")),
      30_000
    );
    try {
      await this.window.webContents.session.protocol.handle(
        "https",
        (request) =>
          new Response(request.url === RECORDER_URL ? "<!doctype html><html><body></body></html>" : "", {
            status: request.url === RECORDER_URL ? 200 : 403,
            headers: { "content-type": "text/html", "content-security-policy": "default-src 'none'; media-src blob:" }
          })
      );
      await Promise.all([this.window.loadURL(RECORDER_URL), this.initialized]);
    } finally {
      clearTimeout(timer);
    }
  }

  state(status: string, message: string, path = "") {
    return { label: this.options.label, status, frameCount: this.frameCount, message, path };
  }

  private emitState(message: string) {
    this.options.emit(this.state(this.pauseReasons.size ? "paused" : "recording", message));
  }

  setPaused(reason: string, paused: boolean, message: string) {
    if (this.stopped) return;
    const before = this.pauseReasons.size > 0;
    if (paused) this.pauseReasons.add(reason);
    else this.pauseReasons.delete(reason);
    if (before !== this.pauseReasons.size > 0) {
      const disabled = this.pauseReasons.size > 0;
      this.capturePending = this.capturePending.then(() => this.control("pause", disabled));
      void this.capturePending.catch((error) => this.fail(error));
    }
    this.emitState(message);
  }

  private control(command: string, paused = false) {
    return new Promise<void>((resolve, reject) => {
      if (this.window.isDestroyed()) return reject(new Error("Website video encoder closed"));
      if (this.failure) return reject(this.failure);
      const id = ++this.nextControl;
      const timer = setTimeout(
        () => {
          this.controls.delete(id);
          reject(new Error(`Website recorder ${command} timed out`));
        },
        command === "stop" ? 60_000 : 10_000
      );
      this.controls.set(id, {
        resolve: () => {
          clearTimeout(timer);
          this.controls.delete(id);
          resolve();
        },
        reject: (error) => {
          clearTimeout(timer);
          this.controls.delete(id);
          reject(error);
        }
      });
      this.window.webContents.send(this.channel, { id, command, paused });
    });
  }

  private fail(error: Error) {
    if (this.disposed || this.failure) return;
    this.failure = error;
    this.stopped = true;
    this.rejectInitialized(error);
    this.options.emit(this.state("error", String(error)));
    for (const control of this.controls.values()) control.reject(error);
    // A failed pause acknowledgement must stop native capture before autofill proceeds.
    if (!this.window.isDestroyed()) this.window.destroy();
  }

  private async request(suffix: string, method: string, data?: any, timeout = 15_000): Promise<any> {
    const body = data instanceof Uint8Array ? data : data === undefined ? undefined : JSON.stringify(data);
    const response = await requestWebProxyControl(
      this.options.proxyUrl,
      `${RECORDING_PATH}${this.id ? `/${encodeURIComponent(this.id)}` : ""}${suffix}`,
      {
        method,
        proxyAuth: this.options.proxyAuth,
        signal: AbortSignal.timeout(timeout),
        agent: this.agent,
        headers: { "content-type": data instanceof Uint8Array ? "application/octet-stream" : "application/json" },
        body
      }
    );
    if (!response.ok)
      throw Object.assign(new Error(`Website video recording: HTTP ${response.status}`), { status: response.status });
    return response.status === 204 ? null : response.json();
  }

  finish() {
    return (this.finishing ??= this.finishOnce());
  }

  private async finishOnce() {
    this.stopped = true;
    try {
      if (!this.id) return this.state("finished", "WebProxy.RecordingTooShort");
      await this.capturePending.catch(() => undefined);
      await this.control("stop").catch((error) => this.fail(error));
      this.options.emit(this.state("finishing", "WebProxy.PreparingWebRecording"));
      if (!this.frameCount) {
        await this.request("", "DELETE");
        return this.state("finished", "WebProxy.RecordingTooShort");
      }
      const result = await this.request(
        "/finish",
        "POST",
        { duration_ms: Math.min(Date.now() - this.startedAt, 86_400_000) },
        5 * 60_000
      );
      const state = this.failure
        ? this.state("error", String(this.failure))
        : this.state("finished", "WebProxy.WebRecordingFinished", result.path || "");
      this.options.emit(state);
      return state;
    } finally {
      this.dispose();
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.rejectInitialized(new Error("Website recorder disposed"));
    activeRecorders.delete(this);
    this.agent.destroy();
    ipcMain.removeHandler(this.channel);
    this.recorderSession.setPermissionRequestHandler(null);
    this.recorderSession.setPermissionCheckHandler(null);
    this.recorderSession.setDisplayMediaRequestHandler(null);
    this.recorderSession.protocol.unhandle("https");
    for (const control of this.controls.values()) control.reject(new Error("Website recorder disposed"));
    if (!this.window.isDestroyed()) this.window.destroy();
  }
}
