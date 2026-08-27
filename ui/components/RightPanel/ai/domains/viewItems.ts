import type { TerminalAiChatMessage, TerminalAiEventData } from "#koko/composables/terminal/useTerminalAiSessions";
import type { AiTimelineDomain, ViewItem } from "../types";
import type { ChenSqlMetadataApproval } from "~/chen/composables/useChenSqlAiSessions";

export interface AiViewItemBuildOptions {
  messages: TerminalAiChatMessage[];
  metadataApproval: ChenSqlMetadataApproval | null;
  terminalMetadataApproval: boolean;
  executionPlanLabel: string;
  stepLabel: (count: number) => string;
}

export interface AiViewItemBuildContext {
  items: ViewItem[];
  options: AiViewItemBuildOptions;
}

export interface AiViewItemBuildInput {
  message: TerminalAiChatMessage;
  partIndex: number;
  partType: string;
  data: TerminalAiEventData;
}

export interface AiViewItemBuilder {
  domain: Exclude<AiTimelineDomain, "shared">;
  supports(partType: string, message: TerminalAiChatMessage): boolean;
  append(context: AiViewItemBuildContext, input: AiViewItemBuildInput): void;
}

export type AiViewItemBuilderFactory = () => AiViewItemBuilder;
