import type { UnlistenFn } from "@tauri-apps/api/event";
import type { ConnectionBody, PermedAccount, PermedProtocol, TokenResponse } from "~/types";

import { useUserInfoStore } from "~/store/modules/userInfo";
import { useSettingManager } from "~/composables/useSettingManager";

let tauriListenersInitialized = false;
let tauriListenersRegistering = false;
let tauriListenersRefCount = 0;
let unlistenGetTokenFailure: UnlistenFn | null = null;
let unlistenGetTokenSuccess: UnlistenFn | null = null;
let unlistenFavoriteSuccess: UnlistenFn | null = null;
let unlistenFavoriteFailed: UnlistenFn | null = null;
let unlistenUnfavoriteSuccess: UnlistenFn | null = null;
let unlistenUnfavoriteFailed: UnlistenFn | null = null;
let unlistenGetAssetDetailSuccess: UnlistenFn | null = null;
let unlistenGetAssetDetailFailed: UnlistenFn | null = null;
let unlistenRenameSuccess: UnlistenFn | null = null;
let unlistenRenameError: UnlistenFn | null = null;

function releaseTauriEventListeners() {
  tauriListenersRefCount = Math.max(tauriListenersRefCount - 1, 0);
  if (!tauriListenersInitialized || tauriListenersRegistering) return;
  if (tauriListenersRefCount === 0) {
    unlistenGetTokenSuccess?.();
    unlistenFavoriteSuccess?.();
    unlistenFavoriteFailed?.();
    unlistenGetTokenFailure?.();
    unlistenUnfavoriteSuccess?.();
    unlistenUnfavoriteFailed?.();
    unlistenGetAssetDetailSuccess?.();
    unlistenGetAssetDetailFailed?.();
    unlistenRenameSuccess?.();
    unlistenRenameError?.();
    unlistenGetTokenFailure = null;
    unlistenGetTokenSuccess = null;
    unlistenFavoriteSuccess = null;
    unlistenUnfavoriteFailed = null;
    unlistenUnfavoriteSuccess = null;
    unlistenFavoriteFailed = null;
    unlistenGetAssetDetailSuccess = null;
    unlistenGetAssetDetailFailed = null;
    unlistenRenameSuccess = null;
    unlistenRenameError = null;
    tauriListenersInitialized = false;
  }
}

