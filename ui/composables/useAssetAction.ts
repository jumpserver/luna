import type { UnlistenFn } from "@tauri-apps/api/event";
import type { ConnectionBody, PermedAccount, PermedProtocol, TokenResponse } from "~/types";

import { useUserInfoStore } from "~/store/modules/userInfo";

let tauriListenersInitialized = false;
let tauriListenersRegistering = false;
let tauriListenersRefCount = 0;
let unlistenGetTokenSuccess: UnlistenFn | null = null;
let unlistenFavoriteSuccess: UnlistenFn | null = null;
let unlistenFavoriteFailed: UnlistenFn | null = null;
let unlistenGetAssetDetailSuccess: UnlistenFn | null = null;
let unlistenGetAssetDetailFailed: UnlistenFn | null = null;

function releaseTauriEventListeners() {
  tauriListenersRefCount = Math.max(tauriListenersRefCount - 1, 0);
  if (!tauriListenersInitialized || tauriListenersRegistering) return;
  if (tauriListenersRefCount === 0) {
    unlistenGetTokenSuccess?.();
    unlistenFavoriteSuccess?.();
    unlistenFavoriteFailed?.();
    unlistenGetAssetDetailSuccess?.();
    unlistenGetAssetDetailFailed?.();
    unlistenGetTokenSuccess = null;
    unlistenFavoriteSuccess = null;
    unlistenFavoriteFailed = null;
    unlistenGetAssetDetailSuccess = null;
    unlistenGetAssetDetailFailed = null;
    tauriListenersInitialized = false;
  }
}

