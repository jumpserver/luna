import type { Ref } from "vue";

import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";
import type { ConnectorSessionContext } from "~/shared/connectors/types/session";

import { connectorSessionKey } from "~/koko/composables/wsUrl";

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
      // ponytail: dev 走 nuxt proxy（/lion/、/lion/ws/ → localhost:8081），暂不拉 smart endpoint
      context.value = {
        component: "lion",
        tokenId: tokenId.value,
        endpointUrl: window.location.origin,
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
