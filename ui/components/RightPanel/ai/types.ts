import type { TerminalAiChatMessage, TerminalAiEventData } from "#koko/composables/terminal/useTerminalAiSessions";
import type {
  ChenSqlAiTiming,
  ChenSqlMetadataApproval,
  ChenSqlProposal
} from "~/chen/composables/useChenSqlAiSessions";

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

export interface TextItem {
  kind: "text";
  key: string;
  role: TerminalAiChatMessage["role"];
  text: string;
}

export interface PlanItem {
  kind: "plan";
  key: string;
  id: string;
  summary: string;
  steps: ViewStep[];
}

export interface AlertItem {
  kind: "alert";
  key: string;
  data: TerminalAiEventData;
}

export interface SqlAnalysisItem {
  kind: "sql-analysis";
  key: string;
  data: TerminalAiEventData;
}

export interface SqlProposalItem {
  kind: "sql-proposal";
  key: string;
  data: ChenSqlProposal;
}

export interface SqlThoughtItem {
  kind: "sql-thought";
  key: string;
  summaries: string[];
}

export interface SqlTimingItem {
  kind: "sql-timing";
  key: string;
  data: ChenSqlAiTiming;
}

export interface MetadataApprovalItem {
  kind: "metadata-approval";
  key: string;
  approval: ChenSqlMetadataApproval;
  terminal: boolean;
}

export interface SchemaResultItem {
  kind: "schema-result";
  key: string;
  data: TerminalAiEventData;
}

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
