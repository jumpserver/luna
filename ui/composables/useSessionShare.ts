import type { ConnectorSessionContext } from "@jumpserver/connectors-core";
import { createLionConnectTicket } from "~/lion/hooks/useLionConnectTicket";
import { desktopInvoke } from "~/shared/desktop/bridge";
import { isDesktopRuntime } from "~/utils/runtime";
import { useShareLink } from "./useShareLink";

export function useSessionShare(shareId: string, component: string) {
  const colorMode = useColorMode();
  const { bootstrapPersistedSession } = useAuthSession();
  const { activePaneId } = useWorkspaceTabs();
  const { siteUrl } = useShareLink();
  const sessionContext = shallowRef<ConnectorSessionContext | null>(null);
  const loading = ref(false);
  const error = ref("");
  let disposed = false;

  async function join(code: string) {
    if (loading.value || sessionContext.value || !shareId || !code.trim()) return;
    loading.value = true;
    error.value = "";
    try {
      if (component !== "koko" && component !== "lion") throw new Error("Invalid share link");
      await bootstrapPersistedSession();
      if (disposed) return;
      const endpoint = isDesktopRuntime()
        ? await desktopInvoke<string>("resolve_koko_endpoint", { endpointUrl: siteUrl.value })
        : siteUrl.value;
      if (disposed) return;
      const ticket = await createLionConnectTicket(endpoint);
      if (disposed) return;
      const paneId = `share:${shareId}`;
      sessionContext.value = {
        component,
        tokenId: "",
        ticket,
        endpointUrl: endpoint,
        tabId: paneId,
        colorMode: colorMode.value,
        themeType: colorMode.value === "dark" ? "darkGary" : "default",
        wsQuery: { type: "share", target_id: shareId, code: code.trim() },
        terminalProfile: { protocol: "ssh" }
      };
      if (component === "koko") activePaneId.value = paneId;
    } catch (cause) {
      if (!disposed) error.value = cause instanceof Error ? cause.message : String(cause);
    } finally {
      if (!disposed) loading.value = false;
    }
  }

  onBeforeUnmount(() => {
    disposed = true;
    if (activePaneId.value === sessionContext.value?.tabId) activePaneId.value = "";
  });

  return { sessionContext, loading, error, join };
}
