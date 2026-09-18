import type { ConnectorSessionContext } from "@jumpserver/connectors-core";

import type { Ref } from "vue";
import type { KokoWorkspaceTab } from "#koko/host";

import { connectorSessionKey, resolveEndpointUrl } from "@jumpserver/connectors-core";
import { onScopeDispose } from "vue";
import { useKokoHostAdapter } from "#koko/host";

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
  let prepareGeneration = 0;

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

  async function fetchEndpointUrl(forToken = tokenId.value) {
    const explicitEndpoint = String(tab.value.payload?.endpointUrl || "").trim();
    if (explicitEndpoint) return explicitEndpoint;

    const endpoint = await host.getSmartEndpoint({
      protocol: resolvedProtocol.value,
      assetId: tab.value.assetId,
      token: forToken
    });
    return resolveEndpointUrl(endpoint, host.getWindowOrigin());
  }

  async function fetchTicket(endpointUrl: string, forToken = tokenId.value) {
    try {
      const ticketResult = await host.createTicket({ baseUrl: endpointUrl, tokenId: forToken });
      return String(ticketResult.ticket || "");
    } catch (cause) {
      if (host.isDesktopRuntime()) throw cause;
      console.warn("[koko] connect ticket failed, fallback to cookie auth:", cause);
      return "";
    }
  }

  async function prepareSession() {
    const generation = ++prepareGeneration;
    const terminalCommandHistoryScope = host.terminalCommandSuggestions?.scope() || "";
    const preparedTab = { ...tab.value };
    const preparedTokenId = tokenId.value;
    if (!preparedTokenId) {
      error.value = t("koko.fileManagement.missingConnectionToken");
      host.markSessionFailed(
        {
          id: tab.value.id,
          assetId: tab.value.assetId,
          protocol: tab.value.protocol,
          account: tab.value.account
        },
        error.value
      );
      loading.value = false;
      return null;
    }

    if (context.value?.tokenId === preparedTokenId && !error.value) return context.value;

    loading.value = true;
    error.value = "";

    try {
      const endpointUrl = await fetchEndpointUrl(preparedTokenId);
      if (generation !== prepareGeneration) return null;
      const ticket = await fetchTicket(endpointUrl, preparedTokenId);
      if (generation !== prepareGeneration) return null;

      context.value = {
        component: "koko",
        tokenId: preparedTokenId,
        ticket,
        endpointUrl,
        tabId: preparedTab.id,
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

      return context.value;
    } catch (cause) {
      if (generation !== prepareGeneration) return null;
      error.value = String(cause);
      host.markSessionFailed(
        {
          id: preparedTab.id,
          assetId: preparedTab.assetId,
          protocol: preparedTab.protocol,
          account: preparedTab.account
        },
        error.value
      );
      return null;
    } finally {
      if (generation === prepareGeneration) loading.value = false;
    }
  }

  watch([themeType, () => colorMode.value], syncContextTheme);
  onScopeDispose(() => {
    prepareGeneration += 1;
  });

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
