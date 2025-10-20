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
        displayUser(asset.id, asset.permed_accounts!),
        asset.id,
        protocol,
        asset.permed_accounts!,
        undefined,
        {
          account_mode: "hosted",
          manual_username: "",
          manual_password: "",
          dynamic_password: ""
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
      account_mode: connectionInfo.accountMode,
      manual_username: connectionInfo.rememberSecret ? connectionInfo.manualUsername : "",
      manual_password: connectionInfo.rememberSecret ? connectionInfo.manualPassword : "",
      dynamic_password: connectionInfo.rememberSecret ? connectionInfo.dynamicPassword : "",
      remember_secret: connectionInfo.rememberSecret
    });

    // 执行连接
    handleAssetConnection(
      connectionInfo.account,
      asset.id,
      connectionInfo.protocol,
      asset.permed_accounts!,
      undefined,
      {
        account_mode: connectionInfo.accountMode,
        manual_username: connectionInfo.manualUsername,
        manual_password: connectionInfo.manualPassword,
        dynamic_password: connectionInfo.dynamicPassword
      }
    );
  };

  return {
    connectAsset,
    confirmConnection
  };
}
