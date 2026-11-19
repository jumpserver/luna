import type Guacamole from "@jumpserver/guacamole";

export function applyGuacamolePlaybackRate(
  recording: Partial<Pick<Guacamole.SessionRecording, "setPlaybackRate">> | null | undefined,
  speed?: number
) {
  const rate = speed ?? 1;
  if (!recording?.setPlaybackRate || !Number.isFinite(rate) || rate <= 0) return false;
  recording.setPlaybackRate(rate);
  return true;
}
