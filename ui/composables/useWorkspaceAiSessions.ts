import type { KokoFileAiSession } from "#koko/composables/sftp/useFileAiSessions";
import type { KokoTerminalAiSession } from "#koko/composables/terminal/useTerminalAiSessions";
import type { ChenSqlAiSession } from "~/chen/composables/useChenSqlAiSessions";

// Domain modules can augment this map when they add a workspace AI session.
export interface WorkspaceAiSessionMap {
  file: KokoFileAiSession;
  terminal: KokoTerminalAiSession;
  sql: ChenSqlAiSession;
}

export type WorkspaceAiSession = WorkspaceAiSessionMap[keyof WorkspaceAiSessionMap];

export function isChenSqlWorkspaceAiSession(session: WorkspaceAiSession | null): session is ChenSqlAiSession {
  return Boolean(session && "kind" in session && session.kind === "sql");
}

export function isKokoFileWorkspaceAiSession(session: WorkspaceAiSession | null): session is KokoFileAiSession {
  return Boolean(session && "kind" in session && session.kind === "file");
}

export function isKokoTerminalWorkspaceAiSession(session: WorkspaceAiSession | null): session is KokoTerminalAiSession {
  return Boolean(session && "kind" in session && session.kind === "terminal");
}
