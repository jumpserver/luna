import type { Replay, ReplayCommand, ReplayLoadStatus } from "#online-player/types";
import { COMMAND_SEEK_LEAD_MS, GUACAMOLE_COMMAND_SEEK_LEAD_MS } from "#online-player/types";
import { formatClock, toStartMs } from "#online-player/utils/time";

export type ReplayPollDecision = "ready" | "not-found" | "converting";
export type ReplayOverlayKind = "blocked" | "converting" | "not-found" | "error" | null;
export type ReplayRailTab = "parts" | "commands";

export const REPLAY_POLL_MAX_MS = 120_000;
export const REPLAY_POLL_START_DELAY_MS = 2000;
export const REPLAY_POLL_MAX_DELAY_MS = 8000;

const ABSOLUTE_URL = /^[a-z][a-z\d+\-.]*:\/\//i;

export function commandSeekLeadMs(type?: string) {
  return type === "guacamole" ? GUACAMOLE_COMMAND_SEEK_LEAD_MS : COMMAND_SEEK_LEAD_MS;
}

export function nextReplayPollDelay(delay: number, maxDelay = REPLAY_POLL_MAX_DELAY_MS) {
  return Math.min(delay * 2, maxDelay);
}

export function decideReplayPoll(
  data: { error?: string; type?: string } | null | undefined,
  elapsedMs: number,
  maxMs = REPLAY_POLL_MAX_MS
): ReplayPollDecision {
  if (data?.error) return "not-found";
  if (data?.type) return "ready";
  if (elapsedMs >= maxMs) return "not-found";
  return "converting";
}

export function isReplayApiPath(src: string) {
  if (!src) return false;
  return /(?:^|\/)api\//.test(pathnameOf(src));
}

export function resolveReplayPartPayload(
  res: (Replay & { resp?: { data?: Replay }; error?: string }) | null | undefined
): Replay | null {
  if (!res) return null;
  if (res.type) return res;
  if (res.resp?.data) return res.resp.data;
  return res.src ? res : null;
}

export function mapReplayCommands(results: Array<Partial<ReplayCommand> & { timestamp: number }>, dateStart?: string) {
  const startMs = toStartMs(dateStart);
  return results.map((item) => {
    const offsetMs = Math.max(0, item.timestamp * 1000 - startMs);
    return {
      ...item,
      input: item.input || "",
      offsetMs,
      atime: formatClock(offsetMs)
    } satisfies ReplayCommand;
  });
}

function pathnameOf(src: string) {
  if (ABSOLUTE_URL.test(src) || src.startsWith("//")) {
    try {
      return new URL(src, "https://placeholder.local").pathname;
    } catch {
      return src;
    }
  }

  const suffixStart = src.search(/[?#]/);
  return suffixStart === -1 ? src : src.slice(0, suffixStart);
}

export function initialRailTab(hasParts: boolean): ReplayRailTab {
  return hasParts ? "parts" : "commands";
}

export function resolveReplayOverlay(state: {
  blocked?: boolean;
  status: ReplayLoadStatus;
  partsPreparing?: boolean;
  isParts?: boolean;
  partsEmpty?: boolean;
  partsLoading?: boolean;
  unsupported?: boolean;
}): ReplayOverlayKind {
  if (state.blocked) return "blocked";
  if (state.status === "loading" || state.status === "converting" || state.partsPreparing || state.partsLoading) {
    return "converting";
  }
  if (state.status === "not-found") return "not-found";
  if (state.status === "error" || state.unsupported) return "error";
  if (state.isParts && !state.partsLoading && state.partsEmpty) return "error";
  return null;
}

export function shouldShowReplayRail(state: {
  overlay?: boolean;
  isParts?: boolean;
  commandCount?: number;
  commandsLoading?: boolean;
  commandsError?: boolean;
}) {
  if (state.overlay) return false;
  if (state.isParts) return true;
  return Boolean(state.commandCount || state.commandsLoading || state.commandsError);
}