export const useAssetAction = () => {
  const connectToken = ref<string | null>(null);

  const userInfoStore = useUserInfoStore();
  // prettier-ignore
  const { currentSite, currentUser, currentConnectionInfoMap, currentRdpClientOption } = storeToRefs(userInfoStore);
  const { setConnectionInfoForAsset, getConnectionInfoForAsset } = userInfoStore;

  /**
   * @description 展示 user 信息,默认展示非 @ 开头的 user
   * @param assetId
   * @returns
   */
  const displayUser = (assetId: string, accounts: PermedAccount[]) => {
    const saved = currentConnectionInfoMap.value[assetId];
    if (saved?.username) return saved.username;

    const acc = accounts.find((a) => a && a.alias && !a.alias.startsWith("@"));

    return acc?.username || "-";
  };

  /**
   * @description 展示 protocol 信息
   * @param assetId
   * @returns
   */
  const displayProtocol = (assetId: string, protocols: PermedProtocol[]) => {
    const saved = currentConnectionInfoMap.value[assetId];
    return saved?.protocol || protocols?.[0]?.name || "-";
  };

  /**
   * @description 获取 connect_token 接口需要的 account
   * @param accounts
   * @param assetId
   * @param user
   * @returns
   */
  const getUserId = (accounts: PermedAccount[], assetId: string, user: string) => {
    const _accounts = accounts || [];
    const saved = currentConnectionInfoMap.value[assetId];
    const username = saved?.username ?? user;

    // 同名账号 account 使用 @USER
    // 手动输入 account 使用 @INPUT
    const isManual =
      saved?.accountMode === "manual" || username === "手动输入" || username === "Manual input";

    const isDynamic =
      saved?.accountMode === "dynamic" ||
      username.includes("同名账号") ||
      username.includes("Dynamic user");

    if (isManual) return "@INPUT";
    if (isDynamic) return "@USER";

    if (username) {
      const matched = _accounts.find(
        (a) => a.username === username || a.alias === username || a.name === username
      );
      if (matched) return matched.id;
    }

    return _accounts[0]?.id || "";
  };

  /**
   * @description 获取连接令牌
   */
  const getConnectToken = (body: ConnectionBody) => {
    useTauriCoreInvoke("get_connect_token", {
      site: currentSite.value,
      cookieHeader: currentUser.value!.headerJson,
      body: {
        asset: body.asset,
        account: body.account,
        protocol: body.protocol,
        input_username: body.input_username,
        input_secret: body.input_secret,
        connect_method: body.connect_method,
        connect_options: body.connect_options
      }
    });
  };

  /**
   * @description 根据协议分发连接方法
   * @param protocol
   * @returns
   */
  const dispatchConnectMethod = (protocol: string) => {
    let method = "";

    switch (protocol) {
      case "ssh":
      case "telnet":
        method = "ssh_client";
        break;
      case "rdp":
        method = "mstsc";
        break;
      case "sftp":
        method = "sftp_client";
        break;
      case "vnc":
        method = "vnc_client";
        break;
      default:
        method = "db_client";
    }

    return method;
  };

  /**
   * @description 生成连接选项
   * @returns
   */
  const generateConnectOptions = () => {
    return {
      charset: "default",
      is_backspace_as_ctrl_h: false,
      rdp_resolution: "auto",
      keyboard_layout: currentRdpClientOption.value.keyboard_layout || "en-us-qwerty",
      rdp_client_option: currentRdpClientOption.value.rdp_client_option || [],
      rdp_color_quality: currentRdpClientOption.value.rdp_color_quality || "32",
      rdp_smart_size: currentRdpClientOption.value.rdp_smart_size || "0"
    };
  };

  /**
   * @description 处理连接事件
   * @param user
   * @param assetId
   * @param displayProtocol
   * @param accounts
   * @param protocolOverride
   */
  const handleAssetConnection = (
    user: string,
    assetId: string,
    displayProtocol: string,
    accounts: PermedAccount[],
    protocolOverride?: string,
    ephemeral?: {
      accountMode?: "hosted" | "dynamic" | "manual";
      manualUsername?: string;
      manualPassword?: string;
      dynamicPassword?: string;
    }
  ) => {
    const saved = currentConnectionInfoMap.value[assetId];

    // 优先使用临时凭据（未勾选“记住密码”的一次性输入），否则回退到已保存的
    const effectiveMode = ephemeral?.accountMode ?? saved?.accountMode;
    const selected = saved?.username ?? user;

    let input_username = "";
    let input_secret = "";

    if (effectiveMode === "manual" || selected === "手动输入" || selected === "Manual input") {
      input_username = ephemeral?.manualUsername ?? saved?.manualUsername ?? "";
      input_secret = ephemeral?.manualPassword ?? saved?.manualPassword ?? "";
    } else if (
      effectiveMode === "dynamic" ||
      selected?.includes("同名账号") ||
      selected?.includes("Dynamic user")
    ) {
      // 同名账号仅需传递密码
      input_username = "";
      input_secret = ephemeral?.dynamicPassword ?? saved?.dynamicPassword ?? "";
    } else {
      input_username = "";
      input_secret = "";
    }

    const protocol = protocolOverride || displayProtocol;

    const accountForToken = (() => {
      if (effectiveMode === "manual" || selected === "手动输入" || selected === "Manual input") {
        return "@INPUT";
      }
      if (
        effectiveMode === "dynamic" ||
        selected?.includes("同名账号") ||
        selected?.includes("Dynamic user")
      ) {
        return "@USER";
      }
      return getUserId(accounts, assetId, user);
    })();

    nextTick(() => {
      getConnectToken({
        asset: assetId,
        protocol,
        input_username,
        input_secret,
        account: accountForToken,
        connect_method: dispatchConnectMethod(protocol),
        connect_options: generateConnectOptions()
      });
    });
  };

  const handleAssetRename = () => {};

  /**
   * @description 处理资产收藏
   * @param assetId
   */
  const handleAssetFavorite = (assetId: string) => {
    useTauriCoreInvoke("set_favorite", {
      site: currentSite.value,
      cookieHeader: currentUser.value!.headerJson,
      assetId
    });
  };

  const getAssetDetail = (assetId: string) => {
    useTauriCoreInvoke("get_asset_detail", {
      site: currentSite.value,
      cookieHeader: currentUser.value!.headerJson,
      assetId
    });
  };

  /**
   * @description 监听 tauri 事件
   */
  const listenTauriEvent = async () => {
    if (tauriListenersInitialized || tauriListenersRegistering) {
      tauriListenersRefCount++;
      return;
    }

    tauriListenersRegistering = true;

    try {
      unlistenGetTokenSuccess = await useTauriEventListen("get-token-success", (event) => {
        interface eventPayload {
          status: number;
          data: TokenResponse;
        }

        const payload = event.payload as eventPayload;

        if (payload.status === 201) {
          connectToken.value = payload.data.id;
        }
      });

      unlistenFavoriteSuccess = await useTauriEventListen("set-favorite-success", (event) => {
        interface eventPayload {
          status: string;
        }

        const payload = event.payload as eventPayload;

        console.log("listenFavoriteSuccessEvent", payload);
      });

      unlistenFavoriteFailed = await useTauriEventListen("set-favorite-failure", (event) => {
        interface eventPayload {
          status: string;
        }

        const payload = event.payload as eventPayload;
        console.log("listenFavoriteFailedEvent", payload);
      });

      unlistenGetAssetDetailSuccess = await useTauriEventListen(
        "get-asset-detail-success",
        (event) => {
          interface eventPayload {
            status: string;
            data: string;
            asset_id: string;
          }

          const payload = event.payload as eventPayload;

          if (payload.status === "success") {
            const assetDetail = JSON.parse(payload.data);
            const permedAccounts = assetDetail.permedAccounts;
            const permedProtocols = assetDetail.permedProtocols;

            useEventBus().emit("assetDetailUpdated", {
              assetId: payload.asset_id,
              permedAccounts: permedAccounts,
              permedProtocols: permedProtocols
            });
          }
        }
      );

      // TODO 提示
      unlistenGetAssetDetailFailed = await useTauriEventListen(
        "get-asset-detail-failure",
        (event) => {
          interface eventPayload {
            status: string;
          }
        }
      );

      tauriListenersInitialized = true;
      tauriListenersRefCount++;
    } finally {
      tauriListenersRegistering = false;
    }
  };

  onMounted(() => {
    listenTauriEvent();
  });

  onBeforeUnmount(() => {
    releaseTauriEventListeners();
  });

  return {
    displayUser,
    getAssetDetail,
    displayProtocol,

    handleAssetRename,
    handleAssetFavorite,
    handleAssetConnection
  };
};
