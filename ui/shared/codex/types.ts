import type { AgentMcpManifest, AgentMessageRequest, AgentToolResultRequest } from "../../koko/composables/agent/types";

export interface LocalCodexSettings {
  enabled: boolean;
  executable: string;
  model: string;
}

export const DEFAULT_CODEX_SETTINGS: LocalCodexSettings = { enabled: false, executable: "codex", model: "" };

export interface CodexSessionRequest {
  manifest: AgentMcpManifest;
  approvalMode: "always" | "auto";
  language?: string;
}

export interface CodexCommand {
  sessionId: string;
  resourceSessionId: string;
  message?: AgentMessageRequest;
  context?: Record<string, unknown>;
  language?: string;
  toolCallId?: string;
  result?: AgentToolResultRequest;
  approvalId?: string;
  decision?: "approve" | "reject";
  mode?: "always" | "auto";
  after?: number;
}
