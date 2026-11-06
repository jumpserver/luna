export type AgentEngine = "codex" | "claude" | "pi";

export interface AgentProfile {
  id: string;
  name: string;
  engine: AgentEngine;
  executable: string;
  model: string;
  cwd: string;
}

export interface AgentEvent {
  id: string;
  type: "text" | "tool" | "status" | "approval" | "error";
  text: string;
  role?: "user" | "assistant";
  requestId?: string;
  status?: string;
}

export interface AgentSession {
  id: string;
  profileId: string;
  profileName: string;
  engine: AgentEngine;
  title: string;
  status: "starting" | "idle" | "running" | "error";
  events: AgentEvent[];
}

export interface LocalAgentsSnapshot {
  enabled: boolean;
  site: string;
  profiles: AgentProfile[];
  sessions: AgentSession[];
}
