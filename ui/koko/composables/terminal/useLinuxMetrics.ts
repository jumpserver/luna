import { buildJSONEnvelope, ENVELOPE_TERMINAL_COMMAND } from "#koko/composables/terminal/envelope";

const METRICS_SUBSCRIBE = "TERMINAL_METRICS_SUBSCRIBE";
const METRICS_UNSUBSCRIBE = "TERMINAL_METRICS_UNSUBSCRIBE";
const LATENCY_PING = "TERMINAL_LATENCY_PING";
export const METRICS_UPDATE = "TERMINAL_METRICS_UPDATE";
export const METRICS_STATUS = "TERMINAL_METRICS_STATUS";
export const LATENCY_PONG = "TERMINAL_LATENCY_PONG";
const HISTORY_LIMIT = 60;
const ASSET_CACHE_LIMIT = 32;
const ASSET_CACHE_TTL = 2 * 60 * 1000;

export interface KokoLinuxMetricsSample {
  timestamp: number;
  hostname?: string;
  kernel?: string;
  architecture?: string;
  cpuCores?: number;
  uptimeSeconds: number;
  cpuPercent: number;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  memoryPercent: number;
  swapUsedBytes: number;
  swapTotalBytes: number;
  diskUsedBytes: number;
  diskTotalBytes: number;
  diskPercent: number;
  diskReadBytesPerSecond: number;
  diskWriteBytesPerSecond: number;
  networkRxBytesPerSecond: number;
  networkTxBytesPerSecond: number;
}

export interface KokoLinuxMetricsState {
  status: "idle" | "loading" | "collecting" | "unavailable";
  message: string;
  latest: KokoLinuxMetricsSample | null;
  history: KokoLinuxMetricsSample[];
  latencyMs: number | null;
  cached: boolean;
}

interface MetricsSession {
  socket: WebSocket;
  terminalId: string;
}

interface AssetMetricsCache {
  expiresAt: number;
  latest: KokoLinuxMetricsSample;
  history: KokoLinuxMetricsSample[];
}

const sessions = new Map<string, MetricsSession>();
const requested = new Set<string>();
const tabAssetIds = new Map<string, string>();
const assetCache = new Map<string, AssetMetricsCache>();
const responseTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const latencyIntervals = new Map<string, ReturnType<typeof setInterval>>();
const states = shallowReactive(new Map<string, KokoLinuxMetricsState>());

function emptyState(status: KokoLinuxMetricsState["status"] = "idle"): KokoLinuxMetricsState {
  return { status, message: "", latest: null, history: [], latencyMs: null, cached: false };
}

function send(session: MetricsSession, command: string, data = "") {
  if (session.socket.readyState !== WebSocket.OPEN) return false;
  session.socket.send(
    buildJSONEnvelope(ENVELOPE_TERMINAL_COMMAND, {
      terminalId: Number(session.terminalId),
      command,
      params: { data }
    })
  );
  return true;
}

function readAssetCache(assetId: string) {
  const cached = assetCache.get(assetId);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    assetCache.delete(assetId);
    return null;
  }
  assetCache.delete(assetId);
  assetCache.set(assetId, cached);
  return cached;
}

function writeAssetCache(tabId: string, state: KokoLinuxMetricsState) {
  const assetId = tabAssetIds.get(tabId);
  if (!assetId || !state.latest) return;
  assetCache.delete(assetId);
  assetCache.set(assetId, {
    expiresAt: Date.now() + ASSET_CACHE_TTL,
    latest: state.latest,
    history: state.history
  });
  while (assetCache.size > ASSET_CACHE_LIMIT) {
    const oldest = assetCache.keys().next().value;
    if (!oldest) break;
    assetCache.delete(oldest);
  }
}

function clearResponseTimeout(tabId: string) {
  const timeout = responseTimeouts.get(tabId);
  if (timeout) clearTimeout(timeout);
  responseTimeouts.delete(tabId);
}

function waitForResponse(tabId: string) {
  clearResponseTimeout(tabId);
  responseTimeouts.set(
    tabId,
    setTimeout(() => {
      const current = states.get(tabId) || emptyState();
      states.set(tabId, { ...current, status: "unavailable", message: "" });
      responseTimeouts.delete(tabId);
    }, 8000)
  );
}

function sendLatencyProbe(tabId: string) {
  const session = sessions.get(tabId);
  if (session) send(session, LATENCY_PING, JSON.stringify({ sentAt: Date.now() }));
}

