import type { TerminalAiChatMessage, TerminalAiEventData } from "#koko/composables/terminal/useTerminalAiSessions";
import type {
  ChenSqlAiTiming,
  ChenSqlMetadataApproval,
  ChenSqlMetadataApprovalDecision,
  ChenSqlProposal
} from "~/chen/composables/useChenSqlAiSessions";
import type { ScriptAiProposal } from "~/composables/useScriptAiSessions";

export type AiTimelineDomain = "shared" | "terminal" | "sql" | "file" | "script";

interface ViewItemBase<Domain extends AiTimelineDomain, Kind extends string> {
  domain: Domain;
  kind: Kind;
  key: string;
}

export interface AiContextItem {
  key: string;
  icon: string;
  label: string;
  title: string;
}

export interface AiSelectOption {
  label: string;
  description: string;
  value: number | string;
  disabled?: boolean;
}

export interface ViewExecution {
  id: string;
  key: string;
  index: number;
  command?: TerminalAiEventData;
  result?: TerminalAiEventData;
}

export interface ViewStep {
  id: string;
  key: string;
  index: number;
  title: string;
  objective: string;
  status: string;
  executions: ViewExecution[];
  acl?: TerminalAiEventData;
}

export interface TextItem extends ViewItemBase<"shared", "text"> {
  role: TerminalAiChatMessage["role"];
  text: string;
  modelDurationMs?: number;
}

export interface AgentNoticeItem extends ViewItemBase<"shared", "agent-notice"> {
  code: "approval_expired" | "run_timeout" | "tool_result_failed";
}

export type AgentToolStatus = "running" | "success" | "error" | "cancelled" | "timeout" | "unknown";

export interface AgentToolItem extends ViewItemBase<"shared", "agent-tool"> {
  data: {
    id: string;
    toolCallId: string;
    sourceDomain: Exclude<AiTimelineDomain, "shared">;
    toolName?: string;
    status: AgentToolStatus;
    durationMs?: number;
    arguments?: unknown;
    result?: unknown;
    error?: unknown;
  };
}

export interface PlanItem extends ViewItemBase<"terminal", "plan"> {
  id: string;
  summary: string;
  steps: ViewStep[];
}

export interface TerminalStepItem extends ViewItemBase<"terminal", "terminal-step"> {
  planId: string;
  step: ViewStep;
}

export interface AlertItem extends ViewItemBase<"terminal", "alert"> {
  data: TerminalAiEventData;
}

export interface SqlAnalysisItem extends ViewItemBase<"sql", "sql-analysis"> {
  data: TerminalAiEventData;
}

export interface SqlProposalItem extends ViewItemBase<"sql", "sql-proposal"> {
  toolCallId: string;
  data: ChenSqlProposal;
}

export interface SqlThoughtItem extends ViewItemBase<"sql", "sql-thought"> {
  summaries: string[];
}

export interface SqlTimingItem extends ViewItemBase<"sql", "sql-timing"> {
  data: ChenSqlAiTiming;
}

export interface MetadataApprovalItem extends ViewItemBase<"sql", "metadata-approval"> {
  approval: ChenSqlMetadataApproval;
  terminal: boolean;
}

export interface SchemaResultItem extends ViewItemBase<"sql", "schema-result"> {
  data: TerminalAiEventData;
}

export interface FileAiEntrySummary {
  name?: string;
  path?: string;
  type?: string;
  size?: number;
  permissions?: string;
  modifiedAt?: string;
}

