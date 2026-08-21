export interface ChenAuthResponse {
  token: string;
  lang: string;
}

export interface ChenProfile {
  dbType: string;
  canCopy: boolean;
  canPaste: boolean;
  chatAiEnabled: boolean;
}

export interface ChenTreeNode {
  key: string;
  name?: string;
  label?: string;
  type: string;
  leaf?: boolean;
  children?: ChenTreeNode[];
  [key: string]: any;
}

export interface ChenActionItem {
  key: string;
  label: string;
  icon?: string;
  disabled?: boolean;
  divided?: boolean;
  children?: ChenActionItem[];
}

export interface ChenPacket<T = any> {
  type: string;
  data: T;
}

export interface ChenTabDefinition {
  id: string;
  title: string;
  icon?: string;
  kind: "query" | "data-view" | "console" | "database" | "create-table" | "table-structure";
  nodeKey: string;
  serverConsoleId?: string;
  connectionError?: string;
}

export interface ChenDataViewMeta {
  id?: string;
  title: string;
  schema?: string;
  table?: string;
  [key: string]: any;
}

export interface ChenDataViewField {
  name: string;
  label?: string;
  columnName?: string;
  schema?: string;
  table?: string;
  sourceSchema?: string;
  sourceTable?: string;
  sourceColumn?: string;
  type?: string;
  nullable?: boolean;
  isPrimaryKey?: boolean;
  primaryKey?: boolean;
  editable?: boolean;
  insertable?: boolean;
  editReason?: string;
}

export type ChenDataViewExportScope = "current" | "all";
export type ChenDataViewExportFormat = "csv" | "excel";

export interface ChenDataViewExportOptions {
  scope: ChenDataViewExportScope;
  format: ChenDataViewExportFormat;
}

export interface ChenDataViewDataset {
  fields: ChenDataViewField[];
  data: Array<Record<string, any>>;
  editable?: boolean;
  editReason?: string;
}

export interface ChenCellWriteValue {
  value: any;
  valueIsNull: boolean;
}

export interface ChenCellChange {
  pkColumn: string;
  pkValue: any;
  pkValueIsNull: boolean;
  sourceColumn: string;
  oldValue: any;
  oldValueIsNull: boolean;
  newValue: any;
  newValueIsNull: boolean;
}

export interface ChenInsertRowDraft {
  id: number;
  data: Record<string, any>;
  values: Record<string, ChenCellWriteValue>;
}

export interface ChenDeleteRow {
  pkColumn: string;
  pkValue: any;
  pkValueIsNull: boolean;
}

export interface ChenSaveChangesPayload {
  schema?: string;
  table?: string;
  changes: ChenCellChange[];
  insertRows: Array<{ values: Record<string, ChenCellWriteValue> }>;
  deleteRows: ChenDeleteRow[];
}

export interface ChenSaveChangesResultBase {
  success: boolean;
  allowed?: boolean;
  reason?: string;
  failedChangeIndex?: number | null;
  dataView?: string;
  schema?: string;
  table?: string;
  changeCount?: number;
  updateCount?: number;
  insertCount?: number;
  deleteCount?: number;
}

export interface ChenSaveChangesPreviewResult extends ChenSaveChangesResultBase {
  auditSql?: string;
}

export interface ChenSaveChangesResult extends ChenSaveChangesResultBase {
  databaseChangesApplied?: boolean;
  databaseCommitted?: boolean;
  auditSucceeded?: boolean;
  connectionInvalidated?: boolean;
}

export type ChenDataViewRequestKind = "data" | "preview" | "confirm" | "save";

export interface ChenDataViewActiveRequest {
  sequence: number;
  kind: ChenDataViewRequestKind;
  dirtyVersion: number;
  payload: ChenSaveChangesPayload | null;
}

