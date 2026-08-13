import type { ConnectorSessionContext } from "@jumpserver/connectors-core";

import type { Ref } from "vue";
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";
import { connectorSessionKey } from "@jumpserver/connectors-core";
import { onScopeDispose } from "vue";
import { createLionConnectTicket } from "@/lion/hooks/useLionConnectTicket";

export function useBaseWorkspaceSession(tab: Ref<WorkspaceSessionTab>) {
  const colorMode = useColorMode();
  const { markSessionConnected, markSessionFailed } = useWorkspaceTabs();

  const loading = ref(false);
  const error = ref("");
  const context = ref<ConnectorSessionContext | null>(null);
  let prepareGeneration = 0;

  provide(connectorSessionKey, context);

  const token = computed(() => tab.value.payload?.token || tab.value.payload || {});
  const tokenId = computed(() => String(tab.value.payload?.id || token.value?.id || ""));
  const themeType = computed(() => (colorMode.value === "dark" ? "darkGary" : "default"));

  function resolveEndpointUrl() {
    const endpointUrl = String(tab.value.payload?.endpointUrl || "").trim();
    if (endpointUrl) return endpointUrl;

    const webUrl = String(tab.value.payload?.webUrl || "").trim();
    if (webUrl) {
      try {
        return new URL(webUrl, window.location.origin).origin;
      } catch {
        // Fall back to the current origin for legacy or malformed payloads.
      }
    }

    return window.location.origin;
  }

  function syncContextTheme() {
    if (!context.value) return;
    context.value.colorMode = colorMode.value;
    context.value.themeType = themeType.value;
  }

  async function prepareSession() {
    const generation = ++prepareGeneration;
    const preparedTokenId = tokenId.value;
    const preparedTab = {
      id: tab.value.id,
      assetId: tab.value.assetId,
      protocol: tab.value.protocol,
      account: tab.value.account
    };
    context.value = null;

    if (!preparedTokenId) {
      error.value = "Missing connection token";
      loading.value = false;
      return null;
    }

    loading.value = true;
    error.value = "";

    try {
      const endpointUrl = resolveEndpointUrl();
      const ticket = await createLionConnectTicket(endpointUrl, preparedTokenId);
      if (generation !== prepareGeneration) return null;
      context.value = {
        component: "lion",
        tokenId: preparedTokenId,
        ticket,
        endpointUrl,
        tabId: preparedTab.id,
        colorMode: colorMode.value,
        themeType: themeType.value
      };

      markSessionConnected(preparedTab.id);
      return context.value;
    } catch (cause) {
      if (generation !== prepareGeneration) return null;
      error.value = String(cause);
      markSessionFailed({
        tabId: preparedTab.id,
        assetId: preparedTab.assetId,
        protocol: preparedTab.protocol,
        account: preparedTab.account
      });
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
    loading,
    prepareSession,
    token,
    tokenId
  };
}
