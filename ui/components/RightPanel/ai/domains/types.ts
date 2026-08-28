import type { TerminalAiChatMessage } from "#koko/composables/terminal/useTerminalAiSessions";
import type { AiContextItem, AiSelectOption, AiTimelineAction, AiTimelineDomain, ViewItem } from "../types";
import type { WorkspaceAiSession } from "~/composables/useWorkspaceAiSessions";
import type { WorkspaceSurfaceSession } from "~/composables/useWorkspaceTabs";

export type AiTranslate = (key: string, params?: Record<string, unknown>) => string;

export interface AiPanelDomainContext {
  paneId: string;
  surface: WorkspaceSurfaceSession | null | undefined;
  now: number;
  t: AiTranslate;
}

export interface AiPanelEmptyState {
  icon: string;
  title: string;
  description: string;
}

export interface AiPanelDomainPresentation {
  assistantName: string;
  headerDescription: string;
  available: boolean;
  busy: boolean;
  waitingForApproval: boolean;
  unavailable: AiPanelEmptyState;
  empty: AiPanelEmptyState;
  inputPlaceholder: string;
  actionLabel: string;
  runtimeStatusLabel: string;
  errorLabel: string;
  errorDetail: string;
  backgroundReasonLabel: string;
  elapsedDurationMs: number;
  contextItems: AiContextItem[];
  showPolicy: boolean;
  showRuntimeStatus: boolean;
  showElapsedInError: boolean;
  showActivity: boolean;
  refreshElapsedWhileBusy: boolean;
  backgroundExecAvailable: boolean;
  approvalThreshold: number;
  executionMode: string;
  thresholdOptions: AiSelectOption[];
  modeOptions: AiSelectOption[];
}

export interface AiPanelDomainSummary {
  runProgress?: string;
  highestRiskLevel?: number;
  outcome?: "ready" | "success" | "error";
}

export interface AiPanelDomainAdapter {
  id: Exclude<AiTimelineDomain, "shared">;
  matches(session: WorkspaceAiSession): boolean;
  describe(
    session: WorkspaceAiSession,
    context: AiPanelDomainContext,
    items: readonly ViewItem[]
  ): AiPanelDomainPresentation;
  summarize(
    session: WorkspaceAiSession,
    context: AiPanelDomainContext,
    items: readonly ViewItem[]
  ): AiPanelDomainSummary;
  submit(session: WorkspaceAiSession, text: string, context: AiPanelDomainContext): void;
  interrupt(session: WorkspaceAiSession, context: AiPanelDomainContext): void;
  clearError(session: WorkspaceAiSession): void;
  updateApprovalThreshold?(session: WorkspaceAiSession, value: unknown, context: AiPanelDomainContext): void;
  updateExecutionMode?(session: WorkspaceAiSession, value: unknown, context: AiPanelDomainContext): void;
  handleTimelineAction(session: WorkspaceAiSession, action: AiTimelineAction, context: AiPanelDomainContext): void;
}

export function workspaceAiMessages(session: WorkspaceAiSession): TerminalAiChatMessage[] {
  // AI SDK mutates its shallow message array before triggering the ref. Returning
  // a new array keeps all registered domain consumers reactive.
  return [...session.chat.messages.value];
}

export function commonSurfaceContext(context: AiPanelDomainContext, protocolIcon: string): AiContextItem[] {
  const surface = context.surface;
  const items: AiContextItem[] = [];
  if (surface?.assetName) {
    items.push({
      key: "asset",
      icon: "i-lucide-server",
      label: `@${surface.assetName}`,
      title: [surface.assetName, surface.address].filter(Boolean).join(" · ")
    });
  }
  if (surface?.protocol) {
    items.push({
      key: "protocol",
      icon: protocolIcon,
      label: `@${surface.protocol}`,
      title: surface.protocol
    });
  }
  if (surface?.account) {
    items.push({
      key: "account",
      icon: "i-lucide-user-key",
      label: `@${surface.account}`,
      title: surface.account
    });
  }
  return items;
}
