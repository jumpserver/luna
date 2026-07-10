import {
  COMPONENT_WORKSPACE_CAPABILITIES,
  K8S_PROTOCOLS
} from "~/shared/connectors/capabilities";
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

const normalizeWebConnectMethods = (methods: ConnectMethodsResponse): ConnectMethodsResponse => {
  const normalized: ConnectMethodsResponse = { ...methods };

  Object.keys(normalized).forEach((key) => {
    const value = normalized[key];
    if (!Array.isArray(value)) return;

    // 原远端 iframe 方式统一命名为 Web iframe
    const renamed = value.map((method) => {
      const isWebSurface = method.type === "web" || ["koko", "lion", "chen", "tinker", "default"].includes(method.component);
      return isWebSurface
        ? { ...method, label: "Web iframe" }
        : method;
    });

    const kokoWebIndex = renamed.findIndex(
      (method) => method.type === "web" && ["koko", "default"].includes(method.component)
    );

    if (kokoWebIndex !== -1) {
      const origin = renamed[kokoWebIndex]!;
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
        const replaceOrigin = key === "sftp" || K8S_PROTOCOLS.has(key);
        renamed.splice(kokoWebIndex, replaceOrigin ? 1 : 0, ...declaredMethods);
      }
    }

    const lionWebIndex = renamed.findIndex(
      (method) => method.type === "web" && ["lion", "tinker"].includes(method.component)
    );

    if (lionWebIndex !== -1) {
      const origin = renamed[lionWebIndex]!;
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
        renamed.splice(lionWebIndex, 1, ...declaredMethods);
      }
    }

    const chenWebIndex = renamed.findIndex(
      (method) => method.type === "web" && method.component === "chen"
    );

    if (chenWebIndex !== -1) {
      const origin = renamed[chenWebIndex]!;
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
        renamed.splice(chenWebIndex, 1, ...declaredMethods);
      }
    }

    normalized[key] = renamed;
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
    // 与 Luna 对齐：连接方法以服务端返回为准，仅过滤 disabled。
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
