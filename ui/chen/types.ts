export interface ChenAuthResponse {
  token: string
  lang: string
}

export interface ChenProfile {
  dbType: string
  canCopy: boolean
  canPaste: boolean
}

export interface ChenTreeNode {
  key: string
  name?: string
  label?: string
  type: string
  leaf?: boolean
  children?: ChenTreeNode[]
  [key: string]: any
}

export interface ChenActionItem {
  key: string
  label: string
  icon?: string
  children?: ChenActionItem[]
}

export interface ChenPacket<T = any> {
  type: string
  data: T
}

export interface ChenTabDefinition {
  id: string
  title: string
  icon?: string
  kind: "query" | "data-view" | "console"
  nodeKey: string
}

export interface ChenDataViewMeta {
  title: string
  schema?: string
  table?: string
  [key: string]: any
}

export interface ChenDataViewDataset {
  fields: Array<{ name: string }>
  data: Array<Record<string, any>>
}

export interface ChenConsoleState {
  loading?: boolean
  inQuery?: boolean
  canCancel?: boolean
  currentContext?: string
  contexts?: string[]
  title?: string
  limit?: number
  total?: number
  paged?: boolean
  pinned?: boolean
  [key: string]: any
}

export interface ChenQueryResultTab {
  id: string
  title: string
  meta: ChenDataViewMeta
  data: ChenDataViewDataset | null
}

export interface ChenConsoleHistoryEntry {
  id: string
  sql: string
}

export interface ChenQueryConsoleTab extends ChenTabDefinition {
  kind: "query"
  statement: string
  state: ChenConsoleState
  logs: string[]
  resultTabs: ChenQueryResultTab[]
  activeResultTabId: string
  socket: WebSocket | null
}

export interface ChenPromptConsoleTab extends ChenTabDefinition {
  kind: "console"
  pendingSql: string
  state: ChenConsoleState
  logs: string[]
  historyEntries: ChenConsoleHistoryEntry[]
  resultTabs: ChenQueryResultTab[]
  activeResultTabId: string
  socket: WebSocket | null
}

export type ChenQueryLikeWorkspaceTab = ChenQueryConsoleTab | ChenPromptConsoleTab;

export type ChenDataViewPropertyTab
  = | "basic"
    | "columns"
    | "indexes"
    | "foreignKeys"
    | "constraints"
    | "ddl";

export interface ChenDataViewConsoleTab extends ChenTabDefinition {
  kind: "data-view"
  meta: ChenDataViewMeta | null
  data: ChenDataViewDataset | null
  state: ChenConsoleState
  logs: string[]
  activePanel: "data" | "properties"
  activePropertyTab: ChenDataViewPropertyTab
  socket: WebSocket | null
}

export type ChenWorkspaceTab = ChenQueryLikeWorkspaceTab | ChenDataViewConsoleTab;

export interface ChenSocketAction {
  type: string
  data?: any
}
