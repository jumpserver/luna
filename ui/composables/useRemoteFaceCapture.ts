import type {
  FaceCameraDevice,
  FaceLiveFrameMessage,
  FaceLiveHostMessage,
  FaceLivePageMode,
  FaceLiveServerFlow
} from "~/types/face";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { buildFaceLiveWebSocketUrl, FACE_LIVE_MESSAGE_SOURCE, isFaceCaptureToken } from "~/utils/faceLive";

const CAPTURE_WIDTH = 480;
const DEFAULT_FRAME_INTERVAL_MS = 250;
const MIN_FRAME_INTERVAL_MS = 120;
const SOCKET_CONNECT_TIMEOUT_MS = 10_000;
const SERVER_READY_TIMEOUT_MS = 10_000;
const CAMERA_OPEN_TIMEOUT_MS = 20_000;

export type FaceLiveClientState = "idle" | "preparing" | "connecting" | "active" | "warning" | "success" | "error";

export type FaceLiveClientError =
  | ""
  | "browser_unsupported"
  | "camera_denied"
  | "camera_not_found"
  | "camera_failed"
  | "connection_failed"
  | "connection_closed"
  | "invalid_token"
  | "server_error";

interface UseRemoteFaceCaptureOptions {
  mode: MaybeRefOrGetter<FaceLivePageMode>;
  token: MaybeRefOrGetter<string>;
  siteUrl?: MaybeRefOrGetter<string>;
  onEvent?: (message: FaceLiveHostMessage) => void;
}

type FaceLiveSocketMessage =
  | { type: "ready"; mode: "enroll" | "auth" | "monitor"; debug?: boolean; frame_interval_ms?: number }
  | { type: "throttled" }
  | { type: "error"; fatal?: boolean; message?: string }
  | FaceLiveFrameMessage;

