import type { AppConfigType, ConfigItem } from "~/types/index";
import {
  COMPONENT_WORKSPACE_CAPABILITIES,
  K8S_NATIVE_VALUE,
  SFTP_FILE_EDITOR_VALUE,
  SFTP_FILE_MANAGER_VALUE,
  WEB_CLI_NATIVE_VALUE,
  WEB_DB_NATIVE_VALUE,
  WEB_PROXY_NATIVE_VALUE,
  WEB_RDP_NATIVE_VALUE
} from "~/shared/connectors/capabilities";
import { useUserInfoStore } from "~/store/modules/userInfo";

export {
  K8S_NATIVE_VALUE,
  SFTP_FILE_EDITOR_VALUE,
  SFTP_FILE_MANAGER_VALUE,
  WEB_CLI_NATIVE_VALUE,
  WEB_DB_NATIVE_VALUE,
  WEB_PROXY_NATIVE_VALUE,
  WEB_RDP_NATIVE_VALUE
};

export interface ConnectMethod {
  value: string;
  label: string;
  type: string;
  icon: string;
  disabled: boolean;
  listen: string;
  component: string;
  endpoint_protocol?: string;
  origin_value?: string;
}

export interface ConnectMethodsResponse {
  [protocol: string]: ConnectMethod[];
  originals: ConnectMethod[];
}

export const canDownloadRdpFile = (
  method: ConnectMethod | undefined,
  options: { appletConnectMethod?: unknown } = {}
) =>
  !!method &&
  !method.disabled &&
  (method.component === "razor" || (method.type === "applet" && options.appletConnectMethod === "client"));

const LOCAL_APPLICATION_METHOD_PREFIX = "native_app:";

export const createLocalApplicationConnectMethod = (connectMethod: string, clientName: string) =>
  `${LOCAL_APPLICATION_METHOD_PREFIX}${connectMethod}:${encodeURIComponent(clientName)}`;

export const parseLocalApplicationConnectMethod = (value: string) => {
  const match = /^native_app:([^:]+):(.+)$/.exec(value || "");
  if (!match) return { connectMethod: value, clientName: undefined };

  try {
    return {
      connectMethod: match[1] || value,
      clientName: decodeURIComponent(match[2] || "")
    };
  } catch {
    return { connectMethod: value, clientName: undefined };
  }
};

export const isApplicationConfigItemAvailable = (item: ConfigItem, protocol: string): boolean => {
  const normalizedProtocol = protocol.toLowerCase();
  const enabledProtocols = item.enabled_protocols || item.match_first;

  return (
    item.name !== "builtin_client" &&
    item.is_set &&
    item.path_exists !== false &&
    item.protocol.some((value) => value.toLowerCase() === normalizedProtocol) &&
    enabledProtocols?.some((value) => value.toLowerCase() === normalizedProtocol) === true
  );
};

export const isConnectMethodAvailable = (
  value: string,
  methods: ConnectMethod[],
  protocol: string,
  appConfig?: AppConfigType | null
) => {
  if (!value) return false;

  const selected = parseLocalApplicationConnectMethod(value);
  if (!methods.some((method) => method.value === selected.connectMethod)) return false;
  if (!selected.clientName) return true;
  if (!isDesktopRuntime() || !appConfig) return false;

  return Object.values(appConfig)
    .flat()
    .some((item) => item.name === selected.clientName && isApplicationConfigItemAvailable(item, protocol));
};

export const isExternalClientConnectMethod = (
  value: string,
  methods: ConnectMethod[],
  options: { appletConnectMethod?: unknown } = {}
) => {
  const selected = parseLocalApplicationConnectMethod(value);
  if (selected.connectMethod.endsWith("_guide")) return false;

  const method = methods.find((item) => item.value === selected.connectMethod);
  const type = String(method?.type || "").toLowerCase();
  return (
    ["native", "client", "local", "desktop"].includes(type) ||
    (type === "applet" && options.appletConnectMethod === "client")
  );
};

const BUILTIN_WORKSPACE_METHOD_VALUES = new Set([
  WEB_CLI_NATIVE_VALUE,
  WEB_RDP_NATIVE_VALUE,
  WEB_DB_NATIVE_VALUE,
  WEB_PROXY_NATIVE_VALUE,
  SFTP_FILE_MANAGER_VALUE,
  SFTP_FILE_EDITOR_VALUE,
  K8S_NATIVE_VALUE
]);

