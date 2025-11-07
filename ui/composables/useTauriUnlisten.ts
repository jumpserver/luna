import type { UnlistenFn } from "@tauri-apps/api/event";
import type { Ref } from "vue";

/**
 * Group multiple Tauri `UnlistenFn` refs into a single cleanup function.
 * Returns a function that, when called, will invoke all available unlisten callbacks.
 */
export const useTauriUnlisten = (refs: Array<Ref<UnlistenFn | null>>) => {
  const unlistenAll = () => {
    for (const r of refs) r.value?.();
  };

  return unlistenAll;
};
