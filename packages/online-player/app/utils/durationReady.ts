export function createDurationGate(settleMs = 1000) {
  let last = 0;
  let changedAt = 0;

  return {
    reset() {
      last = 0;
      changedAt = 0;
    },
    note(duration: number, now = Date.now()) {
      if (duration !== last) {
        last = duration;
        changedAt = now;
      }
    },
    isSettled(now = Date.now()) {
      return last > 0 && now - changedAt >= settleMs;
    }
  };
}
