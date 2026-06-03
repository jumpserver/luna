import { useUserInfoStore } from "~/store/modules/userInfo";

interface ConnectMethod {
  value: string;
  label: string;
  type: string;
  icon: string;
  disabled: boolean;
  listen: string;
  component: string;
}

interface ConnectMethodsResponse {
  [protocol: string]: ConnectMethod[];
  originals: ConnectMethod[];
}

let connectMethodsCache = new Map<string, ConnectMethodsResponse>();
let fetchPromise = new Map<string, Promise<ConnectMethodsResponse>>();

export const useConnectMethods = () => {
  const { currentSite, currentUser, orgId } = storeToRefs(useUserInfoStore());

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

    const promise = new Promise<ConnectMethodsResponse>(async (resolve, reject) => {
      const unlistenSuccess = await useTauriEventListen("get-connect-methods-success", (event) => {
        interface eventPayload {
          status: number;
          data: string;
        }

        const payload = event.payload as eventPayload;
        if (payload.status === 200) {
          try {
            const methods = JSON.parse(payload.data) as ConnectMethodsResponse;
            connectMethodsCache.set(key, methods);
            resolve(methods);
          } catch (error) {
            reject(error);
          }
        }
        unlistenSuccess?.();
        unlistenFailure?.();
      });

      const unlistenFailure = await useTauriEventListen("get-connect-methods-failure", () => {
        reject(new Error("Failed to fetch connect methods"));
        unlistenSuccess?.();
        unlistenFailure?.();
      });

      useTauriCoreInvoke("get_connect_methods", {
        site: currentSite.value,
        bearerToken: currentUser.value?.bearerToken,
        orgId: orgId.value
      });
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
    if (protocol === "http") {
        return protocolMethods.filter((method) => !method.disabled && method.type === "applet")
    }else {
        return protocolMethods.filter((method) => {
            return !method.disabled && (method.type === "native" && !method.value.endsWith("_guide"));
        });
    }
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
