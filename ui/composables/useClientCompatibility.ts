import type { SiteCompatibility } from "~/types/clientCompatibility";
import { readonly, shallowRef } from "vue";
import { desktopInvoke } from "~/shared/desktop/bridge";

// Desktop connection prompts are shared across the workspace and settings layouts.
const blocked = shallowRef<SiteCompatibility | null>(null);
let retryConnection: (() => Promise<unknown>) | null = null;

export const useClientCompatibility = () => {
  const dismiss = () => {
    blocked.value = null;
    retryConnection = null;
  };
  return {
    blocked: readonly(blocked),
    dismiss,
    show: (result: SiteCompatibility, retry: () => Promise<unknown>) => {
      blocked.value = result;
      retryConnection = retry;
    },
    retry: async () => {
      const action = retryConnection;
      dismiss();
      await action?.();
    },
    download: () => desktopInvoke("open_client_download", { site: blocked.value?.site })
  };
};
