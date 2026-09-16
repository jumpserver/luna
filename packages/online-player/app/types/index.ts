export type ReplayType = "asciicast" | "guacamole" | "mp4" | "parts";

export type ReplayLoadStatus = "idle" | "loading" | "converting" | "ready" | "not-found" | "error";

export interface Replay {
  id: string;
  src?: string;
  type?: ReplayType | string;
  status?: string;
  user?: string;
  asset?: string;
  system_user?: string;
  account?: string;
  date_start?: string;
  date_end?: string;
  download_url?: string;
}

export interface ReplaySession {
  asset?: string;
  asset_id?: string;
  user?: string;
  user_id?: string;
  account?: string;
  date_start?: string;
  protocol?: string;
}

export interface ReplayCommand {
  id?: string;
  input: string;
  timestamp: number;
  atime: string;
  risk_level?: number;
  offsetMs: number;
}

export interface ReplayIndexEvent {
  ordinal: number;
  kind: string;
  replay_ms: number;
  part_index: number;
  local_ms: number;
  // Optional in v1 sidecars. False keeps OCR searchable without cluttering the timeline.
  timeline_marker?: boolean;
  timeline_reason?: string;
  ocr: {
    text: string;
    delta_text: string;
    removed_text?: string;
    confidence: number;
  };
}

export interface ReplayIndex {
  schema: "jumpserver.recording-index";
  version: 1;
  session: { id: string };
  source: { duration_ms: number; part_count: number };
  event_count: number;
  events: ReplayIndexEvent[];
}

export interface ReplayPartFile {
  duration: number;
  end: number;
  name: string;
  size: number;
  start: number;
}

export interface ReplayPartManifest {
  id?: string;
  type?: string;
  date_start?: string;
  files?: ReplayPartFile[];
}

export interface ReplayPartItem extends Replay {
  name: string;
  sizeLabel: string;
  durationLabel: string;
  partIndex: number;
}

export interface ReplayWatermarkSettings {
  enabled: boolean;
  content: string;
  width: number;
  height: number;
  fontSize: number;
  fontColor: string;
  rotate: number;
}

export interface ReplayPlayerHandle {
  play: () => void;
  pause: () => void;
  seek: (ms: number) => Promise<void>;
  cancelSeek?: () => void;
}

export const REPLAY_SPEEDS = [0.5, 1, 1.5, 2, 4] as const;

export const COMMAND_SEEK_LEAD_MS = 5000;
export const GUACAMOLE_COMMAND_SEEK_LEAD_MS = 10_000;
