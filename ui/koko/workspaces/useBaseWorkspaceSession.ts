import type { Ref } from "vue";

import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";
import type { ConnectorSessionContext } from "~/shared/connectors/types/session";

import { connectorSessionKey } from "~/koko/composables/wsUrl";
import { resolveDevHost } from "~/shared/connectors/useConnectorEndpoint";

interface UseBaseWorkspaceSessionOptions {
  protocol?: string
  disableAutoHash?: string
}

export function useBaseWorkspaceSession(
  tab: Ref<WorkspaceSessionTab>,
  options: UseBaseWorkspaceSessionOptions = {}
) {
  const colorMode = useColorMode();
  const { createKokoTicket } = useWorkspaceConnectors();
  const { markSessionConnected, markSessionFailed } = useWorkspaceTabs();

  const loading = ref(false);
  const error = ref("");
  const context = ref<ConnectorSessionContext | null>(null);

  provide(connectorSessionKey, context);

  const token = computed(() => tab.value.payload?.token || tab.value.payload || {});
  const tokenId = computed(() => String(tab.value.payload?.id || token.value?.id || ""));
  const themeType = computed(() => (colorMode.value === "dark" ? "darkGary" : "default"));
  const resolvedProtocol = computed(() => options.protocol || tab.value.protocol || "ssh");

  function syncContextTheme() {
    if (!context.value) return;
    context.value.colorMode = colorMode.value;
    context.value.themeType = themeType.value;
  }

  async function fetchEndpointUrl() {
    if (import.meta.dev) {
      return resolveDevHost("koko") || window.location.origin;
    }

    const endpoint = await getSmartEndpoint({
      protocol: resolvedProtocol.value,
      assetId: tab.value.assetId,
      token: tokenId.value
    });
    const host = endpoint.host;
    const port = endpoint.https_port || endpoint.port;
    const scheme = endpoint.https_port ? "https" : "http";
    const resolved = endpoint.value || (host ? (port ? `${scheme}://${host}:${port}` : `${scheme}://${host}`) : "");

    if (!resolved) return window.location.origin;

    if (isTauriRuntime()) return resolved;

    const resolvedUrl = new URL(resolved);
    const isLoopback = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(resolvedUrl.hostname);
    const samePort = (resolvedUrl.port || "") === window.location.port;

    if (isLoopback && !samePort) return window.location.origin;

    return resolved;
  }

  async function fetchTicket(endpointUrl: string) {
    try {
      const ticketResult = await createKokoTicket({ baseUrl: endpointUrl, tokenId: tokenId.value });
      return String(ticketResult.ticket || "");
    } catch (cause) {
      if (isTauriRuntime()) throw cause;
      console.warn("[koko] connect ticket failed, fallback to cookie auth:", cause);
      return "";
    }
  }

  async function prepareSession() {
    if (!tokenId.value) {
      error.value = "Missing connection token";
      loading.value = false;
      return null;
    }

    loading.value = true;
    error.value = "";

    try {
      const endpointUrl = await fetchEndpointUrl();
      const ticket = await fetchTicket(endpointUrl);

      context.value = {
        component: "koko",
        tokenId: tokenId.value,
        ticket,
        endpointUrl,
        tabId: tab.value.id,
        colorMode: colorMode.value,
        themeType: themeType.value,
        disableAutoHash: options.disableAutoHash
      };

      markSessionConnected(tab.value.id);
      return context.value;
    } catch (cause) {
      error.value = String(cause);
      markSessionFailed({
        tabId: tab.value.id,
        assetId: tab.value.assetId,
        protocol: tab.value.protocol,
        account: tab.value.account
      });
      return null;
    } finally {
      loading.value = false;
    }
  }

  watch([themeType, () => colorMode.value], syncContextTheme);

  return {
    context,
    error,
    fetchEndpointUrl,
    fetchTicket,
    loading,
    prepareSession,
    resolvedProtocol,
    syncContextTheme,
    themeType,
    token,
    tokenId
  };
}
