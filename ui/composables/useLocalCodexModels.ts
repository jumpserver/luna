import { onScopeDispose, shallowRef, watch } from "vue";
import type { LocalCodexModel, LocalCodexSettingsInput } from "~/shared/codex/types";

/** A model catalog belongs to the exact connection draft that requested it. */
export function useLocalCodexModels(
  settings: () => LocalCodexSettingsInput | null,
  fetchModels: (settings: LocalCodexSettingsInput) => Promise<LocalCodexModel[]>
) {
  const models = shallowRef<LocalCodexModel[]>([]);
  const loading = shallowRef(false);
  const error = shallowRef<unknown>(null);
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function refresh() {
    clearTimeout(timer);
    const draft = settings();
    const current = ++generation;
    if (!draft) return;
    loading.value = true;
    error.value = null;
    try {
      const result = await fetchModels(draft);
      if (current === generation) models.value = result;
    } catch (cause) {
      if (current === generation) error.value = cause;
    } finally {
      if (current === generation) loading.value = false;
    }
  }
  watch(
    settings,
    (draft) => {
      ++generation;
      clearTimeout(timer);
      models.value = [];
      error.value = null;
      loading.value = false;
      if (draft) timer = setTimeout(() => void refresh(), 500);
    },
    { immediate: true, flush: "sync" }
  );
  onScopeDispose(() => {
    ++generation;
    clearTimeout(timer);
  });
  return { models, loading, error, refresh };
}
