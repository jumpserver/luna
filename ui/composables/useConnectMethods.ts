import { COMPONENT_WORKSPACE_CAPABILITIES } from "~/shared/connectors/capabilities";
import { useUserInfoStore } from "~/store/modules/userInfo";

export {
  K8S_NATIVE_VALUE,
  SFTP_FILE_EDITOR_VALUE,
  SFTP_FILE_MANAGER_VALUE,
  WEB_CLI_NATIVE_VALUE,
  WEB_DB_NATIVE_VALUE,
  WEB_RDP_NATIVE_VALUE
} from "~/shared/connectors/capabilities";

interface ConnectMethod {
  value: string
  label: string
  type: string
  icon: string
  disabled: boolean
  listen: string
  component: string
  endpoint_protocol?: string
  origin_value?: string
}

interface ConnectMethodsResponse {
  [protocol: string]: ConnectMethod[]
  originals: ConnectMethod[]
}

const LOCAL_APPLICATION_METHOD_PREFIX = "native_app:";

export const createLocalApplicationConnectMethod = (connectMethod: string, clientName: string) =>
  `${LOCAL_APPLICATION_METHOD_PREFIX}${connectMethod}:${encodeURIComponent(clientName)}`;

export const parseLocalApplicationConnectMethod = (value: string) => {
  const match = /^native_app:([^:]+):(.+)$/.exec(value || "");
  if (!match) return { connectMethod: value, clientName: undefined };

  return {
    connectMethod: match[1] || value,
    clientName: decodeURIComponent(match[2] || "")
  };
};

const connectMethodsCache = new Map<string, ConnectMethodsResponse>();
const fetchPromise = new Map<string, Promise<ConnectMethodsResponse>>();

const WEB_IFRAME_COMPONENTS = new Set(["koko", "lion", "chen", "tinker", "default"]);
const KOKO_WEB_CONNECT_METHODS = new Set(
  COMPONENT_WORKSPACE_CAPABILITIES
    .filter((capability) => capability.component === "koko" && capability.backendConnectMethod)
    .map((capability) => capability.backendConnectMethod!)
);

export const withKokoWebFallback = (protocol: string, methods: ConnectMethod[]) => {
  const normalizedProtocol = protocol.toLowerCase();
  const existingValues = new Set(methods.map((method) => method.value));
  const fallbackMethods = COMPONENT_WORKSPACE_CAPABILITIES
    .filter(
      (capability) =>
        capability.component === "koko"
        && capability.protocols.includes(normalizedProtocol)
        && capability.backendConnectMethod
    )
    .flatMap((capability) =>
      capability.connectMethods
        .filter((value) => !existingValues.has(value))
        .map((value) => ({
          value,
          label: capability.label,
          type: "web",
          icon: "",
          disabled: false,
          listen: "",
          component: "koko",
          endpoint_protocol: "http",
          origin_value: capability.backendConnectMethod
        }))
    );

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

const normalizeWebConnectMethods = (methods: ConnectMethodsResponse): ConnectMethodsResponse => {
  const normalized: ConnectMethodsResponse = { ...methods };

  Object.keys(normalized).forEach((key) => {
    const value = normalized[key];
    if (!Array.isArray(value)) return;

    const normalizedMethods = [...value];

    for (const capability of COMPONENT_WORKSPACE_CAPABILITIES) {
      if (capability.component !== "koko" || !capability.protocols.includes(key) || !capability.backendConnectMethod) continue;

      const originIndex = normalizedMethods.findIndex(
        (method) =>
          method.value === capability.backendConnectMethod
          && method.type === "web"
      );
      if (originIndex === -1) continue;

      const origin = normalizedMethods[originIndex]!;
      normalizedMethods.splice(originIndex, 0, ...capability.connectMethods.map((methodValue) => ({
        ...origin,
        value: methodValue,
        label: capability.label,
        origin_value: origin.value
      }) as ConnectMethod));
    }

    const lionWebIndex = normalizedMethods.findIndex(
      (method) => method.type === "web" && ["lion", "tinker"].includes(method.component)
    );

    if (lionWebIndex !== -1) {
      const origin = normalizedMethods[lionWebIndex]!;
      const declaredMethods = COMPONENT_WORKSPACE_CAPABILITIES
        .filter((item) => item.component === "lion" && item.protocols.includes(key))
        .flatMap((item) =>
          item.connectMethods.map((methodValue) => ({
            ...origin,
            value: methodValue,
            label: item.label,
            origin_value: origin.value
          }) as ConnectMethod)
        );

      if (declaredMethods.length) {
        normalizedMethods.splice(lionWebIndex, 0, ...declaredMethods);
      }
    }

    const chenWebIndex = normalizedMethods.findIndex(
      (method) => method.type === "web" && method.component === "chen"
    );

    if (chenWebIndex !== -1) {
      const origin = normalizedMethods[chenWebIndex]!;
      const declaredMethods = COMPONENT_WORKSPACE_CAPABILITIES
        .filter((item) => item.component === "chen" && item.protocols.includes(key))
        .flatMap((item) =>
          item.connectMethods.map((methodValue) => ({
            ...origin,
            value: methodValue,
            label: item.label,
            origin_value: origin.value
          }) as ConnectMethod)
        );

      if (declaredMethods.length) {
        normalizedMethods.splice(chenWebIndex, 0, ...declaredMethods);
      }
    }

    normalized[key] = normalizedMethods.filter(
      (method) =>
        method.origin_value
        || !(
          (method.type === "web" && KOKO_WEB_CONNECT_METHODS.has(method.value))
          || isWebIframeMethod(method)
        )
    );
  });

  return normalized;
};

export const useConnectMethods = () => {
  const { currentSite, orgId } = storeToRefs(useUserInfoStore());

  const fetchConnectMethods = async (): Promise<ConnectMethodsResponse> => {
    const key = `${currentSite.value || ""}:${orgId.value || ""}`;
    const cached = connectMethodsCache.get(key);

    if (cached) {
      return cached;
    }

    const running = fetchPromise.get(key);

    if (running) {
      return running;
    }

    const promise = getConnectMethods()
      .then((data) => {
        const methods = normalizeWebConnectMethods(data as ConnectMethodsResponse);
        connectMethodsCache.set(key, methods);
        return methods;
      });

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
    const protocolMethods = allMethods[protocol] || [];
    return withKokoWebFallback(protocol, protocolMethods).filter((method) => !method.disabled);
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
    connectMethodsCache.clear();
  };

  return {
    fetchConnectMethods,
    getMethodsForProtocol,
    getDefaultMethodForProtocol,
    getMethodDisplayName,
    clearCache
  };
};
