export interface ReplayClockFile {
  start?: number;
  end?: number;
  duration?: number;
}

const SESSION_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?\s*(Z|[+-]\d{2}:?\d{2})?$/;

function pad2(value: number) {
  return `${value}`.padStart(2, "0");
}

export function parseSessionDate(raw?: string): { utcMs: number; tzMinutes: number } | undefined {
  if (!raw?.trim()) return undefined;

  const match = raw.trim().match(SESSION_DATE_RE);
  if (!match) return undefined;

  const [, year, month, day, hours, minutes, seconds, fraction, tzRaw] = match;
  const millis = (fraction ?? "").slice(0, 3).padEnd(3, "0");
  const wallAsUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours),
    Number(minutes),
    Number(seconds),
    Number(millis || "0")
  );
  if (Number.isNaN(wallAsUtc)) return undefined;

  let tzMinutes = 0;
  if (tzRaw && tzRaw !== "Z") {
    const sign = tzRaw[0] === "-" ? -1 : 1;
    const digits = tzRaw.slice(1).replace(/:/g, "");
    tzMinutes = sign * ((Number(digits.slice(0, 2)) || 0) * 60 + (Number(digits.slice(2, 4)) || 0));
  }

  return {
    utcMs: wallAsUtc - tzMinutes * 60_000,
    tzMinutes
  };
}

export function formatSessionDate(utcMs: number, tzMinutes: number) {
  const shifted = new Date(utcMs + tzMinutes * 60_000);
  const sign = tzMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(tzMinutes);

  return [
    `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`,
    `${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}:${pad2(shifted.getUTCSeconds())}`,
    `${sign}${pad2(Math.floor(abs / 60))}${pad2(abs % 60)}`
  ].join(" ");
}

export function guacamoleTimelineOrigin(files?: ReplayClockFile[]) {
  let origin: number | undefined;

  for (const file of files || []) {
    if (!Number.isFinite(file.start)) continue;
    origin = origin === undefined ? file.start : Math.min(origin, file.start as number);
  }

  return origin;
}

export function resolveReplayWallClock(
  sessionStart: string | undefined,
  file: ReplayClockFile | undefined,
  files?: ReplayClockFile[]
) {
  const parsed = parseSessionDate(sessionStart);
  const origin = guacamoleTimelineOrigin(files ?? (file ? [file] : undefined));

  if (!parsed || !file || origin === undefined || !Number.isFinite(file.start)) {
    return {};
  }

  const startOffset = (file.start as number) - origin;
  let endOffset: number | undefined;
  if (Number.isFinite(file.end)) {
    endOffset = (file.end as number) - origin;
  } else if (Number.isFinite(file.duration)) {
    endOffset = startOffset + (file.duration as number);
  }

  return {
    date_start: formatSessionDate(parsed.utcMs + startOffset, parsed.tzMinutes),
    date_end: endOffset === undefined ? undefined : formatSessionDate(parsed.utcMs + endOffset, parsed.tzMinutes)
  };
}
