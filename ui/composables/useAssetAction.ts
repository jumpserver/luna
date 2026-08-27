import type { DesktopUnlistenFn } from "~/shared/desktop/bridge";
import { desktopInvoke, desktopListen } from "~/shared/desktop/bridge";
import type { AssetItem, ConnectionBody, PermedAccount, PermedProtocol, TokenResponse } from "~/types";

import {
  isConnectMethodAvailable,
  K8S_NATIVE_VALUE,
  parseLocalApplicationConnectMethod,
  SFTP_FILE_EDITOR_VALUE,
  SFTP_FILE_MANAGER_VALUE,
  WEB_DB_NATIVE_VALUE,
  WEB_PROXY_NATIVE_VALUE,
  WEB_RDP_NATIVE_VALUE
} from "~/composables/useConnectMethods";
import { useSettingManager } from "~/composables/useSettingManager";
import { useUserInfoStore } from "~/store/modules/userInfo";

let desktopListenersInitialized = false;
let desktopListenersRegistering = false;
let desktopListenersRefCount = 0;
let unlistenGetTokenFailure: DesktopUnlistenFn | null = null;
let unlistenGetTokenSuccess: DesktopUnlistenFn | null = null;
let unlistenPullUpFailure: DesktopUnlistenFn | null = null;
let unlistenBuiltinSessionSuccess: DesktopUnlistenFn | null = null;
let unlistenBuiltinSessionFailure: DesktopUnlistenFn | null = null;

const BUILTIN_CLIENT_METHOD = "builtin_client";
const WEB_CLI_NATIVE_METHOD = "web_cli_native";
const NATIVE_WORKSPACE_METHODS = new Set([
  BUILTIN_CLIENT_METHOD,
  WEB_CLI_NATIVE_METHOD,
  WEB_DB_NATIVE_VALUE,
  WEB_PROXY_NATIVE_VALUE,
  WEB_RDP_NATIVE_VALUE,
  SFTP_FILE_MANAGER_VALUE,
  SFTP_FILE_EDITOR_VALUE,
  K8S_NATIVE_VALUE
]);
const NATIVE_WORKSPACE_METHOD_ORIGINS: Record<string, string> = {
  [WEB_CLI_NATIVE_METHOD]: "web_cli",
  [SFTP_FILE_MANAGER_VALUE]: "web_sftp",
  [SFTP_FILE_EDITOR_VALUE]: "web_sftp",
  [K8S_NATIVE_VALUE]: "web_cli"
};
const isGuideConnectMethod = (value: string) => value.endsWith("_guide");
const isLocalClientMethod = (method: { type?: string } | undefined) =>
  ["native", "client", "local", "desktop"].includes(String(method?.type || "").toLowerCase());
const normalizeDesktopLocalClientUrl = (url: string) =>
  url.startsWith("jms://") ? `jms2://${url.slice("jms://".length)}` : url;
const withLocalClientName = (url: string, clientName?: string) => {
  if (!clientName || !url.startsWith("jms2://")) return url;
  const decoded = Uint8Array.from(atob(url.slice("jms2://".length)), (character) => character.charCodeAt(0));
  const payload = JSON.parse(new TextDecoder().decode(decoded));
  payload.client_name = clientName;
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  return `jms2://${btoa(String.fromCharCode(...encoded))}`;
};
const pendingBuiltinSessions: Array<{
  tabId?: string;
  assetId: string;
  protocol: string;
  account: string;
  connectMethod?: string;
  onSessionReady?: (payload: Record<string, any>) => void;
  onSessionError?: (error: unknown) => void;
}> = [];

function releaseDesktopEventListeners() {
  desktopListenersRefCount = Math.max(desktopListenersRefCount - 1, 0);
  if (!desktopListenersInitialized || desktopListenersRegistering) return;
  if (desktopListenersRefCount === 0) {
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
    desktopListenersInitialized = false;
  }
}

