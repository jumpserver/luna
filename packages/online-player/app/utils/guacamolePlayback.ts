export function applyGuacamolePlaybackRate(
  recording: { setPlaybackRate?: (rate: number) => void } | null | undefined,
  speed?: number
) {
  const rate = speed ?? 1;
  if (!recording?.setPlaybackRate || !Number.isFinite(rate) || rate <= 0) return false;
  recording.setPlaybackRate(rate);
  return true;
}
