import type { Terminal } from "@xterm/xterm";

export interface ITerminalSettings {
  fontSize: number
  lineHeight: number
  fontFamily: string
  themeName: string
  ctrlCAsCtrlZ: string
  quickPaste: string
  backspaceAsCtrlH: string
  theme: string
}

export interface ILunaConfig {
  fontSize?: number
  quickPaste?: string
  backspaceAsCtrlH?: string
  ctrlCAsCtrlZ?: string
  lineHeight?: number
  fontFamily: string
}

export interface SettingConfig {
  INTERFACE?: { favicon?: string }
  SECURITY_SESSION_SHARE?: boolean
}

export interface OnlineUser {
  user_id: string
  user: string
  created: string
  remote_addr: string
  terminal_id: string
  primary: boolean
  writable: boolean
}

export interface ShareUserOptions {
  id: string
  name: string
  username: string
}

export interface ConnectionState {
  origin: string
  lunaId: string
  shareId: string
  shareCode: string
  assetName: string
  sessionId: string
  terminalId: string
  enableShare: boolean
  terminal: Terminal
  socket: WebSocket | null
  userOptions: ShareUserOptions[]
  onlineUsers: OnlineUser[]
  drawerOpenState: boolean
  drawerTabIndex: number
}

export interface TerminalSessionInfo {
  session: { ip: string, id: string, user: string, asset: string, userId: string }
  permission: { actions: string[] }
  backspaceAsCtrlH: boolean
  ctrlCAsCtrlZ: boolean
  themeName: string
}

export interface TerminalContentResponse {
  terminalId: string
  content: string
  sessionId: string
}

export type ObjToKeyValArray<T> = {
  [K in keyof T]-?: [K, T[K]]
}[keyof T];
