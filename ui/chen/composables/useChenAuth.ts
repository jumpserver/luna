import type { Ref } from "vue";
import type { ChenProfile } from "~/chen/types";
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";

import { authChen, fetchChenProfile } from "~/chen/api";

export function useChenAuth(tab: Ref<WorkspaceSessionTab>) {
  const profile = ref<ChenProfile | null>(null);
  const chenToken = ref("");
  const error = ref("");

  const disableAutoHash = computed(() => {
    return Boolean((tab.value.payload?.token as Record<string, any> | undefined)?.disableautohash)
      || Boolean(tab.value.payload?.disableautohash);
  });

  function ensureTokenId() {
    const payloadToken = tab.value.payload?.token as Record<string, any> | undefined;
    return String(payloadToken?.id || tab.value.payload?.id || "");
  }

  async function authenticate() {
    error.value = "";

    const tokenId = ensureTokenId();
    if (!tokenId) throw new Error("Missing chen token");

    const auth = await authChen(tokenId, disableAutoHash.value);
    chenToken.value = auth.token;
    profile.value = await fetchChenProfile(auth.token);

    return auth.token;
  }

  return {
    chenToken,
    disableAutoHash,
    error,
    profile,
    authenticate,
    ensureTokenId
  };
}