export interface ChenDataViewEditState {
  dirtyCells: Record<string, ChenCellChange>;
  insertRows: ChenInsertRowDraft[];
  deletedRows: Record<string, ChenDeleteRow>;
  nextInsertRowId: number;
  pendingSavePayload: ChenSaveChangesPayload | null;
  previewResult: ChenSaveChangesPreviewResult | null;
  saveResult: ChenSaveChangesResult | null;
  dirtyVersion: number;
  requestSequence: number;
  activeRequest: ChenDataViewActiveRequest | null;
  refreshRequiredBeforeSave: boolean;
}

export type ChenDataViewEditMode = "none" | "update" | "full";

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
  timelineEntries: ChenConsoleTimelineEntry[];
  activeTimelineEntryId: string;
  state: ChenConsoleState;
  logs: string[];
  message: ChenConsoleMessage | null;
  historyEntries: ChenConsoleHistoryEntry[];
  socket: WebSocket | null;
}

export type ChenQueryLikeWorkspaceTab = ChenQueryConsoleTab | ChenPromptConsoleTab;

export type ChenDataViewPropertyTab =
  | "basic"
  | "columns"
  | "indexes"
  | "foreignKeys"
  | "constraints"
  | "ddl"
  | "diagram";

export interface ChenDataViewConsoleTab extends ChenTabDefinition {
  kind: "data-view";
  meta: ChenDataViewMeta | null;
  data: ChenDataViewDataset | null;
  state: ChenConsoleState;
  editState: ChenDataViewEditState;
  logs: string[];
  activePanel: "data" | "properties";
  activePropertyTab: ChenDataViewPropertyTab;
  whereCondition: string;
  socket: WebSocket | null;
}

export type ChenDatabaseSection = "basic" | "schemas" | "tables" | "views" | "indexes" | "ddl" | "diagram";

export interface ChenDatabaseWorkspaceTab extends ChenTabDefinition {
  kind: "database";
  node: ChenTreeNode;
  activeSection: ChenDatabaseSection;
  catalogLoaded: boolean;
  catalogLoading: boolean;
  catalogError: string;
  logs: string[];
  socket: null;
}

export interface ChenCreateTableColumn {
  id: string;
  name: string;
  type: string;
  size: string;
  nullable: boolean;
  primaryKey: boolean;
}

export interface ChenCreateTableWorkspaceTab extends ChenTabDefinition {
  kind: "create-table";
  tableName: string;
  columns: ChenCreateTableColumn[];
  dbType: string;
  parentNode: ChenTreeNode;
  state: ChenConsoleState;
  logs: string[];
  submitting: boolean;
  executionStarted: boolean;
  submitError: string;
  created: boolean;
  generatedSql: string;
  socket: WebSocket | null;
}

export interface ChenTableStructureColumn extends ChenCreateTableColumn {
  originalName: string;
  originalType: string;
  originalSize: string;
  originalNullable: boolean;
  added: boolean;
  deleted: boolean;
}

export interface ChenTableStructureWorkspaceTab extends ChenTabDefinition {
  kind: "table-structure";
  schemaName: string;
  tableName: string;
  columns: ChenTableStructureColumn[];
  dbType: string;
  sourceTabId: string;
  state: ChenConsoleState;
  logs: string[];
  submitting: boolean;
  executionStarted: boolean;
  submitError: string;
  saved: boolean;
  generatedSql: string;
  socket: WebSocket | null;
}

export type ChenDataViewAction =
  | "first_page"
  | "prev_page"
  | "next_page"
  | "last_page"
  | "refresh"
  | "change_limit"
  | "change_filter"
  | "toggle_pinned"
  | "export"
  | "save_changes_preview"
  | "save_changes";

export type ChenDataViewActionData = number | string | ChenDataViewExportOptions | ChenSaveChangesPayload;

export type ChenDataViewActionTarget = ChenQueryResultTab | ChenDataViewConsoleTab;

export type ChenWorkspaceTab =
  | ChenQueryLikeWorkspaceTab
  | ChenDataViewConsoleTab
  | ChenDatabaseWorkspaceTab
  | ChenCreateTableWorkspaceTab
  | ChenTableStructureWorkspaceTab;

export interface ChenSocketAction {
  type: string;
  data?: any;
}
