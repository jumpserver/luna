export interface TransferRateSample {
  t: number;
  bytes: number;
}

const sampleWindowMs = 4000;

export function pushTransferRateSample(
  samples: TransferRateSample[],
  bytes: number,
  now = Date.now()
): TransferRateSample[] {
  return [...samples, { t: now, bytes }].filter((sample) => now - sample.t <= sampleWindowMs).slice(-12);
}

export function bytesPerSecond(samples: TransferRateSample[] | null | undefined): number | null {
  if (!samples || samples.length < 2) return null;
  const first = samples[0];
  const last = samples.at(-1);
  if (!first || !last) return null;
  const elapsed = (last.t - first.t) / 1000;
  if (elapsed <= 0) return null;
  const delta = last.bytes - first.bytes;
  if (delta < 0) return null;
  return delta / elapsed;
}

export function remainingSeconds(size: number, confirmedBytes: number, rate: number | null): number | null {
  if (!size || rate == null || rate <= 0) return null;
  const left = Math.max(0, size - confirmedBytes);
  if (left === 0) return 0;
  return left / rate;
}

export function formatBytesPerSecond(rate: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = rate;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value >= 10 || unit === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unit]}/s`;
}

export function formatRemaining(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}
