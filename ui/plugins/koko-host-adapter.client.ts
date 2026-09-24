import type {
  KokoHostAdapter,
  KokoPreparedSftpAsset,
  KokoSftpAsset,
  KokoSftpConnectionChoice,
  KokoWorkspaceTab
} from "#koko/host";

import { resolveEndpointUrl } from "@jumpserver/connectors-core";
import { HeaderOrganizationSelector, SideBarAssetTree } from "#components";
import { configureKokoThemeAdapter, kokoHostAdapterKey } from "#koko/host";
import { SFTP_FILE_MANAGER_VALUE } from "~/composables/useConnectMethods";
import { exchangeConnectToken } from "~/composables/useConnectTokenExchange";
import {
  clearTerminalCommandHistory,
  getAuthenticatedTerminalCommandHistoryScope,
  loadTerminalCommandHistory,
  recordTerminalCommandHistory,
  subscribeTerminalCommandHistory
} from "~/composables/useTerminalCommandHistory";
import { useWorkspaceConnectors } from "~/composables/useWorkspaceConnectors";
import { clearWorkspaceSessionDetails, setWorkspaceSessionDetails } from "~/composables/useWorkspaceSessionDetails";
import { registerWorkspaceSessionCloseGuard, useWorkspaceTabs } from "~/composables/useWorkspaceTabs";
import { desktopFs, desktopInvoke } from "~/shared/desktop/bridge";
import {
  createHostCodeMirrorSyntaxTheme,
  createHostCodeMirrorTheme,
  ensureCodeMirrorThemeAdapters
} from "~/shared/theme/adapters/codeMirrorThemeHost";
import { ensureNamedXtermThemes, toXtermTheme } from "~/shared/theme/adapters/xterm";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { transformAssetDetail } from "~/utils";
import { hasReusableSavedConnection, needsInputSecret } from "~/utils/connection";
import { isDesktopRuntime } from "~/utils/runtime";

