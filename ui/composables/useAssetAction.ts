import type { UnlistenFn } from "@tauri-apps/api/event";
import type { AssetItem, ConnectionBody, PermedAccount, PermedProtocol, TokenResponse } from "~/types";

import { K8S_NATIVE_VALUE, SFTP_FILE_EDITOR_VALUE, SFTP_FILE_MANAGER_VALUE, WEB_DB_NATIVE_VALUE, WEB_RDP_NATIVE_VALUE } from "~/composables/useConnectMethods";
import { useSettingManager } from "~/composables/useSettingManager";
import { useUserInfoStore } from "~/store/modules/userInfo";

let tauriListenersInitialized = false;
let tauriListenersRegistering = false;
let tauriListenersRefCount = 0;
let unlistenGetTokenFailure: UnlistenFn | null = null;
let unlistenGetTokenSuccess: UnlistenFn | null = null;
let unlistenPullUpFailure: UnlistenFn | null = null;
let unlistenBuiltinSessionSuccess: UnlistenFn | null = null;
let unlistenBuiltinSessionFailure: UnlistenFn | null = null;

const BUILTIN_CLIENT_METHOD = "builtin_client";
// 内置 Koko 界面，见 useConnectMethods 注入
const WEB_CLI_NATIVE_METHOD = "web_cli_native";
const NATIVE_WORKSPACE_METHODS = new Set([
  BUILTIN_CLIENT_METHOD,
  WEB_CLI_NATIVE_METHOD,
  WEB_DB_NATIVE_VALUE,
  WEB_RDP_NATIVE_VALUE,
  SFTP_FILE_MANAGER_VALUE,
  SFTP_FILE_EDITOR_VALUE,
  K8S_NATIVE_VALUE
]);
const pendingBuiltinSessions: Array<{
  tabId?: string
  assetId: string
  protocol: string
  account: string
  connectMethod?: string
  onSessionReady?: (payload: Record<string, any>) => void
  onSessionError?: (error: unknown) => void
}> = [];

function releaseTauriEventListeners() {
  tauriListenersRefCount = Math.max(tauriListenersRefCount - 1, 0);
  if (!tauriListenersInitialized || tauriListenersRegistering) return;
  if (tauriListenersRefCount === 0) {
    unlistenGetTokenSuccess?.();
    unlistenGetTokenFailure?.();
    unlistenPullUpFailure?.();
    unlistenBuiltinSessionSuccess?.();
    unlistenBuiltinSessionFailure?.();
    unlistenGetTokenFailure = null;
    unlistenGetTokenSuccess = null;
    unlistenPullUpFailure = null;
    unlistenBuiltinSessionSuccess = null;
    unlistenBuiltinSessionFailure = null;
    tauriListenersInitialized = false;
  }
}

