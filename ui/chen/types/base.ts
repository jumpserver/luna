export interface ChenAuthResponse {
  token: string;
  lang: string;
}

export interface ChenProfile {
  dbType: string;
  canCopy: boolean;
  canPaste: boolean;
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

export interface ChenSocketAction {
  type: string;
  data?: any;
}