export const useAssetAction = () => {
  const connectToken = ref<string | null>(null);

  const { t } = useI18n();
  const toast = useToast();
  const userInfoStore = useUserInfoStore();
  const settingManager = useSettingManager();
  // prettier-ignore
  const { currentSite, currentUser, currentConnectionInfoMap, currentRdpClientOption, orgId } = storeToRefs(userInfoStore);
  const {
    charset,
    rdpResolution,
    backspaceAsCtrlH,
    keyboardLayout,
    rdpClientOption,
    rdpColorQuality,
    rdpSmartSize
  } = settingManager;

  /**
   * @description 展示 user 信息,默认展示非 @ 开头的 user
   * @param assetId
   * @returns
   */
  const displayUser = (assetId: string, accounts?: PermedAccount[]) => {
    const saved = currentConnectionInfoMap.value[assetId];

    if (saved?.username) return saved.username;

    const list = accounts || [];
    const acc = list.find((a) => a && a.alias && !a.alias.startsWith("@"));

    return acc?.name || "-";
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
    // prettier-ignore
    const isManual = saved?.accountMode === "manual" || username === "手动输入" || username === "Manual input";

    const isDynamic =
      saved?.accountMode === "dynamic" || username.includes("同名账号") || username.includes("Dynamic user");

    // 已保存过托管账号的 ID 则优先使用
    if (!isManual && !isDynamic && saved?.accountId) {
      return saved.accountId as any;
    }
    if (isManual) return "@INPUT";
    if (isDynamic) return "@USER";

    if (username) {
      const matched = _accounts.find((a) => a.username === username || a.alias === username || a.name === username);
      if (matched) return matched.id;
    }

    return _accounts[0]?.id || "";
  };

  /**
   * @description 获取连接令牌
   */
  const getConnectToken = (body: ConnectionBody) => {
    const rdpParams = buildLocalRdpParams();
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
      },
      rdpParams
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
  const resolveGraphicsPreferences = () => {
    const resolvedKeyboardLayout =
      keyboardLayout.value || currentRdpClientOption.value.keyboard_layout || "en-us-qwerty";
    const resolvedClientOptions =
      (Array.isArray(rdpClientOption.value) && rdpClientOption.value.length > 0
        ? [...rdpClientOption.value]
        : [...(currentRdpClientOption.value.rdp_client_option || [])]);
    const resolvedColorQuality =
      rdpColorQuality.value || currentRdpClientOption.value.rdp_color_quality || "32";
    const resolvedSmartSize =
      rdpSmartSize.value || currentRdpClientOption.value.rdp_smart_size || "0";

    return {
      resolvedCharset: (charset.value || "default") as string,
      resolvedBackspace: backspaceAsCtrlH.value ?? false,
      resolvedResolution: (rdpResolution.value || "auto") as string,
      resolvedKeyboardLayout,
      resolvedClientOptions,
      resolvedColorQuality,
      resolvedSmartSize
    };
  };

  const generateConnectOptions = () => {
    const prefs = resolveGraphicsPreferences();

    return {
      charset: prefs.resolvedCharset,
      is_backspace_as_ctrl_h: prefs.resolvedBackspace,
      resolution: prefs.resolvedResolution,
      rdp_resolution: prefs.resolvedResolution,
      keyboard_layout: prefs.resolvedKeyboardLayout,
      rdp_client_option: prefs.resolvedClientOptions,
      rdp_color_quality: prefs.resolvedColorQuality,
      rdp_smart_size: prefs.resolvedSmartSize
    };
  };

  const buildLocalRdpParams = () => {
    const prefs = resolveGraphicsPreferences();
    const params: Record<string, string> = {};

    if (prefs.resolvedResolution && prefs.resolvedResolution.includes("x")) {
      const [width, height] = prefs.resolvedResolution.split("x");
      if (width) params.width = width;
      if (height) params.height = height;
    }

    const options = prefs.resolvedClientOptions || [];
    if (options.includes("full_screen")) {
      params.full_screen = "1";
    }
    if (options.includes("multi_screen")) {
      params.multi_mon = "1";
    }
    if (options.includes("drives_redirect")) {
      params.drives_redirect = "1";
    }

    params.rdp_smart_size = prefs.resolvedSmartSize;
    params.rdp_color_quality = prefs.resolvedColorQuality;

    return params;
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
    accounts?: PermedAccount[],
    protocolOverride?: string,
    ephemeral?: {
      accountMode?: "hosted" | "dynamic" | "manual";
      manualUsername?: string;
      manualPassword?: string;
      dynamicPassword?: string;
    }
  ) => {
    const saved = currentConnectionInfoMap.value[assetId];

    // 以已保存的账号模式为准；未保存时回退临时模式
    const effectiveMode = saved?.accountMode ?? ephemeral?.accountMode;
    const selected = saved?.username ?? user;

    let input_username = "";
    let input_secret = "";

    // 根据展示选择反查账号对象（name/username/alias 任意匹配）
    const _accounts = accounts || [];
    const matchedAccount = _accounts.find(
      (a) => a.username === selected || a.alias === selected || a.name === selected
    );

    if (effectiveMode === "manual" || selected === "手动输入" || selected === "Manual input") {
      // prettier-ignore
      input_username = ephemeral?.manualUsername ?? saved?.manualUsername ?? matchedAccount?.username ?? "";
      input_secret = ephemeral?.manualPassword ?? saved?.manualPassword ?? "";
    } else if (effectiveMode === "dynamic" || selected?.includes("同名账号") || selected?.includes("Dynamic user")) {
      // 同名账号仅需传递密码
      input_username = "";
      input_secret = ephemeral?.dynamicPassword ?? saved?.dynamicPassword ?? "";
    } else {
      // 托管账号：account 用 ID，input_username 用展示账号名
      input_username = selected || matchedAccount?.username || "";
      input_secret = "";
    }

    const protocol = protocolOverride || displayProtocol;

    const accountForToken = (() => {
      if (effectiveMode === "manual" || selected === "手动输入" || selected === "Manual input") {
        return "@INPUT";
      }
      if (effectiveMode === "dynamic" || selected?.includes("同名账号") || selected?.includes("Dynamic user")) {
        return "@USER";
      }

      return getUserId(accounts!, assetId, user);
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

  /**
   * @description 处理重命名
   * @param assetId
   * @param name
   * @returns
   */
  const handleAssetRename = (assetId: string, name: string) => {
    if (!currentSite.value || !currentUser.value?.headerJson) return;

    useTauriCoreInvoke("rename", {
      site: currentSite.value,
      cookieHeader: currentUser.value.headerJson,
      assetId,
      orgId: orgId.value,
      name
    });
  };

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

  /**
   * @description 处理取消收藏
   * @param assetId
   */
  const handleAssetUnfavorite = (assetId: string) => {
    useTauriCoreInvoke("unfavorite", {
      site: currentSite.value,
      cookieHeader: currentUser.value!.headerJson,
      assetId
    });
  };

  /**
   * @description 获取详情
   * @param assetId
   */
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

      unlistenGetTokenFailure = await useTauriEventListen("get-token-failure", (event) => {
        interface eventPayload {
          status: number;
          data: string;
        }

        const payload = event.payload as eventPayload;
        const errorData = JSON.parse(payload.data);
        const errorCode = errorData?.code as string;
        
        if (errorCode && errorCode.includes('acl')) {
          return toast.add({
            title: t("ConnectError.ConnectFailed"),
            description: t("ConnectError.AclFailed"),
            color: "error",
            icon: "line-md:close-circle"
          });
        }

        toast.add({
          title: t("ConnectError.ConnectFailed"),
          description: errorData.detail,
          color: "error",
          icon: "line-md:close-circle"
        });
      });

      unlistenFavoriteSuccess = await useTauriEventListen("set-favorite-success", (event) => {
        interface eventPayload {
          status: string;
        }

        const payload = event.payload as eventPayload;
        if (payload.status === "success") {
          toast.add({
            title: t("ContextMenu.FavoriteSuccess"),
            color: "primary",
            icon: "line-md:check-all"
          });
        }
      });

      unlistenFavoriteFailed = await useTauriEventListen("set-favorite-failure", (event) => {
        interface eventPayload {
          status: string;
        }

        const payload = event.payload as eventPayload;
        if (payload.status === "failed") {
          toast.add({
            title: t("ContextMenu.FavoriteFailed"),
            color: "error",
            icon: "line-md:close-circle"
          });
        }
      });

      unlistenUnfavoriteSuccess = await useTauriEventListen("unfavorite-success", (event) => {
        interface eventPayload {
          status: string;
        }

        const payload = event.payload as eventPayload;
        if (payload.status === "success") {
          toast.add({
            title: t("ContextMenu.UnfavoriteSuccess"),
            color: "primary",
            icon: "line-md:check-all"
          });
        }
      });

      unlistenUnfavoriteFailed = await useTauriEventListen("unfavorite-failure", (event) => {
        interface eventPayload {
          status: string;
        }

        const payload = event.payload as eventPayload;
        if (payload.status === "failed") {
          toast.add({
            title: t("ContextMenu.UnfavoriteFailed"),
            color: "error",
            icon: "line-md:close-circle"
          });
        }
      });

      unlistenGetAssetDetailSuccess = await useTauriEventListen("get-asset-detail-success", (event) => {
        interface eventPayload {
          status: string;
          data: string;
          asset_id: string;
        }

        const payload = event.payload as eventPayload;

        if (payload.status === "success") {
          const assetDetail = JSON.parse(payload.data) as any;
          const permedAccounts = assetDetail.permed_accounts ?? [];
          const permedProtocols = assetDetail.permed_protocols ?? [];

          useEventBus().emit("assetDetailUpdated", {
            assetId: payload.asset_id,
            permedAccounts: permedAccounts,
            permedProtocols: permedProtocols
          });
        }
      });

      // TODO 提示
      unlistenGetAssetDetailFailed = await useTauriEventListen("get-asset-detail-failure", (event) => {
        interface eventPayload {
          status: string;
        }
      });

      unlistenRenameSuccess = await useTauriEventListen("rename-success", (event) => {
        interface eventPayload {
          success: boolean;
          status?: number;
          data?: string;
        }

        const payload = event.payload as eventPayload;
        let assetId = "";
        let name = "";

        try {
          if (payload.data) {
            const info = JSON.parse(payload.data) as any;
            assetId = info?.asset || info?.asset_id || info?.id || "";
            name = info?.name || "";
          }
        } catch {}

        // 更新资产名称
        if (assetId && name) {
          try {
            useEventBus().emit("assetRenamed", { assetId, name });
          } catch {}
        }
      });

      unlistenRenameError = await useTauriEventListen("rename-error", (event) => {
        interface eventPayload {
          success: boolean;
          status?: number;
          data?: string;
        }

        const payload = event.payload as eventPayload;
        let message = "";
        try {
          const err = payload.data ? JSON.parse(payload.data) : {};
          message = err?.detail || (Array.isArray(err?.asset) ? err.asset[0] : "");
        } catch {}

        toast.add({
          title: t("AssetCard.RenameFail"),
          description: message || t("Common.OperationFailed"),
          color: "error",
          icon: "line-md:close-circle"
        });
      });

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
    handleAssetUnfavorite,
    handleAssetConnection
  };
};