export const pickConnectMethod = (
  protocol: string,
  methods: ConnectMethod[],
  currentMethod = "",
  preferredMethod = "",
  appConfig?: AppConfigType | null,
  desktopRuntime = isDesktopRuntime()
) => {
  const builtin = methods.find((method) => BUILTIN_WORKSPACE_METHOD_VALUES.has(method.value));
  const canUse = (value: string) => {
    if (builtin && value.startsWith(LOCAL_APPLICATION_METHOD_PREFIX)) return false;
    return isConnectMethodAvailable(value, methods, protocol, appConfig);
  };

  // The current form choice wins; only automatic preferences favor the built-in workspace.
  if (isConnectMethodAvailable(currentMethod, methods, protocol, appConfig)) return currentMethod;
  if (canUse(preferredMethod)) return preferredMethod;
  if (builtin) return builtin.value;

  if (desktopRuntime) {
    const normalizedProtocol = protocol.toLowerCase();
    const preferredClient = (Object.values(appConfig || {}) as ConfigItem[][])
      .flat()
      .find(
        (item) =>
          isApplicationConfigItemAvailable(item, normalizedProtocol) &&
          item.match_first?.some((value) => value.toLowerCase() === normalizedProtocol)
      );
    const nativeMethod = methods.find((method) =>
      ["native", "client", "local", "desktop"].includes(String(method.type || "").toLowerCase())
    );
    if (preferredClient && nativeMethod)
      return createLocalApplicationConnectMethod(nativeMethod.value, preferredClient.name);
  }

  return methods[0]?.value || "";
};

const fetchPromise = new Map<string, Promise<ConnectMethodsResponse>>();

const WEB_IFRAME_COMPONENTS = new Set(["koko", "lion", "chen", "tinker", "default"]);
const KOKO_WEB_CONNECT_METHODS = new Set(
  COMPONENT_WORKSPACE_CAPABILITIES.filter(
    (capability) => capability.component === "koko" && capability.backendConnectMethod
  ).map((capability) => capability.backendConnectMethod!)
);

export const withKokoWebFallback = (protocol: string, methods: ConnectMethod[]) => {
  const normalizedProtocol = protocol.toLowerCase();
  const existingValues = new Set(methods.map((method) => method.value));
  const fallbackMethods = COMPONENT_WORKSPACE_CAPABILITIES.filter(
    (capability) =>
      capability.component === "koko" &&
      capability.surface !== "web-browser" &&
      capability.protocols.includes(normalizedProtocol) &&
      capability.backendConnectMethod
  ).flatMap((capability) => {
    const origin = methods.find(
      (method) =>
        method.value === capability.backendConnectMethod || method.origin_value === capability.backendConnectMethod
    );
    if (!origin || origin.disabled) return [];

    return capability.connectMethods
      .filter((value) => !existingValues.has(value))
      .map((value) => ({
        value,
        label: capability.label,
        type: origin?.type || "web",
        icon: origin?.icon || "",
        disabled: false,
        listen: origin?.listen || "",
        component: origin?.component || "koko",
        endpoint_protocol: origin?.endpoint_protocol || "http",
        origin_value: capability.backendConnectMethod
      }));
  });

  return [...fallbackMethods, ...methods] as ConnectMethod[];
};

const isWebIframeMethod = (method: ConnectMethod) => {
  if (method.origin_value) return false;
  return method.type === "web" && WEB_IFRAME_COMPONENTS.has(method.component);
};

const methodFixture = (overrides: Partial<ConnectMethod>): ConnectMethod => ({
  value: "x",
  label: "x",
  type: "",
  icon: "",
  disabled: false,
  listen: "",
  component: "",
  ...overrides
});

function assertWebIframeFilter() {
  const checks: Array<[ConnectMethod, boolean]> = [
    [methodFixture({ type: "web", component: "koko" }), true],
    [methodFixture({ type: "web", component: "koko", origin_value: "web_cli" }), false],
    [methodFixture({ type: "native", component: "koko" }), false],
    [methodFixture({ type: "client", component: "lion" }), false]
  ];

  for (const [method, expected] of checks) {
    if (isWebIframeMethod(method) !== expected) {
      throw new Error(`isWebIframeMethod mismatch for ${method.type}/${method.component}`);
    }
  }
}

if (import.meta.dev) assertWebIframeFilter();