export const useAssetAction = () => {
  const connectToken = ref<string | null>(null);

  const { t } = useI18n();
  const toast = useToast();
  const { addErrorToast } = useErrorToast();
  const userInfoStore = useUserInfoStore();
  const { markSessionFailed, openSession, setSessionConnectMethod, updateSessionPayload } = useWorkspaceTabs();
  const { fetchConnectMethods, getMethodsForProtocol } = useConnectMethods();
  const settingManager = useSettingManager();
  // prettier-ignore
  const { currentSite, currentConnectionInfoMap, currentRdpClientOption, orgId } = storeToRefs(userInfoStore);
  const { charset, rdpResolution, backspaceAsCtrlH, keyboardLayout, rdpClientOption, rdpColorQuality, rdpSmartSize } =
    settingManager;

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
    const resolvedKeyboardLayout =
      keyboardLayout.value || currentRdpClientOption.value.keyboard_layout || "en-us-qwerty";
    const resolvedClientOptions =
      Array.isArray(rdpClientOption.value) && rdpClientOption.value.length > 0
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

    const isDynamic =
      saved?.accountMode === "dynamic" || username.includes("同名账号") || username.includes("Dynamic user");

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
    let siteUrl: URL | null = null;
    try {
      const candidate = new URL(currentSite.value || window.location.origin);
      if (["http:", "https:"].includes(candidate.protocol)) siteUrl = candidate;
    } catch {}

    const host = endpoint.host || siteUrl?.hostname || window.location.hostname;
    if (!host || host === "app") throw new Error("Smart endpoint did not provide a valid HTTP host");
    let port = endpoint[`${endpointProtocol}_port`] ?? endpoint.port;

    if ((endpointProtocol === "http" || endpointProtocol === "https") && port === 0) {
      port = siteUrl?.port || window.location.port;
    } else if (!endpoint.host && port == null && siteUrl?.protocol === `${endpointProtocol}:`) {
      port = siteUrl.port;
    }

    const endpointPort = port ? String(port) : "";
    const isLoopbackEndpoint = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
    const isSameDevServer = isLoopbackEndpoint && endpointPort === window.location.port;

    if (isSameDevServer) {
      return window.location.origin;
    }

    return `${endpointProtocol}://${port ? `${host}:${port}` : host}`;
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

  const resolveWebEndpointProtocol = (
    method: { component?: string; type?: string; endpoint_protocol?: string } | undefined
  ) => {
    const component = method?.component || "";
    const isWebSurface = method?.type === "web" || ["koko", "lion", "chen", "tinker", "default"].includes(component);
    const endpointProtocol = method?.endpoint_protocol?.replace(":", "") || "";
    const pageProtocol = window.location.protocol.replace(":", "");
    let siteProtocol = "";
    try {
      siteProtocol = new URL(currentSite.value || "").protocol.replace(":", "");
    } catch {}
    const httpProtocol = [pageProtocol, siteProtocol].find((value) => value === "http" || value === "https") || "https";

    if (isWebSurface) {
      return endpointProtocol === "http" || endpointProtocol === "https" ? endpointProtocol : httpProtocol;
    }

    return endpointProtocol || httpProtocol;
  };

  const fetchSmartEndpointUrl = async (
    token: TokenResponse,
    method: { component?: string; type?: string; endpoint_protocol?: string } | undefined,
    body: ConnectionBody,
    orgId?: string
  ) => {
    const endpointProtocol = resolveWebEndpointProtocol(method);
    const endpoint = await getSmartEndpoint(
      {
        protocol: endpointProtocol,
        assetId: body.asset,
        token: token.id
      },
      orgId
    );

    return getEndpointUrl(endpoint, endpointProtocol);
  };

  const getWebConnectorPath = (
    token: TokenResponse,
    method: { component?: string; value?: string; type?: string; endpoint_protocol?: string } | undefined,
    body: ConnectionBody,
    endpointUrl = window.location.origin,
    assetPlatform = ""
  ) => {
    const tokenId = token.id;
    const component = method?.component || (body.protocol === "ssh" ? "koko" : "default");
    const params = new URLSearchParams({ token: tokenId, protocol: body.protocol });
    if (assetPlatform) params.set("platform", assetPlatform);

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
    meta?: {
      tabId?: string;
      asset?: AssetItem;
      assetId: string;
      protocol: string;
      account: string;
      assetName?: string;
      orgId?: string;
      aclBatchId?: string;
      onSessionReady?: (payload: Record<string, any>) => void;
      onSessionError?: (error: unknown) => void;
    }
  ) => {
    const nativeApp = parseLocalApplicationConnectMethod(body.connect_method);
    const serverBody = { ...body, connect_method: nativeApp.connectMethod };

    const session =
      meta?.tabId || meta?.onSessionReady
        ? undefined
        : meta?.asset
          ? openSession(meta.asset, {
              protocol: meta.protocol,
              account: meta.account,
              connectMethod: body.connect_method
            })
          : undefined;
    const tabId = meta?.tabId || session?.id;

    try {
      const token = await createConnectionTokenWithAcl(serverBody, {
        orgId: meta?.orgId,
        assetName: meta?.asset?.name || meta?.assetId || body.asset,
        scopeId: tabId,
        batchId: meta?.aclBatchId
      });
      if (!token) {
        if (meta?.onSessionError) meta.onSessionError(new Error("Connection cancelled"));
        else if (meta)
          markSessionFailed({ tabId, assetId: meta.assetId, protocol: meta.protocol, account: meta.account });
        return;
      }
      const allMethods = await fetchConnectMethods();
      const method = (allMethods[body.protocol] || []).find((item) => item.value === serverBody.connect_method);

      if (isDesktopRuntime() || isLocalClientMethod(method)) {
        const { url } = await getLocalClientUrl(token.id, buildLocalRdpParams());
        const localClientUrl = isDesktopRuntime() ? normalizeDesktopLocalClientUrl(url || "") : url;
        const expectedScheme = isDesktopRuntime() ? "jms2://" : "jms://";
        if (!localClientUrl?.startsWith(expectedScheme)) {
          throw new Error("Invalid local client URL");
        }
        meta?.onSessionReady?.({
          token,
          ...token,
          connectMethod: method || { value: body.connect_method }
        });
        if (isDesktopRuntime()) {
          await desktopInvoke("pull_up", {
            url: withLocalClientName(localClientUrl, nativeApp.clientName)
          });
        } else {
          window.location.assign(localClientUrl);
        }
        return;
      }

      const component = method?.component || (body.protocol === "ssh" ? "koko" : "default");
      const devOrigin = getWebConnectorDevOrigin(component);
      const endpointUrl = devOrigin || (await fetchSmartEndpointUrl(token, method, body, meta?.orgId));
      const webUrl = getWebConnectorPath(token, method, body, endpointUrl, meta?.asset?.platform || "");

      const payload = {
        token,
        ...token,
        endpointUrl: import.meta.dev ? devOrigin || window.location.origin : endpointUrl,
        webUrl,
        connectMethod: method || { value: body.connect_method }
      };
      if (meta?.onSessionReady) {
        meta.onSessionReady(payload);
      } else if (tabId) {
        updateSessionPayload(
          { tabId, assetId: meta!.assetId, protocol: meta!.protocol, account: meta!.account },
          payload
        );
      } else {
        window.open(webUrl, "_blank");
      }
    } catch (error) {
      if (meta?.onSessionError) {
        meta.onSessionError(error);
      } else if (meta) {
        markSessionFailed({ tabId, assetId: meta.assetId, protocol: meta.protocol, account: meta.account });
      }

      addErrorToast({
        title: t("ConnectError.ConnectFailed"),
        description: String(error),
        icon: "line-md:close-circle",
        progress: true,
        duration: 4000
      });
    }
  };

  const resolveServerConnectMethod = async (body: ConnectionBody) => {
    // 服务端不认识本地注入的 method（builtin_client / web_cli_native / web_rdp_native），换成真实 web method
    if (!NATIVE_WORKSPACE_METHODS.has(body.connect_method)) return body.connect_method;

    try {
      const methods = await getMethodsForProtocol(body.protocol);
      const injected = methods.find((item) => item.value === body.connect_method);
      if (injected?.origin_value) return injected.origin_value;

      if (body.connect_method === WEB_RDP_NATIVE_VALUE) {
        const lionWeb = methods.find(
          (item) => item.type === "web" && ["lion", "tinker"].includes(item.component) && !item.origin_value
        );
        if (lionWeb) return lionWeb.value;
      }

      if (body.connect_method === WEB_DB_NATIVE_VALUE) {
        const chenWeb = methods.find((item) => item.type === "web" && item.component === "chen" && !item.origin_value);
        if (chenWeb) return chenWeb.value;
      }

      const kokoWeb = methods.find(
        (item) => item.type === "web" && ["koko", "default"].includes(item.component) && !item.origin_value
      );
      if (kokoWeb) return kokoWeb.value;
    } catch {}

    return NATIVE_WORKSPACE_METHOD_ORIGINS[body.connect_method] || body.connect_method;
  };

  const resolveBuiltinComponent = (body: ConnectionBody) => {
    if (body.connect_method === WEB_RDP_NATIVE_VALUE) return "lion";
    if (body.connect_method === WEB_DB_NATIVE_VALUE) return "chen";
    return "koko";
  };

  const getBuiltinConnectSession = (
    body: ConnectionBody,
    meta: {
      tabId?: string;
      assetId: string;
      protocol: string;
      account: string;
      assetName?: string;
      orgId?: string;
      aclBatchId?: string;
      asset?: AssetItem;
      onSessionReady?: (payload: Record<string, any>) => void;
      onSessionError?: (error: unknown) => void;
    }
  ) => {
    void (async () => {
      try {
        const serverBody = { ...body, connect_method: await resolveServerConnectMethod(body) };
        const token = await createConnectionTokenWithAcl(serverBody, {
          orgId: meta.orgId,
          assetName: meta.assetName || meta.assetId,
          scopeId: meta.tabId,
          batchId: meta.aclBatchId
        });
        if (!token) {
          if (meta.onSessionError) meta.onSessionError(new Error("Connection cancelled"));
          else markSessionFailed(meta);
          return;
        }
        const component = resolveBuiltinComponent(body);
        let endpointUrl = import.meta.dev
          ? window.location.origin
          : await fetchSmartEndpointUrl(token, { component, type: "web" }, body, meta.orgId);
        if (component === "chen" && isElectronRuntime()) {
          endpointUrl = await desktopInvoke<string>("resolve_chen_endpoint");
        } else if (component === "koko" && isElectronRuntime()) {
          endpointUrl = await desktopInvoke<string>("resolve_koko_endpoint");
        }
        let webProxy;
        if (body.connect_method === WEB_PROXY_NATIVE_VALUE) {
          if (!meta.asset) throw new Error("Website 资产信息不完整");
          webProxy = useWebProxyManager().buildWebProxyRequest(meta.asset, body.protocol, endpointUrl);
        }
        const payload = {
          token,
          ...token,
          endpointUrl,
          webProxy,
          connectMethod: {
            value: body.connect_method,
            component,
            type: "web"
          }
        };
        if (meta.onSessionReady) meta.onSessionReady(payload);
        else updateSessionPayload(meta, payload);
      } catch (error) {
        if (meta.onSessionError) meta.onSessionError(error);
        else markSessionFailed(meta);
        addErrorToast({
          title: t("ConnectError.ConnectFailed"),
          description: String(error),
          icon: "line-md:close-circle",
          progress: true,
          duration: 4000
        });
      }
    })();
  };

  const resolveConnectMethod = async (protocol: string) => {
    const methods = await getMethodsForProtocol(protocol);
    const preferred = userInfoStore.getConnectionPreferenceForProtocol(protocol)?.connectMethod || "";

    if (isConnectMethodAvailable(preferred, methods, protocol, settingManager.appConfig.value)) {
      return preferred;
    }

    return methods[0]?.value || "";
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
    const specificOptions =
      protocol === "http"
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
  const handleAssetConnection = async (
    user: string,
    assetId: string,
    displayProtocol: string,
    accounts?: PermedAccount[],
    protocolOverride?: string,
    ephemeral?: {
      accountMode?: "hosted" | "dynamic" | "manual" | "anonymous";
      accountId?: string;
      manualUsername?: string;
      manualPassword?: string;
      dynamicPassword?: string;
      connectMethod?: string;
      connectOptions?: Record<string, any>;
      tabId?: string;
      aclBatchId?: string;
      asset?: AssetItem;
      onSessionReady?: (payload: Record<string, any>) => void;
      onSessionError?: (error: unknown) => void;
      orgId?: string;
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
    const preferredConnectMethod =
      ephemeral?.connectMethod?.trim() ||
      (saved?.protocol === protocol ? saved?.connectMethod?.trim() : "") ||
      (await resolveConnectMethod(protocol));
    const connectMethod = preferredConnectMethod;

    if (ephemeral?.tabId) setSessionConnectMethod(ephemeral.tabId, connectMethod);

    // Every successful attempt updates the lightweight last-used preference.
    // It must not turn into an auto-connect record unless the user checked
    // "remember selection" (that record is managed by useAssetConnection).
    userInfoStore.setConnectionPreferenceForAsset(assetId, {
      protocol,
      username: selected || user,
      accountId:
        effectiveMode === "hosted" ? ephemeral?.accountId || matchedAccount?.id || saved?.accountId : undefined,
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
      if (
        !tabId &&
        ephemeral?.asset &&
        (NATIVE_WORKSPACE_METHODS.has(connectMethod) || isGuideConnectMethod(connectMethod)) &&
        !ephemeral?.onSessionReady
      ) {
        tabId = openSession(ephemeral.asset, { protocol, account, connectMethod }).id;
      }

      if (NATIVE_WORKSPACE_METHODS.has(connectMethod) || isGuideConnectMethod(connectMethod)) {
        getBuiltinConnectSession(connectionBody, {
          tabId,
          assetId,
          protocol,
          account,
          assetName: ephemeral?.asset?.name,
          orgId: ephemeral?.orgId,
          aclBatchId: ephemeral?.aclBatchId,
          asset: ephemeral?.asset,
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
        account,
        orgId: ephemeral?.orgId,
        aclBatchId: ephemeral?.aclBatchId,
        onSessionReady: ephemeral?.onSessionReady,
        onSessionError: ephemeral?.onSessionError
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
        addErrorToast({
          title: t("AssetCard.RenameFail"),
          description: error?.message || t("Common.OperationFailed"),
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
        addErrorToast({
          title: t("ContextMenu.FavoriteFailed"),
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
        addErrorToast({
          title: t("ContextMenu.UnfavoriteFailed"),
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
   * @description 监听 desktop 事件
   */
  const listenDesktopEvent = async () => {
    if (!isDesktopRuntime()) return;

    if (desktopListenersInitialized || desktopListenersRegistering) {
      desktopListenersRefCount++;
      return;
    }

    desktopListenersRegistering = true;

    try {
      unlistenGetTokenSuccess = await desktopListen("get-token-success", (event) => {
        interface eventPayload {
          status: number;
          data: TokenResponse;
        }

        const payload = event.payload as eventPayload;

        if (payload.status === 201) {
          connectToken.value = payload.data.id;
        }
      });

      unlistenGetTokenFailure = await desktopListen("get-token-failure", (event) => {
        interface eventPayload {
          status: number;
          data: string;
        }

        const payload = event.payload as eventPayload;
        const errorData = JSON.parse(payload.data);
        const errorCode = errorData?.code as string;

        if (errorCode && errorCode.includes("acl")) {
          return addErrorToast({
            title: t("ConnectError.ConnectFailed"),
            description: t("ConnectError.AclFailed"),
            icon: "line-md:close-circle",
            progress: true,
            duration: 4000
          });
        }

        addErrorToast({
          title: t("ConnectError.ConnectFailed"),
          description: errorData.detail,
          icon: "line-md:close-circle",
          progress: true,
          duration: 4000
        });
      });

      unlistenPullUpFailure = await desktopListen("pull-up-failure", (event) => {
        interface eventPayload {
          error: string;
        }

        const payload = event.payload as eventPayload;
        const raw = payload.error || "";
        const lower = raw.toLowerCase();
        const withDetail = (base: string) => {
          const detail = raw.trim();
          const parts = [base];
          if (detail && detail !== base) parts.push(detail);
          return parts.join("\n");
        };

        let description = raw || t("ConnectError.ConnectFailed");

        if (lower.includes("executable not found")) {
          description = withDetail(t("ConnectError.ClientNotFound"));
        } else if (lower.includes("failed to launch client")) {
          description = withDetail(t("ConnectError.ClientLaunchFailed"));
        } else if (lower.includes("client process exited")) {
          description = withDetail(t("ConnectError.ClientExited"));
        } else if (lower.includes("no rdp application")) {
          description = withDetail(t("ConnectError.RdpAppMissing"));
        } else if (lower.includes("no vnc application")) {
          description = withDetail(t("ConnectError.VncAppMissing"));
        } else if (lower.includes("no database application")) {
          description = withDetail(t("ConnectError.DbAppMissing"));
        } else if (lower.includes("failed to execute rdp application")) {
          description = withDetail(t("ConnectError.RdpAppFailed"));
        } else if (lower.includes("failed to execute vnc application")) {
          description = withDetail(t("ConnectError.VncAppFailed"));
        } else if (lower.includes("failed to execute database application")) {
          description = withDetail(t("ConnectError.DbAppFailed"));
        }

        addErrorToast({
          title: t("ConnectError.ConnectFailed"),
          description,
          icon: "line-md:close-circle",
          progress: true,
          duration: 4000
        });
      });

      unlistenBuiltinSessionSuccess = await desktopListen("get-builtin-session-success", (event) => {
        interface eventPayload {
          status: number;
          data: Record<string, any>;
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

      unlistenBuiltinSessionFailure = await desktopListen("get-builtin-session-failure", (event) => {
        interface eventPayload {
          status: number;
          data: string;
        }

        const meta = pendingBuiltinSessions.shift();
        if (meta?.onSessionError) meta.onSessionError(event.payload);
        else if (meta) markSessionFailed(meta);

        const payload = event.payload as eventPayload;
        addErrorToast({
          title: t("ConnectError.ConnectFailed"),
          description: payload.data || t("ConnectError.ConnectFailed"),
          icon: "line-md:close-circle",
          progress: true,
          duration: 4000
        });
      });

      desktopListenersInitialized = true;
      desktopListenersRefCount++;
    } finally {
      desktopListenersRegistering = false;
    }
  };

  onMounted(() => {
    listenDesktopEvent();
  });

  onBeforeUnmount(() => {
    if (isDesktopRuntime()) {
      releaseDesktopEventListeners();
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
