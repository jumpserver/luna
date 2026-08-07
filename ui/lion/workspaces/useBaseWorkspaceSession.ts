import type { ConnectorSessionContext } from "@jumpserver/connectors-core";

import type { Ref } from "vue";
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";
import { connectorSessionKey } from "@jumpserver/connectors-core";

export function useBaseWorkspaceSession(tab: Ref<WorkspaceSessionTab>) {
  const colorMode = useColorMode();
  const { markSessionConnected, markSessionFailed } = useWorkspaceTabs();

  const loading = ref(false);
  const error = ref("");
  const context = ref<ConnectorSessionContext | null>(null);

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
    if (!tokenId.value) {
      error.value = "Missing connection token";
      loading.value = false;
      return null;
    }

    loading.value = true;
    error.value = "";

    try {
      context.value = {
        component: "lion",
        tokenId: tokenId.value,
        endpointUrl: resolveEndpointUrl(),
        tabId: tab.value.id,
        colorMode: colorMode.value,
        themeType: themeType.value
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
    loading,
    prepareSession,
    token,
    tokenId
  };
}