export const normalizeWebConnectMethods = (
  methods: ConnectMethodsResponse,
  desktopRuntime = isDesktopRuntime()
): ConnectMethodsResponse => {
  const normalized: ConnectMethodsResponse = { ...methods };

  Object.keys(normalized).forEach((key) => {
    const value = normalized[key];
    if (!Array.isArray(value)) return;

    const normalizedMethods = [...value];

    for (const capability of COMPONENT_WORKSPACE_CAPABILITIES) {
      if (
        capability.component !== "koko" ||
        !capability.protocols.includes(key.toLowerCase()) ||
        !capability.backendConnectMethod ||
        (!desktopRuntime && capability.surface === "web-browser")
      )
        continue;

      const originIndex = normalizedMethods.findIndex((method) => method.value === capability.backendConnectMethod);
      if (originIndex === -1) continue;

      const origin = normalizedMethods[originIndex]!;
      normalizedMethods.splice(
        originIndex,
        0,
        ...capability.connectMethods.map(
          (methodValue) =>
            ({
              ...origin,
              value: methodValue,
              label: capability.label,
              origin_value: origin.value
            }) as ConnectMethod
        )
      );
    }

    const lionWebIndex = normalizedMethods.findIndex(
      (method) => method.type === "web" && ["lion", "tinker"].includes(method.component)
    );

    if (lionWebIndex !== -1) {
      const origin = normalizedMethods[lionWebIndex]!;
      const declaredMethods = COMPONENT_WORKSPACE_CAPABILITIES.filter(
        (item) => item.component === "lion" && item.protocols.includes(key.toLowerCase())
      ).flatMap((item) =>
        item.connectMethods.map(
          (methodValue) =>
            ({
              ...origin,
              value: methodValue,
              label: item.label,
              origin_value: origin.value
            }) as ConnectMethod
        )
      );

      if (declaredMethods.length) {
        normalizedMethods.splice(lionWebIndex, 0, ...declaredMethods);
      }
    }

    const chenWebIndex = normalizedMethods.findIndex((method) => method.type === "web" && method.component === "chen");

    if (chenWebIndex !== -1) {
      const origin = normalizedMethods[chenWebIndex]!;
      const declaredMethods = COMPONENT_WORKSPACE_CAPABILITIES.filter(
        (item) => item.component === "chen" && item.protocols.includes(key.toLowerCase())
      ).flatMap((item) =>
        item.connectMethods.map(
          (methodValue) =>
            ({
              ...origin,
              value: methodValue,
              label: item.label,
              origin_value: origin.value
            }) as ConnectMethod
        )
      );

      if (declaredMethods.length) {
        normalizedMethods.splice(chenWebIndex, 0, ...declaredMethods);
      }
    }

    normalized[key] = normalizedMethods.filter(
      (method) =>
        method.origin_value ||
        !((method.type === "web" && KOKO_WEB_CONNECT_METHODS.has(method.value)) || isWebIframeMethod(method))
    );
  });

  return normalized;
};

export const useConnectMethods = () => {
  const { t } = useI18n();
  const { currentAccountId, orgId } = storeToRefs(useUserInfoStore());

  const fetchConnectMethods = async (): Promise<ConnectMethodsResponse> => {
    const key = `${currentAccountId.value || ""}:${orgId.value || ""}`;
    const running = fetchPromise.get(key);

    if (running) {
      return running;
    }

    const promise = getConnectMethods().then((data) => normalizeWebConnectMethods(data as ConnectMethodsResponse));

    fetchPromise.set(key, promise);

    try {
      const result = await promise;
      return result;
    } finally {
      fetchPromise.delete(key);
    }
  };

  const getMethodsForProtocol = async (protocol: string): Promise<ConnectMethod[]> => {
    const allMethods = await fetchConnectMethods();
    const normalizedProtocol = protocol.trim().toLowerCase();
    const protocolMethods =
      Object.entries(allMethods).find(
        ([key, methods]) => key.toLowerCase() === normalizedProtocol && Array.isArray(methods)
      )?.[1] || [];
    const methodsWithFallback = withKokoWebFallback(normalizedProtocol, protocolMethods);
    return methodsWithFallback
      .filter((method) => !method.disabled)
      .map((method) => ({
        ...method,
        label: method.label.startsWith("ConnectMethod.") ? t(method.label) : method.label
      }));
  };

  const getDefaultMethodForProtocol = async (protocol: string): Promise<string> => {
    const methods = await getMethodsForProtocol(protocol);
    if (methods.length === 0) {
      return "";
    }
    return methods[0]?.value || "";
  };

  const getMethodDisplayName = async (protocol: string, methodValue: string): Promise<string> => {
    const methods = await getMethodsForProtocol(protocol);
    const method = methods.find((m) => m.value === methodValue);
    return method?.label ?? methodValue;
  };

  const clearCache = () => {
    fetchPromise.clear();
  };

  return {
    fetchConnectMethods,
    getMethodsForProtocol,
    getDefaultMethodForProtocol,
    getMethodDisplayName,
    clearCache
  };
};
