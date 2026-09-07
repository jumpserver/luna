export type PlanDatabase = "postgresql" | "mysql" | "mariadb" | "oracle" | "sqlserver" | "db2" | "dm" | "clickhouse";
export type PlanMode = "ESTIMATED";
export type PlanStatus =
  | "SUCCESS"
  | "RAW_ONLY"
  | "UNSUPPORTED_STATEMENT"
  | "UNSUPPORTED_DATABASE"
  | "PREREQUISITES_UNMET"
  | "ERROR"
  | "CANCELLED"
  | "CONNECTION_INVALIDATED";
export type PlanRawFormat = "JSON" | "XML" | "TEXT" | "TABLE";
export type PlanTransactionPolicy = "STATEMENT_ONLY" | "SAVEPOINT_IF_ACTIVE" | "AUXILIARY_DML" | "RESTORE_SESSION";
export type ChenNormalizedNodeType =
  | "SCAN"
  | "INDEX_SCAN"
  | "INDEX_ONLY_SCAN"
  | "JOIN"
  | "HASH_JOIN"
  | "MERGE_JOIN"
  | "NESTED_LOOP"
  | "SORT"
  | "AGGREGATE"
  | "FILTER"
  | "LIMIT"
  | "SUBQUERY"
  | "HASH"
  | "PARALLEL"
  | "UNION"
  | "VALUES"
  | "MATERIALIZE"
  | "PROJECTION"
  | "OTHER";
export interface ChenExecutionPlanCapabilities {
  supported: boolean;
  structured: boolean;
  raw: boolean;
  cost: boolean;
  estimatedRows: boolean;
  predicates: boolean;
  twoStep: boolean;
  requiresSessionState: boolean;
  requiresPlanTable: boolean;
  transactionPolicy: PlanTransactionPolicy;
}
export interface PlanPrerequisite {
  code: string;
  status: "MET" | "UNMET" | "UNKNOWN";
  message: string;
  remediation: string | null;
}
export interface PlanEffects {
  sessionState: "UNCHANGED" | "RESTORED" | "UNKNOWN";
  transactionState: "UNCHANGED" | "PARTICIPATED" | "FAILED" | "UNKNOWN";
  auxiliaryStorage: "NONE" | "CLEANED" | "RESIDUAL" | "UNKNOWN";
  connectionDisposition: "REUSE" | "DISCARD";
}
export interface PlanDiagnostic {
  code: string;
  message: string;
  sqlState: string | null;
  vendorCode: string | null;
}
export interface ChenPlanNode {
  id: string;
  nativeId: string | null;
  nodeType: ChenNormalizedNodeType;
  nativeOperator: string;
  logicalOperator: string | null;
  physicalOperator: string | null;
  detail: string | null;
  table: string | null;
  relation: string | null;
  rows: number | null;
  cost: number | null;
  startupCost: number | null;
  rowsMeaning: string | null;
  costMeaning: string | null;
  predicates: Record<string, string>;
  attributes: Record<string, string>;
  children: ChenPlanNode[];
}
export interface ChenExecutionPlan {
  requestId: string;
  database: PlanDatabase | null;
  serverVersion: string | null;
  mode: PlanMode;
  status: PlanStatus;
  sql: string;
  roots: ChenPlanNode[];
  rawText: string | null;
  rawFormat: PlanRawFormat | null;
  rawFormatVersion: string | null;
  rawTruncated: boolean;
  capabilities: ChenExecutionPlanCapabilities;
  prerequisites: PlanPrerequisite[];
  effects: PlanEffects;
  error: PlanDiagnostic | null;
  warnings: PlanDiagnostic[];
}

export type ChenQueryBottomPane = "results" | "plan";
