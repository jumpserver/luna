import type { AssetItem, ConnectionPreferenceInfo, ConnectionInfo as StoredConnectionInfo } from "~/types/index";
import { isConnectMethodAvailable } from "~/composables/useConnectMethods";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { sortPermedProtocols } from "~/utils";

export interface ConnectionFormInfo {
  protocol: string;
  account: string;
  manualUsername: string;
  manualPassword: string;
  dynamicPassword: string;
  rememberSecret: boolean;
  rememberSelection?: boolean;
  connectMethod: string;
  connectOptions?: Record<string, any>;

  accountId?: string;
  availableProtocols?: string[];
  tabId?: string;
  aclBatchId?: string;
  onSessionReady?: (payload: Record<string, any>) => void;
  onSessionError?: (error: unknown) => void;
  accountMode: "hosted" | "dynamic" | "manual" | "anonymous";
}

export function useAssetConnection() {
  const { handleAssetConnection, displayUser } = useAssetAction();
  const { getMethodsForProtocol } = useConnectMethods();
  const { appConfig } = useSettingManager();
  const userInfoStore = useUserInfoStore();

  const normalizeConnectionInfo = async (asset: AssetItem, connectionInfo: ConnectionFormInfo) => {
    const assetProtocols = sortPermedProtocols(asset.permedProtocols || [])
      .filter((protocol) => isDesktopRuntime() || protocol?.public !== false)
      .map((protocol) => protocol.name);
    const protocols = assetProtocols.length > 0 ? assetProtocols : connectionInfo.availableProtocols || [];
    const protocol = protocols.includes(connectionInfo.protocol) ? connectionInfo.protocol : protocols[0] || "";
    const accounts = asset.permedAccounts || [];

    let accountMode = connectionInfo.accountMode;
    let account = connectionInfo.account;
    let accountId = connectionInfo.accountId;
    const modeAlias = {
      manual: "@INPUT",
      dynamic: "@USER",
      anonymous: "@ANON"
    } as const;

    if (accountMode === "hosted") {
      const matched = accounts.find(
        (item) =>
          (accountId && item.id === accountId) ||
          item.name === account ||
          item.username === account ||
          item.alias === account
      );

      if (matched && !matched.alias.startsWith("@")) {
        account = matched.name;
        accountId = matched.id;
      } else {
        const fallback = accounts.find((item) => item.alias && !item.alias.startsWith("@"));
        if (fallback) {
          account = fallback.name;
          accountId = fallback.id;
        } else {
          const special = accounts.find((item) => ["@USER", "@INPUT", "@ANON"].includes(item.alias));
          accountMode = special?.alias === "@USER" ? "dynamic" : special?.alias === "@INPUT" ? "manual" : "anonymous";
          account = special?.name || special?.alias || "";
          accountId = undefined;
        }
      }
    } else if (!accounts.some((item) => item.alias === modeAlias[accountMode as keyof typeof modeAlias])) {
      const fallback = accounts.find((item) => item.alias && !item.alias.startsWith("@"));
      accountMode = "hosted";
      account = fallback?.name || "";
      accountId = fallback?.id;
    }

    let connectMethod = "";
    if (protocol) {
      try {
        const methods = await getMethodsForProtocol(protocol);
        connectMethod = isConnectMethodAvailable(connectionInfo.connectMethod, methods, protocol, appConfig.value)
          ? connectionInfo.connectMethod
          : methods[0]?.value || "";
      } catch {
        // The connection layer still has a local protocol default when the
        // method list is temporarily unavailable.
      }
    }

    return {
      ...connectionInfo,
      protocol,
      account,
      accountId,
      accountMode,
      connectMethod,
      availableProtocols: protocols
    };
  };

  /**
   * 处理资产连接
   */
  const connectAsset = (asset: AssetItem, protocol?: string) => {
    if (protocol) {
      // 如果有指定协议，直接连接
      handleAssetConnection(
        displayUser(asset.id, asset.permedAccounts!),
        asset.id,
        protocol,
        asset.permedAccounts!,
        undefined,
        {
          accountMode: "hosted",
          manualUsername: "",
          manualPassword: "",
          dynamicPassword: "",
          orgId: asset.org_id,
          asset
        }
      );
    } else {
      // 否则需要打开编辑模态框
      return { needsModal: true, asset };
    }
  };

  const saveConnectionPreference = (asset: AssetItem, connectionInfo: ConnectionFormInfo) => {
    let resolvedAccountId: string | undefined = connectionInfo.accountId;

    if (connectionInfo.accountMode === "hosted" && !resolvedAccountId) {
      const accs = asset.permedAccounts || [];
      const matched = accs.find(
        (a) =>
          a.name === connectionInfo.account ||
          a.username === connectionInfo.account ||
          a.alias === connectionInfo.account
      );

      resolvedAccountId = matched?.id;
    }

    const payload: ConnectionPreferenceInfo = {
      protocol: connectionInfo.protocol,
      username: connectionInfo.account,
      accountId: resolvedAccountId,
      accountMode: connectionInfo.accountMode,
      manualUsername: connectionInfo.manualUsername || "",
      connectMethod: connectionInfo.connectMethod,
      connectOptions: connectionInfo.connectOptions,
      availableProtocols: connectionInfo.availableProtocols
    };

    userInfoStore.setConnectionPreferenceForAsset(asset.id, payload);
    userInfoStore.setConnectionPreferenceForProtocol(connectionInfo.protocol, {
      connectMethod: connectionInfo.connectMethod
    });
  };

  /**
   * 仅保存连接信息（不触发连接）
   */
  const saveConnectionInfo = (asset: AssetItem, connectionInfo: ConnectionFormInfo) => {
    let resolvedAccountId: string | undefined = connectionInfo.accountId;

    const candidateProtocols = (
      connectionInfo.availableProtocols && connectionInfo.availableProtocols.length > 0
        ? connectionInfo.availableProtocols
        : (asset.permedProtocols || []).map((p) => (typeof p?.name === "string" ? p.name.trim() : ""))
    ) as string[];

    const availableProtocols = Array.from(
      new Set(candidateProtocols.map((name) => (typeof name === "string" ? name.trim() : "")).filter((name) => name))
    );

    if (connectionInfo.accountMode === "hosted" && !resolvedAccountId) {
      const accs = asset.permedAccounts || [];
      const matched = accs.find(
        (a) =>
          a.name === connectionInfo.account ||
          a.username === connectionInfo.account ||
          a.alias === connectionInfo.account
      );

      resolvedAccountId = matched?.id;
    }

    const payload: StoredConnectionInfo = {
      protocol: connectionInfo.protocol,
      username: connectionInfo.account,
      accountId: resolvedAccountId,
      accountMode: connectionInfo.accountMode,
      manualUsername: connectionInfo.rememberSecret ? connectionInfo.manualUsername : "",
      manualPassword: connectionInfo.rememberSecret ? connectionInfo.manualPassword : "",
      dynamicPassword: connectionInfo.rememberSecret ? connectionInfo.dynamicPassword : "",
      rememberSecret: connectionInfo.rememberSecret,
      connectMethod: connectionInfo.connectMethod,
      connectOptions: connectionInfo.connectOptions,
      availableProtocols
    };

    userInfoStore.setConnectionInfoForAsset(asset.id, payload);
  };

  /**
   * 处理连接确认（从模态框）
   */
  const confirmConnection = async (asset: AssetItem, connectionInfo: ConnectionFormInfo) => {
    const normalized = await normalizeConnectionInfo(asset, connectionInfo);
    saveConnectionPreference(asset, normalized);

    if (normalized.rememberSelection !== false) {
      saveConnectionInfo(asset, normalized);
    } else {
      userInfoStore.deleteConnectionInfoForAsset(asset.id);
    }

    handleAssetConnection(normalized.account, asset.id, normalized.protocol, asset.permedAccounts!, undefined, {
      accountMode: normalized.accountMode,
      accountId: normalized.accountId,
      manualUsername: normalized.manualUsername,
      manualPassword: normalized.manualPassword,
      dynamicPassword: normalized.dynamicPassword,
      connectMethod: normalized.connectMethod,
      connectOptions: normalized.connectOptions,
      tabId: normalized.tabId,
      aclBatchId: normalized.aclBatchId,
      onSessionReady: normalized.onSessionReady,
      onSessionError: normalized.onSessionError,
      orgId: asset.org_id,
      asset
    });
  };

  return {
    connectAsset,
    confirmConnection,
    saveConnectionInfo,
    saveConnectionPreference
  };
}
