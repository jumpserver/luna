import type { ChenSchemaOverview } from "./schemaOverview";
import type { ChenTableMetadata, ChenTableMetadataSection } from "./tableMetadata";
import type { ChenTabDefinition, ChenTreeNode } from "./base";
import type { ChenDataViewDataset, ChenDataViewEditState, ChenDataViewMeta, ChenDataViewPropertyTab } from "./dataView";
import type { ChenConsoleState, ChenQueryLikeWorkspaceTab, ChenQueryResultTab } from "./console";

export interface ChenDataViewConsoleTab extends ChenTabDefinition {
  kind: "data-view";
  meta: ChenDataViewMeta | null;
  data: ChenDataViewDataset | null;
  state: ChenConsoleState;
  editState: ChenDataViewEditState;
  logs: string[];
  activePanel: "data" | "properties";
  activePropertyTab: ChenDataViewPropertyTab;
  tableMetadata: ChenTableMetadata | null;
  tableMetadataLoadingSections: ChenTableMetadataSection[];
  tableMetadataError: string;
  whereCondition: string;
  socket: WebSocket | null;
}

export type ChenDatabaseSection = "basic" | "schemas" | "tables" | "views" | "indexes" | "ddl" | "diagram";

export interface ChenDatabaseWorkspaceTab extends ChenTabDefinition {
  kind: "database";
  node: ChenTreeNode;
  schemaOverview: ChenSchemaOverview | null;
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

export type ChenDataViewActionTarget = ChenQueryResultTab | ChenDataViewConsoleTab;

export type ChenWorkspaceTab =
  | ChenQueryLikeWorkspaceTab
  | ChenDataViewConsoleTab
  | ChenDatabaseWorkspaceTab
  | ChenCreateTableWorkspaceTab
  | ChenTableStructureWorkspaceTab;
