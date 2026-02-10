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

let connectMethodsCache: ConnectMethodsResponse | null = null;
let fetchPromise: Promise<ConnectMethodsResponse> | null = null;

export const useConnectMethods = () => {
  const { currentSite, currentUser } = storeToRefs(useUserInfoStore());

  const fetchConnectMethods = async (): Promise<ConnectMethodsResponse> => {
    if (connectMethodsCache) {
      return connectMethodsCache;
    }

    if (fetchPromise) {
      return fetchPromise;
    }

    fetchPromise = new Promise(async (resolve, reject) => {
      const unlistenSuccess = await useTauriEventListen("get-connect-methods-success", (event) => {
        interface eventPayload {
          status: number;
          data: string;
        }

        const payload = event.payload as eventPayload;
        if (payload.status === 200) {
          try {
            const methods = JSON.parse(payload.data) as ConnectMethodsResponse;
            connectMethodsCache = methods;
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
        bearerToken: currentUser.value?.bearerToken
      });
    });

    try {
      const result = await fetchPromise;
      return result;
    } finally {
      fetchPromise = null;
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
    connectMethodsCache = null;
  };

  return {
    fetchConnectMethods,
    getMethodsForProtocol,
    getDefaultMethodForProtocol,
    getMethodDisplayName,
    clearCache
  };
};
