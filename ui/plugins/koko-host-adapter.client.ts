import type { KokoHostAdapter, KokoWorkspaceTab } from "@jumpserver/koko/host";
import type { AssetItem } from "~/types";

import { configureKokoThemeAdapter, kokoHostAdapterKey } from "@jumpserver/koko/host";
import OrganizationSelector from "~/components/Header/OrganizationSelector.vue";
import SideBarAssetTree from "~/components/SideBar/assetTree.vue";
import { SFTP_FILE_MANAGER_VALUE } from "~/composables/useConnectMethods";
import { exchangeConnectToken } from "~/composables/useConnectTokenExchange";
import { useWorkspaceConnectors } from "~/composables/useWorkspaceConnectors";
import { clearWorkspaceSessionDetails, setWorkspaceSessionDetails } from "~/composables/useWorkspaceSessionDetails";
import { registerWorkspaceSessionCloseGuard, useWorkspaceTabs } from "~/composables/useWorkspaceTabs";
import {
  createHostCodeMirrorSyntaxTheme,
  createHostCodeMirrorTheme,
  ensureCodeMirrorThemeAdapters
} from "~/shared/theme/adapters/codeMirrorThemeHost";
import { toXtermTheme } from "~/shared/theme/adapters/xterm";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { isTauriRuntime } from "~/utils/runtime";

export default defineNuxtPlugin((nuxtApp) => {
  const { createKokoTicket } = useWorkspaceConnectors();
  const { canSplitWorkspace, markSessionConnected, markSessionFailed, setActiveSession, splitWorkspace, tabs } =
    useWorkspaceTabs();
  const userInfoStore = useUserInfoStore();
  const { currentUser } = storeToRefs(userInfoStore);
  const { codeFontSize } = useSettingManager();

  const prepareSftpAsset = async (asset: AssetItem) => {
    let connectAsset = asset;
    if (!connectAsset.permedAccounts?.length || !connectAsset.permedProtocols?.length) {
      const detail = await getAssetDetailRequest(asset.id, currentUser.value?.org?.id || "");
      connectAsset = {
        ...connectAsset,
        permedAccounts: detail.permed_accounts ?? connectAsset.permedAccounts ?? [],
        permedProtocols: (detail.permed_protocols ?? connectAsset.permedProtocols ?? []).filter(
          (protocol: { name?: string }) => protocol?.name !== "winrm"
        )
      };
    }
    return connectAsset;
  };

  const useSftpSessionCreator = () => {
    const { displayUser, handleAssetConnection } = useAssetAction();

    return (asset: Awaited<ReturnType<typeof prepareSftpAsset>>) =>
      new Promise<{ tokenId: string }>((resolve, reject) => {
        const preference = userInfoStore.getConnectionPreferenceForAsset(asset.id);
        const remembered = userInfoStore.getConnectionInfoForAsset(asset.id);
        const account = displayUser(asset.id, asset.permedAccounts);
        void handleAssetConnection(account, asset.id, "ssh", asset.permedAccounts, "sftp", {
          accountMode: preference?.accountMode || remembered?.accountMode || "hosted",
          accountId: preference?.accountId || remembered?.accountId,
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

  const adapter: KokoHostAdapter = {
    createTicket: createKokoTicket,
    getSmartEndpoint: (request, orgId) => getSmartEndpoint(request, orgId),
    getWindowOrigin: () => window.location.origin,
    isTauriRuntime,
    markSessionConnected,
    markSessionFailed: (tab: Pick<KokoWorkspaceTab, "id" | "assetId" | "protocol" | "account">) => {
      markSessionFailed({
        tabId: tab.id,
        assetId: tab.assetId,
        protocol: tab.protocol,
        account: tab.account
      });
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
    sftp: {
      organizationSelector: OrganizationSelector,
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
  nuxtApp.vueApp.provide(kokoHostAdapterKey, adapter);
});
