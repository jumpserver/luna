import { useUserInfoStore } from "~/store/modules/userInfo";

interface ConnectMethod {
  value: string
  label: string
  type: string
  icon: string
  disabled: boolean
  listen: string
  component: string
  endpoint_protocol?: string
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

    normalized[key] = value.map((method) => {
      const isWebCli = method.type === "web" || ["koko", "lion", "chen", "tinker", "default"].includes(method.component);
      return isWebCli
        ? { ...method, label: "Web CLI" }
        : method;
    });
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

    if (!isTauriRuntime()) {
      const response = await fetch(withWebSitePrefix("/api/v1/terminal/components/connect-methods/"), {
        credentials: "include",
        headers: getWebApiHeaders()
      });

      if (!response.ok) {
        throw new Error(`fetch connect methods failed: ${response.status}`);
      }

      const methods = normalizeWebConnectMethods(await response.json() as ConnectMethodsResponse);
      connectMethodsCache.set(key, methods);
      return methods;
    }

    const promise = new Promise<ConnectMethodsResponse>((resolve, reject) => {
      let unlistenSuccess: (() => void) | undefined;
      let unlistenFailure: (() => void) | undefined;
      const cleanup = () => {
        unlistenSuccess?.();
        unlistenFailure?.();
      };

      interface EventPayload {
        status: number
        data: string
      }

      Promise.all([
        useTauriEventListen("get-connect-methods-success", (event) => {
          const payload = event.payload as EventPayload;
          if (payload.status === 200) {
            try {
              const methods = JSON.parse(payload.data) as ConnectMethodsResponse;
              connectMethodsCache.set(key, methods);
              resolve(methods);
            } catch (error) {
              reject(error);
            }
          }
          cleanup();
        }),
        useTauriEventListen("get-connect-methods-failure", () => {
          reject(new Error("Failed to fetch connect methods"));
          cleanup();
        })
      ])
        .then(([success, failure]) => {
          unlistenSuccess = success;
          unlistenFailure = failure;

          useTauriCoreInvoke("get_connect_methods", {}).catch((error) => {
            cleanup();
            reject(error);
          });
        })
        .catch(reject);
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
