export interface TouchPoint {
  x: number;
  y: number;
  t: number;
}

export type TouchGesture = { kind: "tap" } | { kind: "seek"; deltaMs: number } | { kind: "ignore" };

const TAP_MOVE_PX = 10;
const TAP_MAX_MS = 200;
const SWIPE_MIN_X = 50;
const SWIPE_MAX_Y = 30;
const SWIPE_SEEK_MS = 5000;

export function interpretTouchGesture(start: TouchPoint, end: TouchPoint, seekMs = SWIPE_SEEK_MS): TouchGesture {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dt = end.t - start.t;

  if (Math.abs(dx) < TAP_MOVE_PX && Math.abs(dy) < TAP_MOVE_PX && dt < TAP_MAX_MS) {
    return { kind: "tap" };
  }

  if (Math.abs(dx) > SWIPE_MIN_X && Math.abs(dy) < SWIPE_MAX_Y) {
    return { kind: "seek", deltaMs: dx > 0 ? seekMs : -seekMs };
  }

  return { kind: "ignore" };
}
