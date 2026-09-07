import type { ChenTabDefinition } from "./base";
import type { ChenDataViewDataset, ChenDataViewEditState, ChenDataViewMeta } from "./dataView";

export interface ChenSqlEditorSnapshot {
  documentSql: string;
  selectedSql: string;
  selectionFrom: number;
  selectionTo: number;
}

export interface ChenSqlExecutionError {
  kind: "parse" | "execute" | string;
  title?: string;
  message: string;
  sql?: string;
  sqlState?: string;
  vendorCode?: number;
  timestamp?: number;
}

export interface ChenConsoleState {
  loading?: boolean;
  inQuery?: boolean;
  executionStatus?: ChenConsoleExecutionStatus;
  editorLoading?: boolean;
  canCancel?: boolean;
  currentContext?: string;
  contexts?: string[];
  title?: string;
  page?: number;
  limit?: number;
  total?: number;
  paged?: boolean;
  truncated?: boolean;
  rowLimit?: number;
  pinned?: boolean;
  [key: string]: any;
}

export interface ChenConsoleMessage {
  type?: "error" | "success" | "info" | string;
  title?: string;
  message: string;
  sql?: string;
  [key: string]: any;
}

export interface ChenQueryResultTab {
  id: string;
  title: string;
  meta: ChenDataViewMeta;
  data: ChenDataViewDataset | null;
  state: ChenConsoleState;
  editState: ChenDataViewEditState;
  affectedRows?: number;
}

export interface ChenConsoleHistoryEntry {
  id: string;
  sql: string;
}

export type ChenLogConsoleLevel = "error" | "warning" | "info";

export interface ChenLogConsoleEntry {
  id: string;
  timestamp: number;
  sourceId: string;
  sourceTitle: string;
  level: ChenLogConsoleLevel;
  message: string;
}

export type ChenConsoleExecutionStatus = "running" | "cancelling" | "success" | "error" | "cancelled";

export interface ChenConsoleTimelineResult {
  id: string;
  data: ChenDataViewDataset;
  state: ChenConsoleState;
}

export interface ChenConsoleTimelineEntry {
  id: string;
  sql: string;
  status: ChenConsoleExecutionStatus;
  startedAt: number;
  completedAt?: number;
  logs: string[];
  results: ChenConsoleTimelineResult[];
}

export interface ChenQueryConsoleTab extends ChenTabDefinition {
  kind: "query";
  statement: string;
  aiRevision: number;
  lastSqlError: ChenSqlExecutionError | null;
  uploadingSql: boolean;
  state: ChenConsoleState;
  logs: string[];
  message: ChenConsoleMessage | null;
  resultTabs: ChenQueryResultTab[];
  activeResultTabId: string;
  socket: WebSocket | null;
}

export interface ChenPromptConsoleTab extends ChenTabDefinition {
  kind: "console";
  pendingSql: string;
  aiRevision: number;
  lastSqlError: ChenSqlExecutionError | null;
  timelineEntries: ChenConsoleTimelineEntry[];
  activeTimelineEntryId: string;
  state: ChenConsoleState;
  logs: string[];
  message: ChenConsoleMessage | null;
  historyEntries: ChenConsoleHistoryEntry[];
  socket: WebSocket | null;
}

export type ChenQueryLikeWorkspaceTab = ChenQueryConsoleTab | ChenPromptConsoleTab;
