import type { AgentProfile, AgentEvent } from "../../../ui/shared/agents/types";

export type {
  AgentEngine,
  AgentProfile,
  AgentEvent,
  AgentSession,
  LocalAgentsSnapshot
} from "../../../ui/shared/agents/types";

export interface AgentAdapter {
  send(text: string): Promise<void>;
  approve(requestId: string, allow: boolean): Promise<void>;
  stop(): Promise<void>;
  close(): void;
}

export type AdapterFactory = (profile: AgentProfile, emit: (event: AgentEvent) => void) => Promise<AgentAdapter>;
