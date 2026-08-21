export function padTime(value: number) {
  return `${Math.max(0, Math.floor(value))}`.padStart(2, "0");
}

export function formatClock(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return "00:00";

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return hours > 0
    ? `${padTime(hours)}:${padTime(minutes)}:${padTime(seconds)}`
    : `${padTime(minutes)}:${padTime(seconds)}`;
}

export function formatLocalDateTime(value?: string) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace("T", " ").slice(0, 19);

  const pad = (part: number) => `${part}`.padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function formatDurationLabel(durationMs: number, isZh: boolean) {
  if (!durationMs) return isZh ? "0 秒" : "0 s";

  const seconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  const parts: string[] = [];

  if (hours > 0) parts.push(`${hours} ${isZh ? "小时" : "hour"}`);
  if (minutes > 0) parts.push(`${minutes} ${isZh ? "分" : "min"}`);
  if (remaining > 0 || parts.length === 0) parts.push(`${remaining} ${isZh ? "秒" : "s"}`);

  return parts.join(" ");
}

export function toStartMs(dateStart?: string) {
  if (!dateStart) return 0;
  const parsed = Date.parse(dateStart);
  return Number.isNaN(parsed) ? 0 : parsed;
}
