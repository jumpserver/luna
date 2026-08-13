import type { KokoTerminalAiSession } from "#koko/composables/terminal/useTerminalAiSessions";
import type { ChenSqlAiSession } from "~/chen/composables/useChenSqlAiSessions";

import { getKokoTerminalAiSession } from "#koko/composables/terminal/useTerminalAiSessions";
import { getChenSqlAiSession } from "~/chen/composables/useChenSqlAiSessions";

export type WorkspaceAiSession = KokoTerminalAiSession | ChenSqlAiSession;

export function getWorkspaceAiSession(paneId: string): WorkspaceAiSession | null {
  return getChenSqlAiSession(paneId) || getKokoTerminalAiSession(paneId);
}

export function isChenSqlWorkspaceAiSession(session: WorkspaceAiSession | null): session is ChenSqlAiSession {
  return Boolean(session && "kind" in session && session.kind === "sql");
}
