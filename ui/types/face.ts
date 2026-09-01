export type FaceDeviceMode = "auto" | "cpu" | "gpu";
export type FaceLivenessMode = "off" | "motion" | "onnx" | "hybrid";
export type FaceFlowMode = "enroll" | "auth" | "monitor";
export type FaceActionType = "none" | "redirect" | "api" | "method";

export interface FaceEngineConfig {
  device: FaceDeviceMode;
  providers?: string[];
  model_name: string;
  model_root?: string | null;
  recognition: {
    threshold: number;
    det_size: [number, number];
    max_faces: number;
  };
  liveness: {
    mode: FaceLivenessMode;
    threshold: number;
    onnx_model_path?: string | null;
    min_motion_score: number;
    min_face_size: number;
  };
  debug: {
    enabled: boolean;
    draw_bbox: boolean;
    draw_landmarks: boolean;
    draw_liveness: boolean;
  };
}

export interface FaceEngineStatus {
  available: boolean;
  running: boolean;
  runtime?: "python" | "bundle";
  executable?: string;
  setupCommand?: string;
  error?: string;
  engine_initialized?: boolean;
  accelerated?: boolean;
  device?: FaceDeviceMode;
  providers?: string[];
  available_providers?: string[];
  model_name?: string;
  opencv?: string;
  insightface?: string;
  onnxruntime?: string;
  active_sessions?: number;
}

export interface FacePerson {
  person_id: string;
  name: string;
  samples: number;
}

export interface FaceCameraDevice {
  deviceId: string;
  groupId: string;
  label: string;
}

export interface FaceCameraPolicy {
  mode: "any" | "allowlist";
  allowedDeviceIds?: string[];
  allowedLabels?: string[];
  labelPattern?: string;
}

export interface FaceFlowAction {
  type: FaceActionType;
  url?: string;
  method?: string;
}

export interface FaceSessionStart {
  mode: FaceFlowMode;
  camera: FaceCameraDevice;
  cameraPolicy: FaceCameraPolicy;
  debug: boolean;
  actions?: Record<string, FaceFlowAction>;
  name?: string;
  personId?: string;
  requiredSamples?: number;
  targetId?: string;
  targetName?: string;
  timeoutSeconds: number;
  awayAfterSeconds?: number;
  threshold?: number;
}

export interface FaceSessionStarted {
  session_id: string;
  mode: FaceFlowMode;
  phase: string;
  camera: {
    device: FaceCameraDevice;
    matchedBy: string;
    policy: FaceCameraPolicy & { managed?: boolean };
  };
}

export interface FaceRecognitionResult {
  name: string;
  person_id: string | null;
  is_match: boolean;
  similarity: number;
  reason: string;
  bbox: [number, number, number, number];
  detection_score: number;
  pose: [number, number, number] | null;
  landmarks?: [number, number][];
  liveness: {
    is_live: boolean;
    score: number;
    reason: string;
  } | null;
}

export interface FaceChallengeState {
  type: "shake_head" | "nod_head" | "open_mouth" | null;
  text: string;
  passed: boolean;
  score: number;
  reason: string;
  remaining_seconds: number;
}

export interface FaceFlowEvent {
  event: string;
  target_id?: string | null;
  target_name?: string;
  flow_mode: FaceFlowMode;
  occurred_at?: string;
  elapsed_seconds?: number;
  missing_seconds?: number;
  samples?: number;
}

export interface FaceFlowState {
  mode: FaceFlowMode;
  phase: string;
  status: string;
  detail: string;
  finished: boolean;
  person_id?: string | null;
  accepted_samples?: number;
  required_samples?: number;
  events: FaceFlowEvent[];
  challenge: FaceChallengeState | null;
}

export interface FaceFrameResult {
  session_id: string;
  frame: { width: number; height: number };
  faces: FaceRecognitionResult[];
  flow: FaceFlowState;
}
