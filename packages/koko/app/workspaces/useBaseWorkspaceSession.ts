import type { ConnectorSessionContext } from "@jumpserver/connectors-core";

import type { KokoWorkspaceTab } from "@jumpserver/koko/host";
import type { Ref } from "vue";

import { connectorSessionKey, resolveDevHost } from "@jumpserver/connectors-core";
import { useKokoHostAdapter } from "@jumpserver/koko/host";

interface UseBaseWorkspaceSessionOptions {
  protocol?: string;
  disableAutoHash?: string;
}

export function useBaseWorkspaceSession(tab: Ref<KokoWorkspaceTab>, options: UseBaseWorkspaceSessionOptions = {}) {
  const colorMode = useColorMode();
  const { t } = useI18n();
  const host = useKokoHostAdapter();

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
      return resolveDevHost("koko") || host.getWindowOrigin();
    }

    const endpoint = await host.getSmartEndpoint({
      protocol: resolvedProtocol.value,
      assetId: tab.value.assetId,
      token: tokenId.value
    });
    const endpointHost = endpoint.host;
    const port = endpoint.https_port || endpoint.port;
    const scheme = endpoint.https_port ? "https" : "http";
    const resolved =
      endpoint.value ||
      (endpointHost ? (port ? `${scheme}://${endpointHost}:${port}` : `${scheme}://${endpointHost}`) : "");

    if (!resolved) return host.getWindowOrigin();

    if (host.isDesktopRuntime()) return resolved;

    const resolvedUrl = new URL(resolved);
    const isLoopback = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(resolvedUrl.hostname);
    const samePort = (resolvedUrl.port || "") === new URL(host.getWindowOrigin()).port;

    if (isLoopback && !samePort) return host.getWindowOrigin();

    return resolved;
  }

  async function fetchTicket(endpointUrl: string) {
    try {
      const ticketResult = await host.createTicket({ baseUrl: endpointUrl, tokenId: tokenId.value });
      return String(ticketResult.ticket || "");
    } catch (cause) {
      if (host.isDesktopRuntime()) throw cause;
      console.warn("[koko] connect ticket failed, fallback to cookie auth:", cause);
      return "";
    }
  }

  async function prepareSession() {
    const terminalCommandHistoryScope = host.terminalCommandSuggestions?.scope() || "";
    if (!tokenId.value) {
      error.value = t("koko.fileManagement.missingConnectionToken");
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
        disableAutoHash: options.disableAutoHash,
        actions: tab.value.payload?.actions || token.value?.actions,
        terminalCommandHistoryScope,
        terminalProfile: {
          protocol: tab.value.protocol,
          assetPlatform: tab.value.assetPlatform,
          assetType: tab.value.assetType,
          assetCategory: tab.value.assetCategory
        }
      };

      host.markSessionConnected(tab.value.id);
      return context.value;
    } catch (cause) {
      error.value = String(cause);
      host.markSessionFailed({
        id: tab.value.id,
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
