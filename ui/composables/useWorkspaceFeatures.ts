import type { Ref } from "vue";
import { useEventListener } from "@vueuse/core";
import { computed, onScopeDispose, watch } from "vue";
import { getPublicSettings } from "~/composables/useApiRequest";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { setWorkspaceAiEnabled } from "~/shared/aiAvailability";

// Read once per authenticated context, then refresh when returning from system settings.
// This runs in app.vue so web, desktop and standalone asset windows share the policy.
export function useWorkspaceFeatures(authReady: Ref<boolean>) {
  const userInfoStore = useUserInfoStore();
  const context = computed(() =>
    authReady.value && userInfoStore.loggedIn
      ? JSON.stringify([userInfoStore.currentSite, userInfoStore.currentAccountId, userInfoStore.orgId])
      : ""
  );
  let generation = 0;
  let pending: Promise<void> | null = null;

  function refresh() {
    if (!context.value) return Promise.resolve();
    if (pending) return pending;
    const currentGeneration = generation;
    const request = getPublicSettings()
      .then((settings) => {
        if (generation !== currentGeneration) return;
        setWorkspaceAiEnabled(settings.CHAT_AI_ENABLED === true);
        userInfoStore.setCommandExecutionEnabled(settings.SECURITY_COMMAND_EXECUTION === true);
      })
      .catch(() => {
        if (generation !== currentGeneration) return;
        setWorkspaceAiEnabled(false);
        userInfoStore.setCommandExecutionEnabled(false);
      })
      .finally(() => {
        if (pending === request) pending = null;
      });
    pending = request;
    return request;
  }

  watch(
    context,
    () => {
      generation += 1;
      pending = null;
      setWorkspaceAiEnabled(false);
      void refresh();
    },
    { immediate: true, flush: "sync" }
  );
  useEventListener("focus", refresh);
  useEventListener(
    () => globalThis.document,
    "visibilitychange",
    () => {
      if (document.visibilityState === "visible") void refresh();
    }
  );
  onScopeDispose(() => {
    generation += 1;
    setWorkspaceAiEnabled(false);
  });

  return { refresh };
}
