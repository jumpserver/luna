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

const connectMethodsCache = new Map<string, ConnectMethodsResponse>();
const fetchPromise = new Map<string, Promise<ConnectMethodsResponse>>();

const isWebIframeMethod = (method: ConnectMethod) => {
  return method.type === "web" || ["koko", "lion", "chen", "tinker", "default"].includes(method.component);
};

const normalizeWebConnectMethods = (methods: ConnectMethodsResponse): ConnectMethodsResponse => {
  const normalized: ConnectMethodsResponse = { ...methods };

  Object.keys(normalized).forEach((key) => {
    const value = normalized[key];
    if (!Array.isArray(value)) return;

    const normalizedMethods = [...value];

    const kokoWebIndex = normalizedMethods.findIndex(
      (method) => method.type === "web" && ["koko", "default"].includes(method.component)
    );

    if (kokoWebIndex !== -1) {
      const origin = normalizedMethods[kokoWebIndex]!;
      const declaredMethods = COMPONENT_WORKSPACE_CAPABILITIES
        .filter((item) => item.component === "koko" && item.protocols.includes(key))
        .flatMap((item) =>
          item.connectMethods.map((methodValue) => ({
            ...origin,
            value: methodValue,
            label: item.label,
            origin_value: origin.value
          }) as ConnectMethod)
        );

      if (declaredMethods.length) {
        normalizedMethods.splice(kokoWebIndex, 0, ...declaredMethods);
      }
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

    normalized[key] = normalizedMethods.filter((method) => method.origin_value || !isWebIframeMethod(method));
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
    // Web iframe is used only as the backend method source for injected workspace methods.
    return protocolMethods.filter((method) => !method.disabled);
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