export default defineNuxtPlugin((nuxtApp) => {
  const { createKokoTicket } = useWorkspaceConnectors();
  const {
    canSplitWorkspace,
    markSessionConnected,
    markSessionDisconnected,
    markSessionFailed,
    setActiveSession,
    splitWorkspace,
    tabs
  } = useWorkspaceTabs();
  const userInfoStore = useUserInfoStore();
  const { currentSite, currentUser, loggedIn } = storeToRefs(userInfoStore);
  const { codeFontSize, isHydrated, terminalCommandSuggestionsEnabled, terminalThemePreset } = useSettingManager();

  const prepareSftpAsset = async (asset: KokoSftpAsset) => {
    const detail = await getAssetDetailRequest(asset.id, currentUser.value?.org?.id || "");
    return transformAssetDetail(asset.id, { name: asset.name, ...detail });
  };

  const useSftpSessionCreator = () => {
    const { displayUser, handleAssetConnection } = useAssetAction();
    const { open: openConnectionForm } = useConnectionFormModal();

    return async (asset: KokoPreparedSftpAsset, connection?: KokoSftpConnectionChoice) => {
      const preference = connection ? null : userInfoStore.getConnectionPreferenceForAsset(asset.id);
      const remembered = connection ? null : userInfoStore.getConnectionInfoForAsset(asset.id);
      const account = connection?.account || displayUser(asset.id, asset.permedAccounts);
      const accountId = connection?.accountId || preference?.accountId || remembered?.accountId;
      const selectedAccount =
        (accountId && asset.permedAccounts?.find((item) => item.id === accountId)) ||
        asset.permedAccounts?.find((item) => [item.name, item.username, item.alias].includes(account));
      const accountMode = connection?.accountMode || preference?.accountMode || remembered?.accountMode || "hosted";
      const requiresInput =
        (accountMode === "hosted" && needsInputSecret(selectedAccount) && !connection?.hostedSecret) ||
        (accountMode === "manual" &&
          !connection?.personalCredentialId &&
          !connection?.manualPassword &&
          (remembered?.accountMode !== accountMode ||
            !hasReusableSavedConnection({ ...asset, savedConnection: remembered || undefined }))) ||
        (accountMode === "dynamic" &&
          !connection?.dynamicPassword &&
          (remembered?.accountMode !== accountMode ||
            !hasReusableSavedConnection({ ...asset, savedConnection: remembered || undefined })));
      const info = requiresInput ? await openConnectionForm(asset, { protocol: "ssh" }) : null;
      if (requiresInput && !info) throw new Error("SFTP connection cancelled");
      const choice = info || connection;

      return new Promise<{ tokenId: string }>((resolve, reject) => {
        void handleAssetConnection(choice?.account || account, asset.id, "ssh", asset.permedAccounts, "sftp", {
          accountMode: choice?.accountMode || accountMode,
          accountId: choice?.accountId || accountId,
          manualUsername: choice?.manualUsername,
          manualPassword: choice?.manualPassword,
          hostedSecret: choice?.hostedSecret,
          inputSecretType: choice?.inputSecretType,
          personalCredentialId: choice?.personalCredentialId,
          personalCredentialVersion: choice?.personalCredentialVersion,
          personalCredentialSecretType: choice?.personalCredentialSecretType,
          savePersonalCredential: choice?.savePersonalCredential,
          dynamicPassword: choice?.dynamicPassword,
          connectMethod: SFTP_FILE_MANAGER_VALUE,
          orgId: currentUser.value?.org?.id || "",
          asset,
          onSessionReady: (payload) => {
            const tokenId = String(payload.id || payload.token?.id || "");
            if (!tokenId) {
              reject(new Error("服务端未返回 SFTP 连接令牌"));
              return;
            }
            resolve({ tokenId });
          },
          onSessionError: reject
        }).catch(reject);
      });
    };
  };

  const adapter: KokoHostAdapter = {
    createTicket: createKokoTicket,
    getSmartEndpoint: async (request, orgId) => {
      const site = isDesktopRuntime() ? currentSite.value : window.location.origin;
      // SSH/SFTP use Koko's HTTP transport, not the native SSH endpoint port.
      let protocol = "https";
      try {
        protocol = new URL(site).protocol.slice(0, -1);
      } catch {
        protocol = String(site).startsWith("http:") ? "http" : "https";
      }
      const endpoint = await getSmartEndpoint({ ...request, protocol }, orgId);
      const value = resolveEndpointUrl(endpoint, site);
      return {
        ...endpoint,
        value: isElectronRuntime()
          ? await desktopInvoke<string>("resolve_koko_endpoint", { endpointUrl: value })
          : value
      };
    },
    getWindowOrigin: () => window.location.origin,
    isDesktopRuntime,
    markSessionConnected,
    markSessionDisconnected,
    markSessionFailed: (tab: Pick<KokoWorkspaceTab, "id" | "assetId" | "protocol" | "account">, reason?: string) => {
      markSessionFailed(
        {
          tabId: tab.id,
          assetId: tab.assetId,
          protocol: tab.protocol || "",
          account: tab.account || ""
        },
        reason
      );
    },
    registerSessionCloseGuard: registerWorkspaceSessionCloseGuard,
    setSessionDetails: (tabId, details) => {
      setWorkspaceSessionDetails(tabId, details as Parameters<typeof setWorkspaceSessionDetails>[1]);
    },
    clearSessionDetails: clearWorkspaceSessionDetails,
    canSplitSession: (paneId, direction) => {
      const workspaceTab = tabs.value.find((tab) => tab.panes.some((pane) => pane.id === paneId));
      return workspaceTab ? canSplitWorkspace(workspaceTab.id, direction) : false;
    },
    splitSession: (paneId, direction) => {
      const workspaceTab = tabs.value.find((tab) => tab.panes.some((pane) => pane.id === paneId));
      if (!workspaceTab || !canSplitWorkspace(workspaceTab.id, direction)) return;
      splitWorkspace(workspaceTab.id, direction);
      setActiveSession(workspaceTab.id);
    },
    localFiles: desktopFs,
    terminalCommandSuggestions: {
      enabled: () => terminalCommandSuggestionsEnabled.value,
      scope: () =>
        getAuthenticatedTerminalCommandHistoryScope({
          authenticated: loggedIn.value,
          site: currentSite.value,
          userId: currentUser.value?.userId || ""
        }),
      loadHistory: loadTerminalCommandHistory,
      recordHistory: recordTerminalCommandHistory,
      clearHistory: clearTerminalCommandHistory,
      subscribeHistory: subscribeTerminalCommandHistory
    },
    sftp: {
      organizationSelector: HeaderOrganizationSelector,
      assetTree: SideBarAssetTree,
      currentOrganization: computed(() => {
        const org = currentUser.value?.org;
        return org ? { id: org.id, name: org.name } : null;
      }),
      prepareAsset: prepareSftpAsset,
      useSessionCreator: useSftpSessionCreator,
      exchangeConnectToken
    },
    theme: {
      xterm: toXtermTheme,
      codeMirror: createHostCodeMirrorTheme,
      codeMirrorSyntax: createHostCodeMirrorSyntaxTheme,
      codeFontSize: () => codeFontSize.value,
      ensureCodeMirror: async () => {
        await ensureCodeMirrorThemeAdapters();
      }
    }
  };

  configureKokoThemeAdapter(adapter.theme);
  watch(
    [isHydrated, terminalThemePreset],
    ([hydrated, preset]) => {
      if (hydrated && preset !== "follow-app") void ensureNamedXtermThemes();
    },
    { immediate: true }
  );
  nuxtApp.vueApp.provide(kokoHostAdapterKey, adapter);
});
