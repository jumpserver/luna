import type { ReplayIndex, ReplayIndexEvent } from "#online-player/types";

export function isReplayIndex(value: unknown, sessionId: string): value is ReplayIndex {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<ReplayIndex>;
  if (data.schema !== "jumpserver.recording-index" || data.version !== 1 || data.session?.id !== sessionId) {
    return false;
  }
  if (!Number.isSafeInteger(data.source?.duration_ms) || !Number.isSafeInteger(data.source?.part_count)) {
    return false;
  }
  if ((data.source?.duration_ms || 0) < 0 || (data.source?.part_count || 0) < 1 || !Array.isArray(data.events)) {
    return false;
  }
  if (data.event_count !== data.events.length) return false;
  return data.events.every(
    (event) =>
      Number.isSafeInteger(event?.ordinal) &&
      typeof event?.kind === "string" &&
      Number.isSafeInteger(event?.replay_ms) &&
      event.replay_ms >= 0 &&
      event.replay_ms <= data.source!.duration_ms &&
      Number.isSafeInteger(event?.part_index) &&
      event.part_index >= 0 &&
      event.part_index < data.source!.part_count &&
      Number.isSafeInteger(event?.local_ms) &&
      event.local_ms >= 0 &&
      (event.timeline_marker === undefined || typeof event.timeline_marker === "boolean") &&
      (event.timeline_reason === undefined || typeof event.timeline_reason === "string") &&
      typeof event?.ocr?.text === "string" &&
      typeof event?.ocr?.delta_text === "string" &&
      Number.isFinite(event?.ocr?.confidence)
  );
}

export function eventMatchesQuery(event: ReplayIndexEvent, query: string) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return [event.ocr.text, event.ocr.delta_text, event.ocr.removed_text || ""].some((value) =>
    value.toLocaleLowerCase().includes(needle)
  );
}

export function eventExcerpt(event: ReplayIndexEvent, query = "") {
  const candidates = [event.ocr.delta_text, event.ocr.text, event.ocr.removed_text || ""];
  const needle = query.trim().toLocaleLowerCase();
  const source = needle
    ? candidates.find((item) => item.toLocaleLowerCase().includes(needle)) || candidates[0] || ""
    : candidates.find((item) => item.trim()) || "";
  const collapsed = source.replace(/\s+/g, " ").trim();
  const at = needle ? collapsed.toLocaleLowerCase().indexOf(needle) : -1;
  const start = at > 35 ? at - 35 : 0;
  const prefix = start > 0 ? "…" : "";
  const snippet = collapsed.slice(start, start + 150);
  return `${prefix}${snippet}${start + 150 < collapsed.length ? "…" : ""}`;
}

export function eventPositionMs(event: ReplayIndexEvent, isParts: boolean, activePartIndex?: number) {
  if (!isParts) return event.replay_ms;
  return event.part_index === activePartIndex ? event.local_ms : null;
}

export function visibleIndexMarkers(events: ReplayIndexEvent[], limit = 200) {
  const eligible = events.filter((event) => event.timeline_marker !== false);
  const stride = Math.max(1, Math.ceil(eligible.length / limit));
  return eligible.filter((_, index) => index % stride === 0);
}
