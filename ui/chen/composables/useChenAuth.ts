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
    chenToken.value = "";
    profile.value = null;

    const tokenId = ensureTokenId();
    if (!tokenId) throw new Error("Missing chen token");

    let auth: Awaited<ReturnType<typeof authChen>>;
    try {
      auth = await authChen(tokenId, disableAutoHash.value);
    } catch (cause) {
      error.value = `Chen authentication failed: ${cause instanceof Error ? cause.message : String(cause)}`;
      throw new Error(error.value);
    }

    chenToken.value = auth.token;
    return auth.token;
  }

  async function loadProfile() {
    if (!chenToken.value) throw new Error("Missing chen session token");

    try {
      profile.value = await fetchChenProfile(chenToken.value);
    } catch (cause) {
      error.value = `Chen profile failed: ${cause instanceof Error ? cause.message : String(cause)}`;
      throw new Error(error.value);
    }

    return profile.value;
  }

  return {
    chenToken,
    disableAutoHash,
    error,
    profile,
    authenticate,
    loadProfile,
    ensureTokenId
  };
}
