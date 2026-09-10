import type { ConnectorSessionContext } from "@jumpserver/connectors-core";
import { isLoopbackUrl } from "@jumpserver/connectors-core";
import { apiRequest, getSmartEndpoint } from "~/composables/useApiRequest";
import { getKokoMonitorComponent } from "~/koko/composables/useKokoMonitor";
import { createLionConnectTicket } from "~/lion/hooks/useLionConnectTicket";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { isDesktopRuntime } from "~/utils/runtime";

export interface MonitoredSession {
  id: string;
  user: string;
  asset: string;
  account: string;
  protocol: string;
  org_id?: string;
  terminal: { type: string };
  type: { value: string };
  is_locked: boolean;
  is_finished: boolean;
  can_join: boolean;
}

export function monitorEndpointUrl(
  endpoint: { host?: string; http_port?: number; https_port?: number; port?: number },
  site: string
) {
  const url = new URL(site);
  const port = (url.protocol === "https:" ? endpoint.https_port : endpoint.http_port) ?? endpoint.port;
  if (endpoint.host) {
    url.hostname = endpoint.host.includes(":") && !endpoint.host.startsWith("[") ? `[${endpoint.host}]` : endpoint.host;
  }
  if (port) url.port = String(port);
  else if (port !== 0 && endpoint.host) url.port = "";
  return url.origin;
}

export function useSessionMonitor(sessionId: string, ticketId = "", orgId?: string) {
  const { t } = useI18n();
  const toast = useToast();
  const colorMode = useColorMode();
  const { bootstrapPersistedSession } = useAuthSession();
  const userInfo = useUserInfoStore();
  const { activePaneId } = useWorkspaceTabs();
  const session = shallowRef<MonitoredSession | null>(null);
  const sessionContext = shallowRef<ConnectorSessionContext | null>(null);
  const component = shallowRef("");
  const endpointUrl = shallowRef("");
  const loading = shallowRef(true);
  const error = shallowRef("");
  const toggling = shallowRef(false);
  let disposed = false;

  const supportedLock = computed(
    () => session.value?.type.value === "normal" && ["koko", "lion", "chen"].includes(session.value.terminal.type)
  );

  async function load() {
    try {
      await bootstrapPersistedSession();
      if (disposed) return;
      const detail = await apiRequest<MonitoredSession>({
        method: "GET",
        path: `/api/v1/terminal/sessions/${encodeURIComponent(sessionId)}/`,
        orgId
      });
      if (disposed) return;
      session.value = detail;
      if (detail.is_finished || !detail.can_join) throw new Error(t("Monitor.Unavailable"));

      const desktop = isDesktopRuntime();
      const site = desktop ? userInfo.currentSite : window.location.origin;
      const protocol = new URL(site).protocol.replace(":", "");
      const endpoint = await getSmartEndpoint({ protocol, sessionId }, detail.org_id || orgId);
      if (disposed) return;
      let target = monitorEndpointUrl(endpoint, site);
      if (isLoopbackUrl(target) && (import.meta.dev || !desktop)) target = window.location.origin;
      endpointUrl.value = target;

      if (detail.terminal.type === "razor") {
        component.value = "razor";
        return;
      }
      const ticket = await createLionConnectTicket(target);
      if (disposed) return;
      const { component: renderer } = await getKokoMonitorComponent(sessionId, target, ticket);
      if (disposed) return;
      if (!["koko", "lion"].includes(renderer)) throw new Error(t("Monitor.Unavailable"));
      const paneId = `monitor:${sessionId}`;
      sessionContext.value = {
        component: renderer,
        tokenId: "",
        ticket,
        endpointUrl: target,
        tabId: paneId,
        colorMode: colorMode.value,
        themeType: colorMode.value === "dark" ? "darkGary" : "default",
        wsQuery: { type: "monitor", target_id: sessionId },
        terminalProfile: { protocol: detail.protocol }
      };
      if (renderer === "koko") activePaneId.value = paneId;
      component.value = renderer;
    } catch (cause) {
      if (!disposed) error.value = cause instanceof Error ? cause.message : String(cause);
    } finally {
      if (!disposed) loading.value = false;
    }
  }

  async function togglePause() {
    const detail = session.value;
    if (!detail || detail.is_finished || toggling.value || !supportedLock.value) return;
    toggling.value = true;
    const paused = !detail.is_locked;
    try {
      const action = ticketId ? "toggle-lock-session-for-ticket" : "toggle-lock-session";
      const result = await apiRequest<{ ok: string[] }>({
        method: "POST",
        path: `/api/v1/terminal/tasks/${action}/`,
        orgId: detail.org_id || orgId,
        body: { session_id: sessionId, task_name: paused ? "lock_session" : "unlock_session" }
      });
      if (disposed) return;
      if (!result.ok.includes(sessionId)) throw new Error(t("Monitor.Unavailable"));
      session.value = { ...detail, is_locked: paused };
      toast.add({ title: t(paused ? "Monitor.PauseSent" : "Monitor.ResumeSent"), color: "success" });
    } catch (cause) {
      if (!disposed) toast.add({ title: cause instanceof Error ? cause.message : String(cause), color: "error" });
    } finally {
      if (!disposed) toggling.value = false;
    }
  }

  onMounted(load);
  onBeforeUnmount(() => {
    disposed = true;
    if (activePaneId.value === sessionContext.value?.tabId) activePaneId.value = "";
  });

  return { session, sessionContext, component, endpointUrl, loading, error, supportedLock, toggling, togglePause };
}
