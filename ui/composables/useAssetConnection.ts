import type { AssetItem } from "~/types/index";
import { useUserInfoStore } from "~/store/modules/userInfo";

type ConnectionInfo = {
  protocol: string;
  account: string;
  accountId?: string;
  accountMode: "hosted" | "dynamic" | "manual";
  manualUsername: string;
  manualPassword: string;
  dynamicPassword: string;
  rememberSecret: boolean;
};

export function useAssetConnection() {
  const { handleAssetConnection, displayUser, displayProtocol } = useAssetAction();
  const userInfoStore = useUserInfoStore();

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
          dynamicPassword: ""
        }
      );
    } else {
      // 否则需要打开编辑模态框
      return { needsModal: true, asset };
    }
  };

  /**
   * 仅保存连接信息（不触发连接）
   */
  const saveConnectionInfo = (asset: AssetItem, connectionInfo: ConnectionInfo) => {
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

    userInfoStore.setConnectionInfoForAsset(asset.id, {
      protocol: connectionInfo.protocol,
      username: connectionInfo.account,
      accountId: resolvedAccountId,
      accountMode: connectionInfo.accountMode,
      manualUsername: connectionInfo.rememberSecret ? connectionInfo.manualUsername : "",
      manualPassword: connectionInfo.rememberSecret ? connectionInfo.manualPassword : "",
      dynamicPassword: connectionInfo.rememberSecret ? connectionInfo.dynamicPassword : "",
      rememberSecret: connectionInfo.rememberSecret
    });
  };

  /**
   * 处理连接确认（从模态框）
   */
  const confirmConnection = (asset: AssetItem, connectionInfo: ConnectionInfo) => {
    saveConnectionInfo(asset, connectionInfo);

    handleAssetConnection(
      connectionInfo.account,
      asset.id,
      connectionInfo.protocol,
      asset.permedAccounts!,
      undefined,
      {
        accountMode: connectionInfo.accountMode,
        manualUsername: connectionInfo.manualUsername,
        manualPassword: connectionInfo.manualPassword,
        dynamicPassword: connectionInfo.dynamicPassword
      }
    );
  };

  return {
    connectAsset,
    confirmConnection,
    saveConnectionInfo
  };
}
