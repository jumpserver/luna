import type { TerminalAiChatMessage, TerminalAiEventData } from "#koko/composables/terminal/useTerminalAiSessions";
import type {
  ChenSqlAiTiming,
  ChenSqlMetadataApproval,
  ChenSqlMetadataApprovalDecision,
  ChenSqlProposal
} from "~/chen/composables/useChenSqlAiSessions";

export type AiTimelineDomain = "shared" | "terminal" | "sql";

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
}

export interface PlanItem extends ViewItemBase<"terminal", "plan"> {
  id: string;
  summary: string;
  steps: ViewStep[];
}

export interface AlertItem extends ViewItemBase<"terminal", "alert"> {
  data: TerminalAiEventData;
}

export interface SqlAnalysisItem extends ViewItemBase<"sql", "sql-analysis"> {
  data: TerminalAiEventData;
}

export interface SqlProposalItem extends ViewItemBase<"sql", "sql-proposal"> {
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

export type TerminalViewItem = PlanItem | AlertItem;
export type SqlViewItem =
  | SqlAnalysisItem
  | SqlProposalItem
  | SqlThoughtItem
  | SqlTimingItem
  | MetadataApprovalItem
  | SchemaResultItem;

export type TerminalTimelineAction =
  | { domain: "terminal"; type: "decide"; data: TerminalAiEventData; approved: boolean }
  | { domain: "terminal"; type: "set-execution-override"; id: string; value: string }
  | { domain: "terminal"; type: "set-step-expanded"; key: string; expanded: boolean };

export type SqlTimelineAction =
  | { domain: "sql"; type: "resolve-metadata-approval"; decision: ChenSqlMetadataApprovalDecision }
  | { domain: "sql"; type: "apply-proposal"; item: SqlProposalItem }
  | { domain: "sql"; type: "reject-proposal"; item: SqlProposalItem }
  | { domain: "sql"; type: "set-thought-expanded"; key: string; expanded: boolean };

export type AiTimelineAction = TerminalTimelineAction | SqlTimelineAction;

export type ViewItem =
  | TextItem
  | PlanItem
  | AlertItem
  | SqlAnalysisItem
  | SqlProposalItem
  | SqlThoughtItem
  | SqlTimingItem
  | MetadataApprovalItem
  | SchemaResultItem;