export function useRemoteFaceCapture(options: UseRemoteFaceCaptureOptions) {
  const runtimeConfig = useRuntimeConfig();
  const userInfoStore = useUserInfoStore();
  const video = shallowRef<HTMLVideoElement | null>(null);
  const overlay = ref<HTMLCanvasElement | null>(null);
  const cameras = ref<FaceCameraDevice[]>([]);
  const selectedDeviceId = ref("");
  const clientState = ref<FaceLiveClientState>("idle");
  const errorCode = ref<FaceLiveClientError>("");
  const errorMessage = ref("");
  const running = ref(false);
  const starting = ref(false);
  const retryable = ref(false);
  const debug = ref(false);
  const serverMode = ref<"enroll" | "auth" | "monitor" | "">("");
  const latest = shallowRef<FaceLiveFrameMessage | null>(null);
  let stream: MediaStream | null = null;
  let socket: WebSocket | null = null;
  let captureCanvas: HTMLCanvasElement | null = null;
  let frameTimer: ReturnType<typeof setTimeout> | null = null;
  let connectTimer: ReturnType<typeof setTimeout> | null = null;
  let readyTimer: ReturnType<typeof setTimeout> | null = null;
  let framePending = false;
  let frameInterval = DEFAULT_FRAME_INTERVAL_MS;
  let generation = 0;
  let completed = false;

  const selectedCamera = computed(() => cameras.value.find((item) => item.deviceId === selectedDeviceId.value));

  function currentMode() {
    return toValue(options.mode);
  }

  function emitEvent(event: string, flow?: FaceLiveServerFlow, extra: Record<string, unknown> = {}) {
    options.onEvent?.({
      source: FACE_LIVE_MESSAGE_SOURCE,
      event,
      mode: currentMode(),
      ...(flow ? { flow } : {}),
      ...extra
    });
  }

  function serviceLocation() {
    const embeddedSite = options.siteUrl ? toValue(options.siteUrl).trim() : "";
    if (embeddedSite && window.parent !== window) {
      try {
        if (window.parent.location.origin !== window.location.origin) throw new Error();
        const site = new URL(embeddedSite);
        if (!["http:", "https:"].includes(site.protocol) || site.username || site.password) throw new Error();
        return { siteUrl: site.href, rendererPath: site.pathname };
      } catch {
        throw new Error("Face capture site is unavailable");
      }
    }
    if (!isDesktopRuntime()) {
      return {
        siteUrl: window.location.origin,
        rendererPath: window.location.pathname,
        socketBaseUrl: String(runtimeConfig.public.faceLiveSocketBaseUrl || "")
      };
    }
    if (!userInfoStore.currentSite) throw new Error("Current JumpServer site is unavailable");
    return { siteUrl: userInfoStore.currentSite, rendererPath: new URL(userInfoStore.currentSite).pathname };
  }

  function clearFrameTimer() {
    if (frameTimer) clearTimeout(frameTimer);
    frameTimer = null;
  }

  function clearReadyTimer() {
    if (readyTimer) clearTimeout(readyTimer);
    readyTimer = null;
  }

  function clearConnectTimer() {
    if (connectTimer) clearTimeout(connectTimer);
    connectTimer = null;
  }

  function stopCamera() {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    if (video.value) video.value.srcObject = null;
  }

  function closeSocket() {
    const target = socket;
    socket = null;
    if (target && target.readyState !== WebSocket.CLOSED && target.readyState !== WebSocket.CLOSING) {
      target.close(1000);
    }
  }

  function clearOverlay() {
    const canvas = overlay.value;
    const context = canvas?.getContext("2d");
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
  }

  function stopTransport() {
    generation += 1;
    running.value = false;
    framePending = false;
    clearFrameTimer();
    clearConnectTimer();
    clearReadyTimer();
    closeSocket();
    stopCamera();
  }

  function waitForPageReady() {
    return new Promise<void>((resolve) => {
      const schedule = () => {
        if (typeof window.requestIdleCallback === "function") {
          window.requestIdleCallback(() => resolve(), { timeout: 1_000 });
          return;
        }
        setTimeout(resolve, 0);
      };

      if (document.readyState === "complete") schedule();
      else window.addEventListener("load", schedule, { once: true });
    });
  }

  function fail(code: FaceLiveClientError, message = "") {
    stopTransport();
    starting.value = false;
    clientState.value = "error";
    errorCode.value = code;
    errorMessage.value = message;
    retryable.value = true;
    emitEvent("client_error", latest.value?.flow, { code, message });
  }

  function cameraError(error: unknown): FaceLiveClientError {
    const name = error instanceof DOMException ? error.name : "";
    if (["NotAllowedError", "SecurityError"].includes(name)) return "camera_denied";
    if (["NotFoundError", "DevicesNotFoundError", "OverconstrainedError"].includes(name)) return "camera_not_found";
    return "camera_failed";
  }

  async function refreshCameras(requestPermission = false) {
    if (!navigator.mediaDevices?.enumerateDevices || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera access is unavailable");
    }
    let permissionStream: MediaStream | null = null;
    if (requestPermission) permissionStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      cameras.value = devices
        .filter((device) => device.kind === "videoinput")
        .map((device, index) => ({
          deviceId: device.deviceId,
          groupId: device.groupId,
          label: device.label || `Camera ${index + 1}`
        }));
      if (!cameras.value.some((item) => item.deviceId === selectedDeviceId.value)) {
        selectedDeviceId.value = cameras.value[0]?.deviceId || "";
      }
      return cameras.value;
    } finally {
      permissionStream?.getTracks().forEach((track) => track.stop());
    }
  }

  async function openCamera(deviceId = "", run = generation) {
    stopCamera();
    const constraints: MediaStreamConstraints = {
      audio: false,
      video: deviceId
        ? { deviceId: { exact: deviceId }, width: { ideal: 640 }, height: { ideal: 480 } }
        : { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }
    };
    const pendingStream = navigator.mediaDevices.getUserMedia(constraints);
    let cameraTimer: ReturnType<typeof setTimeout> | undefined;
    let nextStream: MediaStream;
    try {
      nextStream = await Promise.race([
        pendingStream,
        new Promise<never>((_, reject) => {
          cameraTimer = setTimeout(() => reject(new Error("Timed out opening the camera")), CAMERA_OPEN_TIMEOUT_MS);
        })
      ]);
    } catch (error) {
      void pendingStream.then(
        (lateStream) => lateStream.getTracks().forEach((track) => track.stop()),
        () => {}
      );
      throw error;
    } finally {
      if (cameraTimer) clearTimeout(cameraTimer);
    }
    if (run !== generation) {
      nextStream.getTracks().forEach((track) => track.stop());
      return;
    }
    stream = nextStream;
    if (!video.value) throw new Error("Camera preview is unavailable");
    video.value.srcObject = stream;
    await video.value.play();
    await refreshCameras(false);
    const settings = stream.getVideoTracks()[0]?.getSettings();
    if (settings?.deviceId) selectedDeviceId.value = settings.deviceId;
  }

  function scheduleFrame(delay = frameInterval) {
    clearFrameTimer();
    if (running.value && !completed) frameTimer = setTimeout(sendFrame, delay);
  }

  function sendFrame() {
    const target = socket;
    const camera = video.value;
    if (
      framePending ||
      !stream ||
      !target ||
      target.readyState !== WebSocket.OPEN ||
      !camera ||
      camera.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      scheduleFrame();
      return;
    }
    const sourceWidth = camera.videoWidth || 640;
    const sourceHeight = camera.videoHeight || 480;
    const height = Math.max(240, Math.round((sourceHeight / sourceWidth) * CAPTURE_WIDTH));
    captureCanvas ||= document.createElement("canvas");
    captureCanvas.width = CAPTURE_WIDTH;
    captureCanvas.height = height;
    const context = captureCanvas.getContext("2d");
    if (!context) {
      fail("camera_failed", "Camera frame encoding is unavailable");
      return;
    }
    context.drawImage(camera, 0, 0, CAPTURE_WIDTH, height);
    framePending = true;
    target.send(JSON.stringify({ type: "frame", image: captureCanvas.toDataURL("image/jpeg", 0.8) }));
  }

  function drawOverlay(message: FaceLiveFrameMessage) {
    const canvas = overlay.value;
    const frame = message.frame;
    const context = canvas?.getContext("2d");
    if (!canvas || !frame || !context) return;
    canvas.width = frame.width;
    canvas.height = frame.height;
    context.clearRect(0, 0, frame.width, frame.height);
    if (!debug.value) return;
    context.lineWidth = 2;
    context.font = "13px system-ui";
    for (const face of message.faces) {
      const [x1, y1, x2, y2] = face.bbox;
      const accepted = face.is_match && (face.liveness?.is_live ?? true);
      context.strokeStyle = accepted ? "#22c55e" : "#ef4444";
      context.fillStyle = context.strokeStyle;
      context.strokeRect(x1, y1, x2 - x1, y2 - y1);
      context.fillText(`${face.name} ${(face.similarity * 100).toFixed(1)}%`, x1, Math.max(15, y1 - 6));
      for (const point of face.landmarks || []) {
        context.beginPath();
        context.arc(point[0], point[1], 1.5, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  function handleFlow(message: FaceLiveFrameMessage, run: number) {
    if (run !== generation) return;
    framePending = false;
    latest.value = message;
    serverMode.value = message.flow.mode;
    drawOverlay(message);

    const events = message.flow.events || [];
    for (const event of events) emitEvent(event.event, message.flow, { ...event });

    if (message.flow.finished) {
      completed = true;
      running.value = false;
      retryable.value = !["auth_success", "enrollment_complete"].includes(message.flow.status);
      clientState.value = retryable.value ? "error" : "success";
      if (!events.some((event) => event.event === message.flow.status)) emitEvent(message.flow.status, message.flow);
      clearFrameTimer();
      setTimeout(() => {
        if (run !== generation) return;
        closeSocket();
        stopCamera();
      }, 500);
      return;
    }

    if (message.flow.status === "monitor_away_warning") clientState.value = "warning";
    else if (message.flow.status === "monitor_paused") clientState.value = "error";
    else clientState.value = "active";
    scheduleFrame();
  }

  function handleSocketMessage(event: MessageEvent, run: number) {
    if (run !== generation) return;
    let message: FaceLiveSocketMessage;
    try {
      message = JSON.parse(String(event.data)) as FaceLiveSocketMessage;
    } catch (error) {
      fail("server_error", error instanceof Error ? error.message : String(error));
      return;
    }

    if (message.type === "ready") {
      clearReadyTimer();
      debug.value = Boolean(message.debug);
      serverMode.value = message.mode;
      frameInterval = Math.max(MIN_FRAME_INTERVAL_MS, Number(message.frame_interval_ms || DEFAULT_FRAME_INTERVAL_MS));
      running.value = true;
      clientState.value = "active";
      scheduleFrame(0);
      return;
    }
    if (message.type === "throttled") {
      framePending = false;
      scheduleFrame();
      return;
    }
    if (message.type === "error") {
      framePending = false;
      if (message.fatal) fail("server_error", String(message.message || ""));
      else {
        errorMessage.value = String(message.message || "");
        scheduleFrame();
      }
      return;
    }
    if (message.type === "frame_result") handleFlow(message, run);
  }

  function connectSocket(run: number) {
    return new Promise<void>((resolve, reject) => {
      const location = serviceLocation();
      const target = new WebSocket(
        buildFaceLiveWebSocketUrl({
          ...location,
          token: toValue(options.token).trim(),
          mode: currentMode()
        })
      );
      socket = target;
      let opened = false;
      let settled = false;
      const rejectOnce = (error: Error) => {
        if (settled) return;
        settled = true;
        clearConnectTimer();
        reject(error);
      };
      connectTimer = setTimeout(() => {
        rejectOnce(new Error("Timed out connecting to the face recognition service"));
      }, SOCKET_CONNECT_TIMEOUT_MS);
      target.onopen = () => {
        if (run !== generation) return;
        opened = true;
        settled = true;
        clearConnectTimer();
        clearReadyTimer();
        readyTimer = setTimeout(() => {
          if (run === generation && clientState.value === "connecting") {
            fail("connection_failed", "Timed out waiting for the face recognition service");
          }
        }, SERVER_READY_TIMEOUT_MS);
        resolve();
      };
      target.onmessage = (event) => handleSocketMessage(event, run);
      target.onerror = () => rejectOnce(new Error("Unable to connect to face recognition"));
      target.onclose = (event) => {
        if (run !== generation || completed) return;
        if (!opened) {
          rejectOnce(new Error(event.code === 4403 ? "Face capture token is invalid or expired" : "Connection closed"));
          return;
        }
        fail(event.code === 4403 ? "invalid_token" : "connection_closed");
      };
    });
  }

  async function start() {
    stopTransport();
    const run = generation;
    completed = false;
    latest.value = null;
    clearOverlay();
    clientState.value = "preparing";
    errorCode.value = "";
    errorMessage.value = "";
    retryable.value = false;
    debug.value = false;
    serverMode.value = "";

    const token = toValue(options.token).trim();
    if (!isFaceCaptureToken(token)) {
      fail("invalid_token");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !navigator.mediaDevices?.enumerateDevices) {
      fail("browser_unsupported");
      return;
    }

    starting.value = true;
    let cameraOpened = false;
    try {
      await waitForPageReady();
      if (run !== generation) return;
      await openCamera(selectedDeviceId.value, run);
      if (run !== generation) return;
      cameraOpened = true;
      clientState.value = "connecting";
      await connectSocket(run);
    } catch (error) {
      if (run !== generation) return;
      fail(
        cameraOpened ? "connection_failed" : cameraError(error),
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      if (run === generation) starting.value = false;
    }
  }

  async function switchCamera() {
    if (!running.value) return;
    const run = generation;
    try {
      await openCamera(selectedDeviceId.value, run);
    } catch (error) {
      if (run === generation) fail(cameraError(error), error instanceof Error ? error.message : String(error));
    }
  }

  function stop() {
    stopTransport();
    starting.value = false;
    clientState.value = "idle";
  }

  onBeforeUnmount(stopTransport);

  return {
    cameras,
    clientState,
    debug,
    errorCode,
    errorMessage,
    latest,
    overlay,
    refreshCameras,
    retryable,
    running,
    selectedCamera,
    selectedDeviceId,
    serverMode,
    start,
    starting,
    stop,
    switchCamera,
    video
  };
}
