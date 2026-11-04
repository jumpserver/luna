export interface ChenTabDefinition {
  id: string;
  title: string;
  icon?: string;
  kind: "query" | "data-view" | "console" | "database" | "create-table" | "table-structure";
  nodeKey: string;
  serverConsoleId?: string;
  connectionError?: string;
}
