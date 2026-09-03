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

export type ChenDataViewPropertyTab =
  | "basic"
  | "columns"
  | "indexes"
  | "foreignKeys"
  | "constraints"
  | "ddl"
  | "diagram";

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
