import type { SiteCompatibility } from "~/types/clientCompatibility";
import { readonly, shallowRef } from "vue";

// Desktop connection prompts are shared across the workspace and settings layouts.
const pending = shallowRef<SiteCompatibility | null>(null);
let continueConnection: (() => Promise<unknown>) | null = null;
let resolveConfirmation: ((confirmed: boolean) => void) | null = null;

export const useClientCompatibility = () => {
  const dismiss = () => {
    pending.value = null;
    continueConnection = null;
    resolveConfirmation?.(false);
    resolveConfirmation = null;
  };
  return {
    pending: readonly(pending),
    dismiss,
    show: (result: SiteCompatibility, confirm?: () => Promise<unknown>) => {
      dismiss();
      pending.value = result;
      continueConnection = confirm || null;
      return new Promise<boolean>((resolve) => {
        resolveConfirmation = resolve;
      });
    },
    confirm: async () => {
      const action = continueConnection;
      const resolve = resolveConfirmation;
      resolveConfirmation = null;
      dismiss();
      resolve?.(true);
      await action?.();
    }
  };
};
