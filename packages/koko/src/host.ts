import type { Extension } from "@codemirror/state";
import type { ITheme } from "@xterm/xterm";
import type { Component, InjectionKey, Ref } from "vue";

import { inject } from "vue";

export interface KokoWorkspaceTab {
  id: string;
  assetId: string;
  assetName?: string;
  assetPlatform?: string;
  assetType?: string;
  assetCategory?: string;
  protocol?: string;
  account?: string;
  payload?: Record<string, any>;
}

export type KokoTerminalCommandProfile =
  | "linux"
  | "windows"
  | "mysql"
  | "postgresql"
  | "redis"
  | "mongodb"
  | "oracle"
  | "sqlserver";

export interface KokoTerminalCommandSuggestionsAdapter {
  enabled: () => boolean;
  scope: () => string;
  loadHistory: (scope: string, profile: KokoTerminalCommandProfile) => Promise<string[]>;
  recordHistory: (scope: string, profile: KokoTerminalCommandProfile, command: string) => Promise<void>;
  clearHistory: (scope: string) => Promise<void>;
  subscribeHistory?: (
    scope: string,
    profile: KokoTerminalCommandProfile,
    listener: (history: string[]) => void
  ) => () => void;
}

export interface KokoEndpoint {
  host?: string;
  port?: string | number;
  https_port?: string | number;
  value?: string;
}

export interface KokoSftpAsset {
  id: string;
  name: string;
}

export interface KokoSftpAccount {
  alias: string;
  date_expired: string;
  has_secret: boolean;
  has_username: boolean;
  id: string;
  name: string;
  secret_type: string;
  username: string;
  actions: Array<{ label: string; value: string }>;
}

export interface KokoSftpProtocol {
  name: string;
  port: number;
  public: boolean;
  setting?: unknown;
}

export interface KokoPreparedSftpAsset extends KokoSftpAsset {
  address: string;
  platform: string;
  zone: string;
  isActive: boolean;
  category: string;
  type: string;
  user?: string;
  comment?: string;
  permedAccounts?: KokoSftpAccount[];
  permedProtocols?: KokoSftpProtocol[];
}

export interface KokoSftpHostAdapter {
  organizationSelector: Component;
  assetTree: Component;
  currentOrganization: Ref<{ id: string; name: string } | null>;
  prepareAsset: (asset: KokoSftpAsset) => Promise<KokoPreparedSftpAsset>;
  useSessionCreator: () => (asset: KokoPreparedSftpAsset) => Promise<{ tokenId: string }>;
  exchangeConnectToken: (tokenId: string) => Promise<{ id: string }>;
}

export interface KokoThemeAdapter {
  xterm: () => ITheme;
  codeMirror: () => Extension;
  codeMirrorSyntax: () => Extension;
  codeFontSize: () => number;
  ensureCodeMirror?: () => Promise<void>;
}

export interface KokoHostAdapter {
  createTicket: (request: { baseUrl: string; tokenId: string }) => Promise<{ ticket?: string }>;
  getSmartEndpoint: (
    request: { protocol: string; assetId: string; token: string },
    orgId?: string
  ) => Promise<KokoEndpoint>;
  getWindowOrigin: () => string;
  isTauriRuntime: () => boolean;
  markSessionConnected: (tabId: string) => void;
  markSessionFailed: (tab: Pick<KokoWorkspaceTab, "id" | "assetId" | "protocol" | "account">) => void;
  registerSessionCloseGuard?: (tabId: string, guard: () => boolean | Promise<boolean>) => () => void;
  setSessionDetails: (tabId: string, details: Record<string, unknown>) => void;
  clearSessionDetails: (tabId: string) => void;
  canSplitSession: (tabId: string, direction: "horizontal" | "vertical") => boolean;
  splitSession: (tabId: string, direction: "horizontal" | "vertical") => void;
  terminalCommandSuggestions?: KokoTerminalCommandSuggestionsAdapter;
  sftp: KokoSftpHostAdapter;
  theme: KokoThemeAdapter;
}

export const kokoHostAdapterKey: InjectionKey<KokoHostAdapter> = Symbol("koko-host-adapter");
let kokoThemeAdapter: KokoThemeAdapter | undefined;

export function configureKokoThemeAdapter(adapter: KokoThemeAdapter) {
  kokoThemeAdapter = adapter;
}

export function getKokoThemeAdapter() {
  if (!kokoThemeAdapter) throw new Error("Koko theme adapter not configured");
  return kokoThemeAdapter;
}

export function useKokoHostAdapter() {
  const adapter = inject(kokoHostAdapterKey);
  if (!adapter) throw new Error("KokoHostAdapter not provided");

  return adapter;
}
