import { requestWebProxyControl } from "./control";

const RECORDING_PATH = "/_jumpserver/web-recordings";
const CAPTURE_INTERVAL_MS = 500;
const FORCE_FRAME_INTERVAL_MS = 5_000;
const PIXEL_CHANGE_THRESHOLD = 12;
const MIN_CHANGED_PIXEL_RATIO_PER_10_000 = 25;

async function fetchWithTimeout(proxyUrl, path, options, timeout = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await requestWebProxyControl(proxyUrl, path, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function responseJson(response, action) {
  if (!response.ok) {
    const detail = (await response.text()).trim();
    throw new Error(`${action}: ${detail || `HTTP ${response.status}`}`);
  }
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`${action}: ${error}`);
  }
}

function sessionUrl(endpoint, id, suffix = "") {
  const base = endpoint.pathname.endsWith("/") ? endpoint : new URL(`${endpoint.pathname}/`, endpoint);
  return new URL(`${encodeURIComponent(id)}/${suffix}`, base);
}

export function signaturesDiffer(previous, current) {
  if (!previous || previous.length !== current.length || current.length === 0) return true;
  let totalDifference = 0;
  let changedPixels = 0;
  for (let index = 0; index < current.length; index += 1) {
    const difference = Math.abs(previous[index] - current[index]);
    totalDifference += difference;
    if (difference >= PIXEL_CHANGE_THRESHOLD) changedPixels += 1;
  }
  return (
    totalDifference >= current.length && changedPixels * 10_000 >= current.length * MIN_CHANGED_PIXEL_RATIO_PER_10_000
  );
}

export class WebProxyRecording {
  // ponytail: migration keeps recording session state dynamic; replace with explicit frame/session types when strict mode is enabled.
  [key: string]: any;

  static async start({ label, targetUrl, proxyUrl, width, height, capture, emit }) {
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 1 ||
      height < 1 ||
      width > 8192 ||
      height > 8192
    ) {
      throw new Error("Web 录像尺寸无效");
    }
    const endpoint = new URL(RECORDING_PATH, proxyUrl);
    let response;
    try {
      response = await fetchWithTimeout(proxyUrl, endpoint.pathname, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ target_url: targetUrl, width, height })
      });
    } catch (error) {
      throw new Error(`启动 Koko Web 录像失败: ${error}`);
    }
    const started = await responseJson(response, "启动 Koko Web 录像失败");
    if (typeof started.id !== "string" || !started.id) throw new Error("Koko 返回的 Web 录像 ID 为空");

    const recording = new WebProxyRecording({ label, id: started.id, endpoint, proxyUrl, capture, emit });
    recording.emitState("recording", "Web 录像已开始");
    recording.timer = setInterval(() => void recording.capturePeriodic(), CAPTURE_INTERVAL_MS);
    return recording;
  }

  constructor({ label, id, endpoint, proxyUrl, capture, emit }) {
    this.label = label;
    this.id = id;
    this.endpoint = endpoint;
    this.proxyUrl = proxyUrl;
    this.capture = capture;
    this.emit = emit;
    this.startedAt = Date.now();
    this.frameCount = 0;
    this.pauseReasons = new Set();
    this.stopped = false;
    this.capturePending = null;
    this.lastSignature = null;
    this.lastUploadedAt = 0;
    this.timer = null;
  }

  state(status, message, path = "") {
    return { label: this.label, status, frameCount: this.frameCount, message, path };
  }

  emitState(status, message, path = "") {
    const state = this.state(status, message, path);
    this.emit(state);
    return state;
  }

  setPaused(reason, paused, message) {
    if (paused) this.pauseReasons.add(reason);
    else this.pauseReasons.delete(reason);
    if (!this.stopped) this.emitState(this.pauseReasons.size ? "paused" : "recording", message);
  }

  async capturePeriodic() {
    if (this.stopped || this.pauseReasons.size || this.capturePending) return;
    this.capturePending = this.captureOnce(false);
    try {
      await this.capturePending;
    } catch (error) {
      this.stopped = true;
      clearInterval(this.timer);
      this.emitState("error", String(error));
    } finally {
      this.capturePending = null;
    }
  }

  async captureOnce(force) {
    const { jpeg, signature } = await this.capture();
    if (jpeg.length > 2 << 20) throw new Error("Web 录像截图超过 2 MiB");
    const capturedAt = Date.now();
    if (
      !force &&
      this.lastSignature &&
      capturedAt - this.lastUploadedAt < FORCE_FRAME_INTERVAL_MS &&
      !signaturesDiffer(this.lastSignature, signature)
    ) {
      return;
    }
    const timestamp = Math.min(Date.now() - this.startedAt, 86_400_000);
    let response;
    try {
      const frameUrl = sessionUrl(this.endpoint, this.id, `frames?timestamp_ms=${timestamp}`);
      response = await fetchWithTimeout(this.proxyUrl, `${frameUrl.pathname}${frameUrl.search}`, {
        method: "POST",
        headers: { "content-type": "image/jpeg" },
        body: jpeg
      });
    } catch (error) {
      throw new Error(`上传 Web 录像帧失败: ${error}`);
    }
    const frame = await responseJson(response, "上传 Web 录像帧失败");
    if (!Number.isInteger(frame.frame_count) || frame.frame_count < 0) throw new Error("解析 Web 录像帧响应失败");
    this.frameCount = frame.frame_count;
    this.lastSignature = signature;
    this.lastUploadedAt = capturedAt;
    if (!this.stopped) this.emitState("recording", "正在录制 Website");
  }

  async finish() {
    if (this.stopped && !this.timer) return null;
    this.stopped = true;
    clearInterval(this.timer);
    this.timer = null;
    this.emitState("finishing", "正在生成 Web 录像");
    if (this.capturePending) await this.capturePending.catch(() => undefined);
    if (!this.pauseReasons.size) {
      try {
        await this.captureOnce(true);
      } catch (error) {
        console.warn(`[electron] final Web recording frame failed for ${this.label}:`, error);
      }
    }

    if (this.frameCount === 0) {
      const cancelUrl = sessionUrl(this.endpoint, this.id);
      await fetchWithTimeout(this.proxyUrl, cancelUrl.pathname, { method: "DELETE" }).catch(() => undefined);
      return this.emitState("finished", "录像时间过短，未生成文件");
    }

    const duration = Math.min(Date.now() - this.startedAt, 86_400_000);
    let response;
    try {
      const finishUrl = sessionUrl(this.endpoint, this.id, "finish");
      response = await fetchWithTimeout(
        this.proxyUrl,
        finishUrl.pathname,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ duration_ms: duration })
        },
        120_000
      );
    } catch (error) {
      throw new Error(`结束 Koko Web 录像失败: ${error}`);
    }
    const finished = await responseJson(response, "结束 Koko Web 录像失败");
    if (Number.isInteger(finished.frame_count)) this.frameCount = finished.frame_count;
    return this.emitState("finished", "Web 录像已生成", String(finished.path || ""));
  }

  dispose() {
    this.stopped = true;
    clearInterval(this.timer);
    this.timer = null;
  }
}
