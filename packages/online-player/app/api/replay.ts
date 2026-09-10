import type { Replay, ReplayCommand, ReplayPartManifest, ReplaySession } from "#online-player/types";

import { apiRequest } from "#imports";
import { isReplayApiPath, replayRequestOrgId } from "#online-player/utils/replay";

function requestOrgId() {
  return import.meta.client ? replayRequestOrgId(location.search) : undefined;
}

interface Paginated<T> {
  count?: number;
  results?: T[];
}

export function fetchReplay(sessionId: string) {
  return apiRequest<Replay & { error?: string }>({
    method: "GET",
    path: `/api/v1/terminal/sessions/${encodeURIComponent(sessionId)}/replay/`,
    orgId: requestOrgId()
  });
}

export function fetchReplaySession(sessionId: string) {
  return apiRequest<ReplaySession>({
    method: "GET",
    path: `/api/v1/terminal/sessions/${encodeURIComponent(sessionId)}/`,
    orgId: requestOrgId()
  });
}

export function fetchReplayPart(sessionId: string, filename: string) {
  return apiRequest<Replay & { resp?: { data?: Replay }; error?: string }>({
    method: "GET",
    path: `/api/v1/terminal/sessions/${encodeURIComponent(sessionId)}/replay/`,
    query: { part_filename: filename },
    orgId: requestOrgId()
  });
}

export async function fetchReplayManifest(src: string) {
  if (isReplayApiPath(src)) {
    return apiRequest<ReplayPartManifest>({
      method: "GET",
      path: src,
      orgId: requestOrgId()
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
    },
    orgId: requestOrgId()
  });
}

export function fetchReplayUser(userId: string) {
  return apiRequest<{ id?: string; name?: string; username?: string }>({
    method: "GET",
    path: `/api/v1/users/users/${encodeURIComponent(userId)}/`,
    orgId: requestOrgId()
  });
}

export function fetchReplayAsset(assetId: string) {
  return apiRequest<{ id?: string; name?: string; address?: string }>({
    method: "GET",
    path: `/api/v1/assets/assets/${encodeURIComponent(assetId)}/`,
    orgId: requestOrgId()
  });
}

export function fetchReplayProfile() {
  return apiRequest<{ name?: string; username?: string }>({
    method: "GET",
    path: "/api/v1/users/profile/"
  });
}