export interface FileAiEventData {
  id?: string;
  digest?: string;
  approvalId?: string;
  planId?: string;
  stepId?: string;
  actionId?: string;
  action?: string;
  operation?: string;
  tool?: string;
  path?: string;
  newName?: string;
  destinationPath?: string;
  expectedVersion?: string;
  sourcePath?: string;
  targetPath?: string;
  summary?: string;
  description?: string;
  rationale?: string;
  text?: string;
  status?: string;
  state?: string;
  outcome?: string;
  riskLevel?: number | string;
  riskReason?: string;
  destructive?: boolean;
  recursive?: boolean;
  requiresApproval?: boolean;
  capabilities?: string[];
  tools?: string[];
  entries?: FileAiEntrySummary[];
  steps?: Array<{ id?: string; title?: string; objective?: string; status?: string }>;
  before?: string;
  after?: string;
  diff?: string;
  beforeVersion?: string;
  truncated?: boolean;
  result?: string;
  message?: string;
  error?: string;
  errorCode?: string;
  success?: boolean;
  durationMs?: number;
  completed?: number;
  total?: number;
  progress?: number;
  round?: number;
  maxRounds?: number;
  maxDirectoryEntries?: number;
  maxTextBytes?: number;
  expiresInSeconds?: number;
  arguments?: Record<string, unknown>;
  details?: unknown;
}

export interface FileAnalysisItem extends ViewItemBase<"file", "file-analysis"> {
  data: FileAiEventData;
}

export interface FilePlanItem extends ViewItemBase<"file", "file-plan"> {
  data: FileAiEventData;
}

export interface FileProgressItem extends ViewItemBase<"file", "file-progress"> {
  data: FileAiEventData;
}

export interface FileActionItem extends ViewItemBase<"file", "file-action"> {
  data: FileAiEventData;
}

export interface FileDiffItem extends ViewItemBase<"file", "file-diff"> {
  data: FileAiEventData;
}

export interface FileApprovalItem extends ViewItemBase<"file", "file-approval"> {
  data: FileAiEventData;
}

export interface FileResultItem extends ViewItemBase<"file", "file-result"> {
  data: FileAiEventData;
}

export interface ScriptProposalItem extends ViewItemBase<"script", "script-proposal"> {
  toolCallId: string;
  data: TerminalAiEventData;
}

export type TerminalViewItem = PlanItem | TerminalStepItem | AlertItem;
export type SqlViewItem =
  | SqlAnalysisItem
  | SqlProposalItem
  | SqlThoughtItem
  | SqlTimingItem
  | MetadataApprovalItem
  | SchemaResultItem;
export type FileViewItem =
  | FileAnalysisItem
  | FilePlanItem
  | FileProgressItem
  | FileActionItem
  | FileDiffItem
  | FileApprovalItem
  | FileResultItem;
export type ScriptViewItem = ScriptProposalItem;
export type SharedViewItem = TextItem | AgentToolItem | AgentNoticeItem;

export type TerminalTimelineAction =
  | { domain: "terminal"; type: "decide"; data: TerminalAiEventData; approved: boolean }
  | { domain: "terminal"; type: "set-execution-override"; id: string; value: string }
  | { domain: "terminal"; type: "set-step-expanded"; key: string; expanded: boolean };

export type SqlTimelineAction =
  | { domain: "sql"; type: "resolve-metadata-approval"; decision: ChenSqlMetadataApprovalDecision }
  | { domain: "sql"; type: "apply-proposal"; item: SqlProposalItem }
  | { domain: "sql"; type: "reject-proposal"; item: SqlProposalItem }
  | { domain: "sql"; type: "set-thought-expanded"; key: string; expanded: boolean };

export type FileTimelineAction = {
  domain: "file";
  type: "resolve-file-approval";
  approvalId: string;
  digest: string;
  decision: "approve" | "reject";
};

export type ScriptTimelineAction =
  | { domain: "script"; type: "apply-proposal"; item: ScriptProposalItem; proposal: ScriptAiProposal }
  | { domain: "script"; type: "reject-proposal"; item: ScriptProposalItem };

export type AiTimelineAction = TerminalTimelineAction | SqlTimelineAction | FileTimelineAction | ScriptTimelineAction;

export type ViewItem =
  | AgentNoticeItem
  | TextItem
  | AgentToolItem
  | PlanItem
  | TerminalStepItem
  | AlertItem
  | SqlAnalysisItem
  | SqlProposalItem
  | SqlThoughtItem
  | SqlTimingItem
  | MetadataApprovalItem
  | SchemaResultItem
  | FileAnalysisItem
  | FilePlanItem
  | FileProgressItem
  | FileActionItem
  | FileDiffItem
  | FileApprovalItem
  | FileResultItem
  | ScriptProposalItem;
