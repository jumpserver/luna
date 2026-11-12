import type { AgentMcpManifest, AgentMessageRequest, AgentToolResultRequest } from "../../koko/composables/agent/types";

export interface LocalCodexSettings {
  enabled: boolean;
  executable: string;
  model: string;
  runtime: "managed" | "system";
  connection: "api" | "existing";
  baseUrl: string;
  hasApiKey: boolean;
}

export type LocalCodexSettingsInput = LocalCodexSettings & { apiKey?: string; clearApiKey?: boolean };

export interface LocalCodexModel {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface CodexRuntimeStatus {
  version: string;
  installed: boolean;
  installing: boolean;
  progress: number;
}

export const DEFAULT_CODEX_SETTINGS: LocalCodexSettings = {
  enabled: false,
  executable: "codex",
  model: "",
  runtime: "managed",
  connection: "api",
  baseUrl: "https://api.openai.com/v1",
  hasApiKey: false
};

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