export const useAssetAction = () => {
  const connectToken = ref<string | null>(null);

  const { t } = useI18n();
  const toast = useToast();
  const userInfoStore = useUserInfoStore();
  const { markSessionFailed, openSession, updateSessionPayload } = useWorkspaceTabs();
  const { fetchConnectMethods } = useConnectMethods();
  const settingManager = useSettingManager();
  // prettier-ignore
  const { currentSite, currentConnectionInfoMap, currentRdpClientOption, orgId } = storeToRefs(userInfoStore);
  const { charset, rdpResolution, backspaceAsCtrlH, keyboardLayout, rdpClientOption, rdpColorQuality, rdpSmartSize }
    = settingManager;

  function buildLocalRdpParams() {
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
  }

  /**
   * @description 生成连接选项
   */
  function resolveGraphicsPreferences() {
    const resolvedKeyboardLayout
      = keyboardLayout.value || currentRdpClientOption.value.keyboard_layout || "en-us-qwerty";
    const resolvedClientOptions
      = Array.isArray(rdpClientOption.value) && rdpClientOption.value.length > 0
        ? [...rdpClientOption.value]
        : [...(currentRdpClientOption.value.rdp_client_option || [])];
    const resolvedColorQuality = rdpColorQuality.value || currentRdpClientOption.value.rdp_color_quality || "32";
    const resolvedSmartSize = rdpSmartSize.value || currentRdpClientOption.value.rdp_smart_size || "0";

    return {
      resolvedCharset: (charset.value || "default") as string,
      resolvedBackspace: backspaceAsCtrlH.value ?? false,
      resolvedResolution: (rdpResolution.value || "auto") as string,
      resolvedKeyboardLayout,
      resolvedClientOptions,
      resolvedColorQuality,
      resolvedSmartSize
    };
  }

  /**
   * @description 展示 user 信息,默认展示非 @ 开头的 user
   * @param assetId
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
   */
  const getUserId = (accounts: PermedAccount[], assetId: string, user: string) => {
    const _accounts = accounts || [];
    const saved = currentConnectionInfoMap.value[assetId];
    const username = saved?.username ?? user;

    // 同名账号 account 使用 @USER
    // 手动输入 account 使用 @INPUT
    // prettier-ignore
    const isManual = saved?.accountMode === "manual" || username === "手动输入" || username === "Manual input";

    const isDynamic
      = saved?.accountMode === "dynamic" || username.includes("同名账号") || username.includes("Dynamic user");

    const isAnonymous = saved?.accountMode === "anonymous" || username.includes("@ANON");

    // 已保存过托管账号的 ID 则优先使用
    if (!isManual && !isDynamic && !isAnonymous && saved?.accountId) {
      return saved.accountId as any;
    }
    if (isManual) return "@INPUT";
    if (isDynamic) return "@USER";
    if (isAnonymous) return "@ANON";

    if (username) {
      const matched = _accounts.find((a) => a.username === username || a.alias === username || a.name === username);
      if (matched) return matched.id;
    }

    return _accounts[0]?.id || "";
  };

  /**
   * @description 获取连接令牌
   */
  const joinEndpointUrl = (endpointUrl: string, path: string) => {
    const endpoint = new URL(endpointUrl, window.location.origin);
    const targetPath = endpoint.origin === window.location.origin ? path : path.replace(/^\/luna(?=\/)/, "");
    return new URL(targetPath, endpoint.origin).toString();
  };

  const getEndpointUrl = (endpoint: Record<string, any>, protocol?: string) => {
    const endpointProtocol = (protocol || window.location.protocol.replace(":", "") || "http").replace(":", "");
    const host = endpoint.host || window.location.hostname;
    let port = endpoint[`${endpointProtocol}_port`];

    if ((endpointProtocol === "http" || endpointProtocol === "https") && port === 0) {
      port = window.location.port;
    }

    const endpointPort = port ? String(port) : "";
    const isLoopbackEndpoint = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
    const isSameDevServer = isLoopbackEndpoint && endpointPort === window.location.port;

    if (isSameDevServer) {
      return window.location.origin;
    }

    return `${window.location.protocol}//${port ? `${host}:${port}` : host}`;
  };

  const getWebConnectorDevOrigin = (component: string) => {
    if (!import.meta.dev) return "";

    const env = import.meta.env as Record<string, string | undefined>;
    const devOrigins: Record<string, string | undefined> = {
      koko: env.VITE_JMS_KOKO_IFRAME_URL,
      default: env.VITE_JMS_KOKO_IFRAME_URL,
      lion: env.VITE_JMS_LION_IFRAME_URL,
      tinker: env.VITE_JMS_LION_IFRAME_URL,
      chen: env.VITE_JMS_CHEN_IFRAME_URL
    };

    return devOrigins[component]?.replace(/\/+$/, "") || "";
  };

  const resolveWebEndpointProtocol = (method: { component?: string, type?: string, endpoint_protocol?: string } | undefined) => {
    const pageProtocol = window.location.protocol.replace(":", "") || "http";
    const component = method?.component || "";
    const isWebSurface = method?.type === "web" || ["koko", "lion", "chen", "tinker", "default"].includes(component);
    const endpointProtocol = method?.endpoint_protocol?.replace(":", "") || "";

    if (isWebSurface) {
      return endpointProtocol === "http" || endpointProtocol === "https" ? endpointProtocol : pageProtocol;
    }

    return endpointProtocol || pageProtocol;
  };

  const fetchSmartEndpointUrl = async (
    token: TokenResponse,
    method: { component?: string, type?: string, endpoint_protocol?: string } | undefined,
    body: ConnectionBody
  ) => {
    const endpointProtocol = resolveWebEndpointProtocol(method);
    const endpoint = await getSmartEndpoint({
      protocol: endpointProtocol,
      assetId: body.asset,
      token: token.id
    });

    return getEndpointUrl(endpoint, endpointProtocol);
  };

  const getWebConnectorPath = (
    token: TokenResponse,
    method: { component?: string, value?: string, type?: string, endpoint_protocol?: string } | undefined,
    body: ConnectionBody,
    endpointUrl = window.location.origin
  ) => {
    const tokenId = token.id;
    const component = method?.component || (body.protocol === "ssh" ? "koko" : "default");
    const params = new URLSearchParams({ token: tokenId });

    if (body.connect_options?.disableautohash !== undefined) {
      params.set("disableautohash", String(body.connect_options.disableautohash));
    }

    switch (component) {
      case "chen":
        return joinEndpointUrl(endpointUrl, withWebSitePrefix(`/chen/connect?${params.toString()}`));
      case "tinker":
      case "lion":
        return joinEndpointUrl(endpointUrl, withWebSitePrefix(`/lion/connect?token=${encodeURIComponent(tokenId)}`));
      case "koko":
      case "default":
        params.set("_", String(Date.now()));
        if (method?.value === "web_sftp") {
          params.set("asset", body.asset);
          return joinEndpointUrl(endpointUrl, withWebSitePrefix(`/koko/elfinder/sftp/?${params.toString()}`));
        }
        return joinEndpointUrl(endpointUrl, withWebSitePrefix(`/koko/connect/?${params.toString()}`));
      default:
        return joinEndpointUrl(endpointUrl, withWebSitePrefix(`/koko/connect/?${params.toString()}`));
    }
  };

  const getConnectToken = async (
    body: ConnectionBody,
    meta?: { tabId?: string, asset?: AssetItem, assetId: string, protocol: string, account: string }
  ) => {
    if (!isTauriRuntime()) {
      const session = meta?.tabId
        ? undefined
        : meta?.asset
          ? openSession(meta.asset, { protocol: meta.protocol, account: meta.account })
          : undefined;
      const tabId = meta?.tabId || session?.id;

      try {
        const token = await createConnectionToken(body);
        const allMethods = await fetchConnectMethods();
        const method = (allMethods[body.protocol] || []).find((item) => item.value === body.connect_method);
        const component = method?.component || (body.protocol === "ssh" ? "koko" : "default");
        const endpointUrl = getWebConnectorDevOrigin(component) || await fetchSmartEndpointUrl(token, method, body);
        const webUrl = getWebConnectorPath(token, method, body, endpointUrl);

        if (tabId) {
          updateSessionPayload(
            { tabId, assetId: meta!.assetId, protocol: meta!.protocol, account: meta!.account },
            {
              token,
              ...token,
              webUrl,
              connectMethod: method || { value: body.connect_method }
            }
          );
        } else {
          window.open(webUrl, "_blank");
        }
      } catch (error) {
        if (meta) {
          markSessionFailed({ tabId, assetId: meta.assetId, protocol: meta.protocol, account: meta.account });
        }

        toast.add({
          title: t("ConnectError.ConnectFailed"),
          description: String(error),
          color: "error",
          icon: "line-md:close-circle",
          progress: true,
          duration: 4000
        });
      }
      return;
    }

    const rdpParams = buildLocalRdpParams();
    useTauriCoreInvoke("get_connect_token", {
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

  const resolveServerConnectMethod = async (body: ConnectionBody) => {
    // 服务端不认识本地注入的 method（builtin_client / web_cli_native / web_rdp_native），换成真实 web method
    if (!NATIVE_WORKSPACE_METHODS.has(body.connect_method)) return body.connect_method;

    try {
      const allMethods = await fetchConnectMethods();
      const methods = allMethods[body.protocol] || [];
      const injected = methods.find((item) => item.value === body.connect_method);
      if (injected?.origin_value) return injected.origin_value;

      if (body.connect_method === WEB_RDP_NATIVE_VALUE) {
        const lionWeb = methods.find(
          (item) => item.type === "web" && ["lion", "tinker"].includes(item.component) && !item.origin_value
        );
        if (lionWeb) return lionWeb.value;
      }

      if (body.connect_method === WEB_DB_NATIVE_VALUE) {
        const chenWeb = methods.find(
          (item) => item.type === "web" && item.component === "chen" && !item.origin_value
        );
        if (chenWeb) return chenWeb.value;
      }

      const kokoWeb = methods.find(
        (item) => item.type === "web" && ["koko", "default"].includes(item.component) && !item.origin_value
      );
      if (kokoWeb) return kokoWeb.value;
    } catch {}

    return body.connect_method;
  };

  const resolveBuiltinComponent = (body: ConnectionBody) => {
    if (body.connect_method === WEB_RDP_NATIVE_VALUE) return "lion";
    if (body.connect_method === WEB_DB_NATIVE_VALUE) return "chen";
    return "koko";
  };

  const getBuiltinConnectSession = (
    body: ConnectionBody,
    meta: {
      tabId?: string
      assetId: string
      protocol: string
      account: string
      onSessionReady?: (payload: Record<string, any>) => void
      onSessionError?: (error: unknown) => void
    }
  ) => {
    if (!isTauriRuntime()) {
      void (async () => {
        try {
          const serverBody = { ...body, connect_method: await resolveServerConnectMethod(body) };
          const token = await createConnectionToken(serverBody);
          const payload = {
            token,
            ...token,
            connectMethod: { value: body.connect_method, component: resolveBuiltinComponent(body) }
          };
          if (meta.onSessionReady) meta.onSessionReady(payload);
          else updateSessionPayload(meta, payload);
        } catch (error) {
          if (meta.onSessionError) meta.onSessionError(error);
          else markSessionFailed(meta);
          toast.add({
            title: t("ConnectError.ConnectFailed"),
            description: String(error),
            color: "error",
            icon: "line-md:close-circle",
            progress: true,
            duration: 4000
          });
        }
      })();
      return;
    }

    const rdpParams = buildLocalRdpParams();
    pendingBuiltinSessions.push({ ...meta, connectMethod: body.connect_method });

    void (async () => useTauriCoreInvoke("get_builtin_connect_session", {
      body: {
        asset: body.asset,
        account: body.account,
        protocol: body.protocol,
        input_username: body.input_username,
        input_secret: body.input_secret,
        connect_method: await resolveServerConnectMethod(body),
        connect_options: body.connect_options
      },
      rdpParams
    }))().catch((error) => {
      const idx = pendingBuiltinSessions.findIndex(
        (item) =>
          item.assetId === meta.assetId
          && item.protocol === meta.protocol
          && item.account === meta.account
          && item.tabId === meta.tabId
      );

      if (idx !== -1) pendingBuiltinSessions.splice(idx, 1);
      if (meta.onSessionError) meta.onSessionError(error);
      else markSessionFailed(meta);

      toast.add({
        title: t("ConnectError.ConnectFailed"),
        description: String(error || t("ConnectError.ConnectFailed")),
        color: "error",
        icon: "line-md:close-circle",
        progress: true,
        duration: 4000
      });
    });
  };

  /**
   * @description 根据协议分发连接方法
   * @param protocol
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
      case "http":
        method = "chrome";
        break;
      default:
        method = "db_client";
    }

    return method;
  };

  const generateConnectOptions = (protocol: string) => {
    const prefs = resolveGraphicsPreferences();

    const options = {
      charset: prefs.resolvedCharset,
      backspaceAsCtrlH: prefs.resolvedBackspace,
      resolution: prefs.resolvedResolution,
      rdp_resolution: prefs.resolvedResolution,
      keyboard_layout: prefs.resolvedKeyboardLayout,
      rdp_client_option: prefs.resolvedClientOptions,
      rdp_color_quality: prefs.resolvedColorQuality,
      rdp_smart_size: prefs.resolvedSmartSize,
      token_reusable: false,
      disableautohash: false
    };
    const specificOptions = protocol === "http"
      ? {
        appletConnectMethod: "client",
        reusable: false
      }
      : {};
    return {
      ...options,
      ...specificOptions
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
    accounts?: PermedAccount[],
    protocolOverride?: string,
    ephemeral?: {
      accountMode?: "hosted" | "dynamic" | "manual" | "anonymous"
      accountId?: string
      manualUsername?: string
      manualPassword?: string
      dynamicPassword?: string
      connectMethod?: string
      connectOptions?: Record<string, any>
      tabId?: string
      asset?: AssetItem
      onSessionReady?: (payload: Record<string, any>) => void
      onSessionError?: (error: unknown) => void
    }
  ) => {
    const saved = currentConnectionInfoMap.value[assetId];

    // The selection from the current dialog always wins. Saved data is only a
    // fallback for direct auto-connect calls that do not provide form state.
    const effectiveMode = ephemeral?.accountMode ?? saved?.accountMode;
    const selected = user || saved?.username || "";

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
    } else if (effectiveMode === "anonymous" || selected?.includes("@ANON")) {
      input_username = "";
      input_secret = "";
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
      if (effectiveMode === "anonymous" || selected?.includes("@ANON")) {
        return "@ANON";
      }

      if (ephemeral?.accountId) return ephemeral.accountId;
      if (matchedAccount?.id) return matchedAccount.id;

      return getUserId(accounts!, assetId, user);
    })();

    // 当前连接显式选择优先；仅在协议一致时复用已保存连接方法，避免跨协议复用错误的客户端
    const preferredConnectMethod = ephemeral?.connectMethod?.trim()
      || (saved?.protocol === protocol ? saved?.connectMethod?.trim() : "")
      || dispatchConnectMethod(protocol);
    const connectMethod = preferredConnectMethod;

    // Every successful attempt updates the lightweight last-used preference.
    // It must not turn into an auto-connect record unless the user checked
    // "remember selection" (that record is managed by useAssetConnection).
    userInfoStore.setConnectionPreferenceForAsset(assetId, {
      protocol,
      username: selected || user,
      accountId: effectiveMode === "hosted" ? (ephemeral?.accountId || matchedAccount?.id || saved?.accountId) : undefined,
      accountMode: effectiveMode,
      connectMethod
    });

    const mergedConnectOptions = {
      ...generateConnectOptions(protocol),
      ...(saved?.protocol === protocol ? (saved as any)?.connectOptions || {} : {}),
      ...(ephemeral?.connectOptions || {})
    };

    const connectionBody = {
      asset: assetId,
      protocol,
      input_username,
      input_secret,
      account: accountForToken,
      connect_method: connectMethod,
      connect_options: mergedConnectOptions
    };

    nextTick(() => {
      const account = selected || user;
      let tabId = ephemeral?.tabId;

      // ponytail: 有 onSessionReady 时由调用方内嵌展示（如右侧 SFTP），不新开 workspace tab
      if (!tabId && ephemeral?.asset && NATIVE_WORKSPACE_METHODS.has(connectMethod) && !ephemeral?.onSessionReady) {
        tabId = openSession(ephemeral.asset, { protocol, account }).id;
      }

      if (NATIVE_WORKSPACE_METHODS.has(connectMethod)) {
        getBuiltinConnectSession(connectionBody, {
          tabId,
          assetId,
          protocol,
          account,
          onSessionReady: ephemeral?.onSessionReady,
          onSessionError: ephemeral?.onSessionError
        });
        return;
      }

      getConnectToken(connectionBody, {
        tabId,
        asset: ephemeral?.asset,
        assetId,
        protocol,
        account
      });
    });
  };

  /**
   * @description 处理重命名
   * @param assetId
   * @param name
   */
  const handleAssetRename = (assetId: string, name: string) => {
    if (!currentSite.value) return;

    void renameAsset(assetId, name, orgId.value)
      .then((response) => {
        const info = response || {};
        useEventBus().emit("assetRenamed", {
          assetId: String(info.asset || info.asset_id || info.id || assetId),
          name: String(info.name || name)
        });
      })
      .catch((error) => {
        toast.add({
          title: t("AssetCard.RenameFail"),
          description: error?.message || t("Common.OperationFailed"),
          color: "error",
          icon: "line-md:close-circle",
          progress: true,
          duration: 4000
        });
      });
  };

  /**
   * @description 处理资产收藏
   * @param assetId
   */
  const handleAssetFavorite = (assetId: string) => {
    void favoriteAsset(assetId)
      .then(() => {
        toast.add({
          title: t("ContextMenu.FavoriteSuccess"),
          color: "primary",
          icon: "line-md:check-all",
          progress: false,
          duration: 1000
        });
      })
      .catch(() => {
        toast.add({
          title: t("ContextMenu.FavoriteFailed"),
          color: "error",
          icon: "line-md:close-circle",
          progress: true,
          duration: 4000
        });
      });
  };

  /**
   * @description 处理取消收藏
   * @param assetId
   */
  const handleAssetUnfavorite = (assetId: string) => {
    void unfavoriteAsset(assetId)
      .then(() => {
        toast.add({
          title: t("ContextMenu.UnfavoriteSuccess"),
          color: "primary",
          icon: "line-md:check-all",
          progress: false,
          duration: 1000
        });
      })
      .catch(() => {
        toast.add({
          title: t("ContextMenu.UnfavoriteFailed"),
          color: "error",
          icon: "line-md:close-circle",
          progress: true,
          duration: 4000
        });
      });
  };

  /**
   * @description 获取详情
   * @param assetId
   */
  const getAssetDetail = (assetId: string) => {
    if (!assetId) return;

    getAssetDetailRequest(assetId)
      .then((assetDetail) => {
        const permedAccounts = assetDetail.permed_accounts ?? [];
        const permedProtocols = (assetDetail.permed_protocols ?? []).filter(
          (protocol: PermedProtocol) => protocol?.name !== "winrm"
        );

        useEventBus().emit("assetDetailUpdated", {
          assetId,
          permedAccounts,
          permedProtocols
        });
      })
      .catch((error) => {
        console.debug("get asset detail failed", { assetId, error });
      });
  };

  /**
   * @description 监听 tauri 事件
   */
  const listenTauriEvent = async () => {
    if (!isTauriRuntime()) return;

    if (tauriListenersInitialized || tauriListenersRegistering) {
      tauriListenersRefCount++;
      return;
    }

    tauriListenersRegistering = true;

    try {
      unlistenGetTokenSuccess = await useTauriEventListen("get-token-success", (event) => {
        interface eventPayload {
          status: number
          data: TokenResponse
        }

        const payload = event.payload as eventPayload;

        if (payload.status === 201) {
          connectToken.value = payload.data.id;
        }
      });

      unlistenGetTokenFailure = await useTauriEventListen("get-token-failure", (event) => {
        interface eventPayload {
          status: number
          data: string
        }

        const payload = event.payload as eventPayload;
        const errorData = JSON.parse(payload.data);
        const errorCode = errorData?.code as string;

        if (errorCode && errorCode.includes("acl")) {
          return toast.add({
            title: t("ConnectError.ConnectFailed"),
            description: t("ConnectError.AclFailed"),
            color: "error",
            icon: "line-md:close-circle",
            progress: true,
            duration: 4000
          });
        }

        toast.add({
          title: t("ConnectError.ConnectFailed"),
          description: errorData.detail,
          color: "error",
          icon: "line-md:close-circle",
          progress: true,
          duration: 4000
        });
      });

      unlistenPullUpFailure = await useTauriEventListen("pull-up-failure", (event) => {
        interface eventPayload {
          error: string
        }

        const payload = event.payload as eventPayload;
        const raw = payload.error || "";
        const lower = raw.toLowerCase();

        let description = raw || t("ConnectError.ConnectFailed");

        if (lower.includes("executable not found")) {
          description = t("ConnectError.ClientNotFound");
        } else if (lower.includes("failed to launch client")) {
          description = t("ConnectError.ClientLaunchFailed");
        } else if (lower.includes("client process exited")) {
          description = t("ConnectError.ClientExited");
        } else if (lower.includes("no rdp application")) {
          description = t("ConnectError.RdpAppMissing");
        } else if (lower.includes("no vnc application")) {
          description = t("ConnectError.VncAppMissing");
        } else if (lower.includes("no database application")) {
          description = t("ConnectError.DbAppMissing");
        } else if (lower.includes("failed to execute rdp application")) {
          description = t("ConnectError.RdpAppFailed");
        } else if (lower.includes("failed to execute vnc application")) {
          description = t("ConnectError.VncAppFailed");
        } else if (lower.includes("failed to execute database application")) {
          description = t("ConnectError.DbAppFailed");
        }

        toast.add({
          title: t("ConnectError.ConnectFailed"),
          description,
          color: "error",
          icon: "line-md:close-circle",
          progress: true,
          duration: 4000
        });
      });

      unlistenBuiltinSessionSuccess = await useTauriEventListen("get-builtin-session-success", (event) => {
        interface eventPayload {
          status: number
          data: Record<string, any>
        }

        const payload = event.payload as eventPayload;
        const meta = pendingBuiltinSessions.shift();
        if (!meta) return;

        const data = {
          ...payload.data,
          connectMethod: { value: meta.connectMethod || BUILTIN_CLIENT_METHOD, component: "koko" }
        };
        if (meta.onSessionReady) meta.onSessionReady(data);
        else updateSessionPayload(meta, data);
      });

      unlistenBuiltinSessionFailure = await useTauriEventListen("get-builtin-session-failure", (event) => {
        interface eventPayload {
          status: number
          data: string
        }

        const meta = pendingBuiltinSessions.shift();
        if (meta?.onSessionError) meta.onSessionError(event.payload);
        else if (meta) markSessionFailed(meta);

        const payload = event.payload as eventPayload;
        toast.add({
          title: t("ConnectError.ConnectFailed"),
          description: payload.data || t("ConnectError.ConnectFailed"),
          color: "error",
          icon: "line-md:close-circle",
          progress: true,
          duration: 4000
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
    if (isTauriRuntime()) {
      releaseTauriEventListeners();
    }
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
