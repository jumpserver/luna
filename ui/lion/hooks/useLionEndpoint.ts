import type { MaybeRefOrGetter } from "vue";
import { computed, toValue } from "vue";

import { useUserInfoStore } from "~/store/modules/userInfo";
import { isTauriRuntime } from "~/utils/runtime";

export function useLionEndpoint(explicitEndpoint?: MaybeRefOrGetter<string | undefined>) {
  const userInfoStore = useUserInfoStore();

  return computed(() => {
    const explicit = String(toValue(explicitEndpoint) || "").trim();
    if (explicit) return explicit;
    if (!import.meta.client) return "";
    if (isTauriRuntime() && userInfoStore.currentSite) return userInfoStore.currentSite;
    return window.location.origin;
  });
}
