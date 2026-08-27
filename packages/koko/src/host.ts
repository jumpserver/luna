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

const SENSITIVE_TERMINAL_COMMAND_PATTERNS = [
  /(?:^|[^a-z0-9])(?:password|passwd|token|secret|api[_-]?key|authorization)(?:[^a-z0-9]|$)/i,
  /(?:^|\s)--?(?:password|passwd|pass|token|secret|api[_-]?key)(?:=|\s)/i,
  /[a-z][a-z0-9+.-]*:\/\/[^\s/@]*:[^\s/@]+@/i,
  /\b(?:MYSQL_PWD|PGPASSWORD|REDISCLI_AUTH|AWS_SECRET_ACCESS_KEY|AZURE_CLIENT_SECRET)\s*=/i,
  /(?:^|\s)-u\s*[^\s:]+:[^\s]+/i,
  /(?:^|\s)AUTH\s+\S+/i,
  /\bHELLO\s+\d+\s+AUTH\s+\S+/i,
  /\bdb\.auth\s*\(/i,
  /(?:^|\s)(?:CONNECT|sqlplus)\s+\S+\/\S+/i
];

function hasExecutableShortOption(command: string, executable: RegExp, option: RegExp) {
  return command.split(/(?:&&|\|\||[;&|])/).some((segment) => {
    const match = executable.exec(segment);
    return Boolean(match && option.test(segment.slice(match.index + match[0].length)));
  });
}

function hasShortOptionCredential(command: string) {
  if (hasExecutableShortOption(command, /\bsshpass(?:\.exe)?\b/i, /(?:^|\s)-p(?:=|\s+)?\S+/)) return true;
  if (hasExecutableShortOption(command, /\bredis-cli(?:\.exe)?\b/i, /(?:^|\s)-a(?:=|\s+)?\S+/)) return true;
  if (hasExecutableShortOption(command, /\bsqlcmd(?:\.exe)?\b/i, /(?:^|\s)-P(?:=|\s+)?\S+/)) return true;
  return hasExecutableShortOption(
    command,
    /\b(?:mysql|mariadb|mysqldump|mysqladmin|mysqlsh|mycli)(?:\.exe)?\b/i,
    /(?:^|\s)-p(?:=|\s+)?\S+/
  );
}

function isTerminalCommandControlCharacter(value: string) {
  const code = value.codePointAt(0) || 0;
  return code < 32 || code === 127;
}

export function isSafeTerminalCommandHistory(command: unknown): command is string {
  return (
    typeof command === "string" &&
    command.length > 0 &&
    command.length <= 512 &&
    !Array.from(command).some(isTerminalCommandControlCharacter) &&
    !hasShortOptionCredential(command) &&
    !SENSITIVE_TERMINAL_COMMAND_PATTERNS.some((pattern) => pattern.test(command))
  );
}

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
