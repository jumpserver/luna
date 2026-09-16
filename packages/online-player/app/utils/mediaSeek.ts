const SEEK_TOLERANCE_SECONDS = 0.05;

// A decoded/buffered frame is not sufficient proof that a browser can seek to it.
// The MP4 can be buffered while the media element still reports seekable=[0,0].
export function isMediaTimeSeekable(ranges: TimeRanges, targetSeconds: number) {
  if (!Number.isFinite(targetSeconds) || targetSeconds < 0) return false;
  if (targetSeconds === 0) return true;
  try {
    for (let index = 0; index < ranges.length; index++) {
      const start = ranges.start(index);
      const end = ranges.end(index);
      if (
        end > start &&
        start <= targetSeconds + SEEK_TOLERANCE_SECONDS &&
        end >= targetSeconds - SEEK_TOLERANCE_SECONDS
      ) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}
