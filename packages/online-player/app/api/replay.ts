import type { Replay, ReplayCommand, ReplayPartManifest, ReplaySession } from "#online-player/types";

import { apiRequest } from "#imports";
import { isReplayApiPath } from "#online-player/utils/replay";

interface Paginated<T> {
  count?: number;
  results?: T[];
}

export function fetchReplay(sessionId: string) {
  return apiRequest<Replay & { error?: string }>({
    method: "GET",
    path: `/api/v1/terminal/sessions/${encodeURIComponent(sessionId)}/replay/`
  });
}

export function fetchReplaySession(sessionId: string) {
  return apiRequest<ReplaySession>({
    method: "GET",
    path: `/api/v1/terminal/sessions/${encodeURIComponent(sessionId)}/`
  });
}

export function fetchReplayPart(sessionId: string, filename: string) {
  return apiRequest<Replay & { resp?: { data?: Replay }; error?: string }>({
    method: "GET",
    path: `/api/v1/terminal/sessions/${encodeURIComponent(sessionId)}/replay/`,
    query: { part_filename: filename }
  });
}

export async function fetchReplayManifest(src: string) {
  if (isReplayApiPath(src)) {
    return apiRequest<ReplayPartManifest>({
      method: "GET",
      path: src
    });
  }

  const response = await fetch(src, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as ReplayPartManifest;
}

export function fetchReplayCommands(sessionId: string, page: number) {
  return apiRequest<Paginated<ReplayCommand>>({
    method: "GET",
    path: "/api/v1/terminal/commands/",
    query: {
      session_id: sessionId,
      limit: 30,
      offset: 30 * page,
      order: "timestamp"
    }
  });
}

export function fetchReplayUser(userId: string) {
  return apiRequest<{ id?: string; name?: string; username?: string }>({
    method: "GET",
    path: `/api/v1/users/users/${encodeURIComponent(userId)}/`
  });
}

export function fetchReplayAsset(assetId: string) {
  return apiRequest<{ id?: string; name?: string; address?: string }>({
    method: "GET",
    path: `/api/v1/assets/assets/${encodeURIComponent(assetId)}/`
  });
}

export function fetchReplayProfile() {
  return apiRequest<{ name?: string; username?: string }>({
    method: "GET",
    path: "/api/v1/users/profile/"
  });
}
