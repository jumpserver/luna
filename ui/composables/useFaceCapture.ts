import type { FaceCameraDevice, FaceFrameResult, FaceRecognitionResult, FaceSessionStart } from "~/types/face";
import { desktopFace } from "~/shared/desktop/bridge";

const FRAME_INTERVAL_MS = 300;
const CAPTURE_WIDTH = 480;

export function useFaceCapture() {
  const video = shallowRef<HTMLVideoElement | null>(null);
  const overlay = ref<HTMLCanvasElement | null>(null);
  const cameras = ref<FaceCameraDevice[]>([]);
  const selectedDeviceId = ref("");
  const running = ref(false);
  const starting = ref(false);
  const latest = shallowRef<FaceFrameResult | null>(null);
  const error = ref("");
  const sessionId = ref("");
  let stream: MediaStream | null = null;
  let captureCanvas: HTMLCanvasElement | null = null;
  let frameTimer: ReturnType<typeof setTimeout> | null = null;
  let frameBusy = false;
  let activeDebug = false;

  const selectedCamera = computed(() => cameras.value.find((item) => item.deviceId === selectedDeviceId.value));

  async function refreshCameras(requestPermission = false) {
    if (!navigator.mediaDevices?.enumerateDevices) {
      throw new Error("Camera enumeration is unavailable");
    }
    let permissionStream: MediaStream | null = null;
    if (requestPermission) {
      permissionStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
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
    } finally {
      permissionStream?.getTracks().forEach((track) => track.stop());
    }
    return cameras.value;
  }

  async function openCamera() {
    closeCamera();
    const constraints: MediaStreamConstraints = {
      audio: false,
      video: selectedDeviceId.value
        ? { deviceId: { exact: selectedDeviceId.value }, width: { ideal: 640 }, height: { ideal: 480 } }
        : { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }
    };
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    if (!video.value) throw new Error("Camera preview is unavailable");
    video.value.srcObject = stream;
    await video.value.play();
    await refreshCameras(false);
  }

  async function start(request: Omit<FaceSessionStart, "camera">) {
    if (!isDesktopRuntime()) throw new Error("Native face recognition is only available in the desktop client");
    await stop();
    starting.value = true;
    error.value = "";
    latest.value = null;
    activeDebug = request.debug;
    try {
      await openCamera();
      const track = stream?.getVideoTracks()[0];
      const settings = track?.getSettings();
      const camera = cameras.value.find((item) => item.deviceId === settings?.deviceId) ||
        selectedCamera.value || {
          deviceId: String(settings?.deviceId || selectedDeviceId.value),
          groupId: String(settings?.groupId || ""),
          label: track?.label || "Camera"
        };
      const session = await desktopFace.startSession({ ...request, camera });
      sessionId.value = session.session_id;
      running.value = true;
      scheduleFrame(0);
      return session;
    } catch (cause) {
      closeCamera();
      error.value = cause instanceof Error ? cause.message : String(cause);
      throw cause;
    } finally {
      starting.value = false;
    }
  }

  async function stop() {
    running.value = false;
    if (frameTimer) clearTimeout(frameTimer);
    frameTimer = null;
    const currentSession = sessionId.value;
    sessionId.value = "";
    closeCamera();
    clearOverlay();
    if (currentSession && isDesktopRuntime()) {
      await desktopFace.stopSession(currentSession).catch(() => null);
    }
  }

  function closeCamera() {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    if (video.value) video.value.srcObject = null;
  }

  function scheduleFrame(delay = FRAME_INTERVAL_MS) {
    if (!running.value) return;
    frameTimer = setTimeout(() => void processFrame(), delay);
  }

  async function processFrame() {
    if (!running.value || frameBusy || !sessionId.value || !video.value || video.value.readyState < 2) {
      scheduleFrame();
      return;
    }
    frameBusy = true;
    try {
      captureCanvas ||= document.createElement("canvas");
      const sourceWidth = video.value.videoWidth || 640;
      const sourceHeight = video.value.videoHeight || 480;
      const height = Math.max(1, Math.round((sourceHeight / sourceWidth) * CAPTURE_WIDTH));
      captureCanvas.width = CAPTURE_WIDTH;
      captureCanvas.height = height;
      captureCanvas.getContext("2d")?.drawImage(video.value, 0, 0, CAPTURE_WIDTH, height);
      const image = captureCanvas.toDataURL("image/jpeg", 0.78);
      const result = await desktopFace.processFrame(sessionId.value, image);
      latest.value = result;
      drawOverlay(result.faces, result.frame.width, result.frame.height);
      if (result.flow.finished) {
        running.value = false;
        frameTimer = setTimeout(() => void stop(), 700);
        return;
      }
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
      running.value = false;
      await stop();
      return;
    } finally {
      frameBusy = false;
    }
    scheduleFrame();
  }

  function drawOverlay(faces: FaceRecognitionResult[], width: number, height: number) {
    const canvas = overlay.value;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, width, height);
    if (!activeDebug) return;
    context.lineWidth = 2;
    context.font = "13px system-ui";
    for (const face of faces) {
      const [x1, y1, x2, y2] = face.bbox;
      const accepted = face.is_match && (face.liveness?.is_live ?? true);
      context.strokeStyle = accepted ? "#22c55e" : "#ef4444";
      context.fillStyle = context.strokeStyle;
      context.strokeRect(x1, y1, x2 - x1, y2 - y1);
      const label = `${face.name} ${(face.similarity * 100).toFixed(1)}%`;
      context.fillText(label, x1, Math.max(14, y1 - 6));
      for (const point of face.landmarks || []) {
        context.beginPath();
        context.arc(point[0], point[1], 1.5, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  function clearOverlay() {
    const canvas = overlay.value;
    const context = canvas?.getContext("2d");
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
  }

  onBeforeUnmount(() => {
    void stop();
  });

  return {
    cameras,
    error,
    latest,
    overlay,
    refreshCameras,
    running,
    selectedCamera,
    selectedDeviceId,
    sessionId,
    start,
    starting,
    stop,
    video
  };
}
