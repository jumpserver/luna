import { computed, onMounted, onScopeDispose, ref, shallowRef } from "vue";
import type { AgentProfile, AgentSession, LocalAgentsSnapshot } from "~/shared/agents/types";
import { desktopInvoke, desktopListen } from "~/shared/desktop/bridge";
import { isDesktopRuntime } from "~/utils/runtime";

export function useLocalAgents() {
  const desktop = isDesktopRuntime();
  const snapshot = shallowRef<LocalAgentsSnapshot>({ enabled: false, site: "", profiles: [], sessions: [] });
  const loaded = ref(!desktop);
  const error = ref("");
  let disposed = false;
  let revision = 0;
  let unlisten: (() => void) | undefined;

  async function refresh() {
    if (!desktop || disposed) return;
    const requestedRevision = ++revision;
    try {
      const result = await desktopInvoke<LocalAgentsSnapshot>("local_agents_status");
      // A live event can arrive while the initial snapshot is in flight.
      if (!disposed && revision === requestedRevision) snapshot.value = result;
      if (!disposed && revision === requestedRevision) error.value = "";
    } catch (cause) {
      if (!disposed && revision === requestedRevision)
        error.value = cause instanceof Error ? cause.message : String(cause);
    } finally {
      if (!disposed && revision === requestedRevision) loaded.value = true;
    }
  }

  onMounted(async () => {
    if (!desktop) return;
    try {
      const stop = await desktopListen<LocalAgentsSnapshot>("local-agents-changed", ({ payload }) => {
        if (disposed) return;
        revision++;
        snapshot.value = payload;
        loaded.value = true;
        error.value = "";
      });
      if (disposed) return stop();
      unlisten = stop;
      await refresh();
    } catch (cause) {
      if (!disposed) {
        error.value = cause instanceof Error ? cause.message : String(cause);
        loaded.value = true;
      }
    }
  });
  onScopeDispose(() => {
    disposed = true;
    unlisten?.();
  });

  async function change<T = void>(command: string, args: Record<string, unknown>) {
    const result = await desktopInvoke<T>(command, args);
    await refresh();
    return result;
  }

  return {
    desktop,
    loaded,
    error,
    enabled: computed(() => desktop && snapshot.value.enabled),
    site: computed(() => snapshot.value.site),
    profiles: computed(() => snapshot.value.profiles),
    sessions: computed(() => snapshot.value.sessions),
    refresh,
    open: () => desktopInvoke<void>("local_agents_open"),
    saveProfile: (profile: AgentProfile) => change("local_agents_save_profile", { profile }),
    deleteProfile: (id: string) => change("local_agents_delete_profile", { id }),
    probe: (profile: AgentProfile) => desktopInvoke<{ version: string }>("local_agents_probe", { profile }),
    create: (profileId: string) => change<AgentSession>("local_agents_create", { profileId }),
    send: (sessionId: string, text: string) => change("local_agents_send", { sessionId, text }),
    approve: (sessionId: string, requestId: string, allow: boolean) =>
      change("local_agents_approve", { sessionId, requestId, allow }),
    stop: (sessionId: string) => change("local_agents_stop", { sessionId }),
    closeSession: (sessionId: string) => change("local_agents_close_session", { sessionId })
  };
}
