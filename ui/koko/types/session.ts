import type { ClipboardPermission, ClipboardPolicy } from "./clipboard";

export interface SettingConfig {
  INTERFACE?: { favicon?: string };
  SECURITY_SESSION_SHARE?: boolean;
}

export interface OnlineUser {
  user_id: string;
  user: string;
  created: string;
  remote_addr: string;
  terminal_id: string;
  primary: boolean;
  writable: boolean;
}

export interface ShareUserOptions {
  id: string;
  name: string;
  username: string;
}

export interface TerminalSessionInfo {
  session: { ip: string; id: string; user: string; asset: string; userId: string };
  permission: ClipboardPermission;
  clipboard_policy?: ClipboardPolicy | null;
  backspaceAsCtrlH: boolean;
  ctrlCAsCtrlZ: boolean;
  themeName: string;
}