function startLatencyProbe(tabId: string) {
  if (!requested.has(tabId) || latencyIntervals.has(tabId) || !sessions.has(tabId)) return;
  sendLatencyProbe(tabId);
  latencyIntervals.set(tabId, setInterval(sendLatencyProbe, 5000, tabId));
}

function stopLatencyProbe(tabId: string) {
  const interval = latencyIntervals.get(tabId);
  if (interval) clearInterval(interval);
  latencyIntervals.delete(tabId);
}

export function registerKokoLinuxMetricsSession(tabId: string, session: MetricsSession) {
  if (!tabId) return;
  sessions.set(tabId, session);
  if (requested.has(tabId) && send(session, METRICS_SUBSCRIBE, JSON.stringify({ intervalSeconds: 2 }))) {
    waitForResponse(tabId);
  }
}

export function unregisterKokoLinuxMetricsSession(tabId: string, socket?: WebSocket | null) {
  const session = sessions.get(tabId);
  if (!session || (socket && session.socket !== socket)) return;
  sessions.delete(tabId);
  requested.delete(tabId);
  tabAssetIds.delete(tabId);
  clearResponseTimeout(tabId);
  stopLatencyProbe(tabId);
  states.delete(tabId);
}

export function subscribeKokoLinuxMetrics(tabId: string, assetId = "") {
  if (!tabId) return;
  requested.add(tabId);
  if (assetId) tabAssetIds.set(tabId, assetId);
  const current = states.get(tabId);
  const cached = !current?.latest && assetId ? readAssetCache(assetId) : null;
  states.set(tabId, {
    ...(current || emptyState()),
    status: "loading",
    message: "",
    latest: current?.latest || cached?.latest || null,
    history: current?.history.length ? current.history : cached?.history || [],
    latencyMs: null,
    cached: Boolean(current?.latest || cached)
  });
  const session = sessions.get(tabId);
  if (session && send(session, METRICS_SUBSCRIBE, JSON.stringify({ intervalSeconds: 2 }))) waitForResponse(tabId);
}

export function unsubscribeKokoLinuxMetrics(tabId: string) {
  if (!tabId) return;
  requested.delete(tabId);
  clearResponseTimeout(tabId);
  stopLatencyProbe(tabId);
  const session = sessions.get(tabId);
  if (session) send(session, METRICS_UNSUBSCRIBE);
}

export function getKokoLinuxMetrics(tabId: string) {
  return states.get(tabId) || null;
}

export function handleKokoLinuxMetricsUpdate(tabId: string, data?: string) {
  if (!tabId || !data) return;
  try {
    const sample = JSON.parse(data) as KokoLinuxMetricsSample;
    if (!Number.isFinite(sample.timestamp) || !Number.isFinite(sample.cpuPercent)) return;
    clearResponseTimeout(tabId);
    startLatencyProbe(tabId);
    const current = states.get(tabId) || emptyState();
    const next = {
      ...current,
      status: "collecting" as const,
      message: "",
      latest: sample,
      history: [...current.history, sample].slice(-HISTORY_LIMIT),
      cached: false
    };
    states.set(tabId, next);
    writeAssetCache(tabId, next);
  } catch {
    // Optional telemetry must never interrupt the terminal session.
  }
}

export function handleKokoLinuxMetricsStatus(tabId: string, data?: string) {
  if (!tabId || !data) return;
  try {
    const payload = JSON.parse(data) as { status?: string; message?: string };
    clearResponseTimeout(tabId);
    startLatencyProbe(tabId);
    const current = states.get(tabId) || emptyState();
    states.set(tabId, {
      ...current,
      status: payload.status === "collecting" ? "collecting" : "unavailable",
      message: payload.message || ""
    });
  } catch {
    // Optional telemetry must never interrupt the terminal session.
  }
}

export function handleKokoLatencyPong(tabId: string, data?: string) {
  if (!tabId || !data) return;
  try {
    const payload = JSON.parse(data) as { sentAt?: number };
    const elapsed = Date.now() - Number(payload.sentAt);
    if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > 60_000) return;
    const current = states.get(tabId) || emptyState();
    states.set(tabId, { ...current, latencyMs: Math.round(elapsed) });
  } catch {
    // Optional telemetry must never interrupt the terminal session.
  }
}
