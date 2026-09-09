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
  // koko marshals model.Session: `user` is the JumpServer login user rendered as
  // "Name(username)", `account` the asset account, `asset` a "name(address)" composite.
  session: { id: string; user: string; account: string; asset: string; remote_addr?: string; user_id?: string };
  permission: ClipboardPermission;
  clipboard_policy?: ClipboardPolicy | null;
  backspaceAsCtrlH: boolean;
  ctrlCAsCtrlZ: boolean;
  themeName: string;
}
