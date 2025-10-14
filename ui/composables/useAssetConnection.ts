import type { AssetItem } from "~/types/index";
import { useUserInfoStore } from "~/store/modules/userInfo";

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
   * 处理连接确认（从模态框）
   */
  const confirmConnection = (
    asset: AssetItem,
    connectionInfo: {
      protocol: string;
      account: string;
      accountMode: "hosted" | "dynamic" | "manual";
      manualUsername: string;
      manualPassword: string;
      dynamicPassword: string;
      rememberSecret: boolean;
    }
  ) => {
    // 保存连接信息
    userInfoStore.setConnectionInfoForAsset(asset.id, {
      protocol: connectionInfo.protocol,
      username: connectionInfo.account,
      accountMode: connectionInfo.accountMode,
      manualUsername: connectionInfo.rememberSecret ? connectionInfo.manualUsername : "",
      manualPassword: connectionInfo.rememberSecret ? connectionInfo.manualPassword : "",
      dynamicPassword: connectionInfo.rememberSecret ? connectionInfo.dynamicPassword : "",
      rememberSecret: connectionInfo.rememberSecret
    });

    // 执行连接
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
    confirmConnection
  };
}
