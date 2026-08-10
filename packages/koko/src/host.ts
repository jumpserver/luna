import type { Extension } from "@codemirror/state";
import type { ITheme } from "@xterm/xterm";
import type { Component, InjectionKey, Ref } from "vue";

import { inject } from "vue";

export interface KokoWorkspaceTab {
  id: string;
  assetId: string;
  assetName?: string;
  protocol?: string;
  account?: string;
  payload?: Record<string, any>;
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
  permedAccounts?: Array<Record<string, unknown>>;
  permedProtocols?: Array<{ name?: string }>;
  [key: string]: unknown;
}

export interface KokoSftpHostAdapter {
  organizationSelector: Component;
  assetTree: Component;
  currentOrganization: Ref<{ id: string; name: string } | null>;
  prepareAsset: (asset: KokoSftpAsset) => Promise<KokoSftpAsset>;
  useSessionCreator: () => (asset: KokoSftpAsset) => Promise<{ tokenId: string }>;
  exchangeConnectToken: (tokenId: string) => Promise<{ id: string }>;
}

export interface KokoThemeAdapter {
  xterm: () => ITheme;
  codeMirror: () => Extension;
  codeMirrorSyntax: () => Extension;
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
