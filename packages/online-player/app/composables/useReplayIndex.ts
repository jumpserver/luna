import type { ReplayIndex } from "#online-player/types";
import { ApiRequestError } from "#imports";
import { fetchReplayIndex } from "#online-player/api/replay";
import { isReplayIndex } from "#online-player/utils/replayIndex";

export function useReplayIndex(sessionId: MaybeRefOrGetter<string>) {
  const index = ref<ReplayIndex | null>(null);
  const loading = ref(false);
  const missing = ref(false);
  const error = ref("");
  let generation = 0;

  const load = async () => {
    const token = ++generation;
    const sid = toValue(sessionId);
    index.value = null;
    missing.value = false;
    error.value = "";
    loading.value = Boolean(sid);
    if (!sid) return;

    try {
      const document = await fetchReplayIndex(sid);
      if (token !== generation) return;
      if (!isReplayIndex(document, sid)) throw new Error("Unsupported or invalid recording index");
      index.value = document;
    } catch (cause) {
      if (token !== generation) return;
      if (cause instanceof ApiRequestError && cause.status === 404) missing.value = true;
      else error.value = cause instanceof Error ? cause.message : String(cause || "");
    } finally {
      if (token === generation) loading.value = false;
    }
  };

  watch(
    () => toValue(sessionId),
    () => void load(),
    { immediate: true }
  );
  onBeforeUnmount(() => {
    generation += 1;
  });

  return { index, loading, missing, error, reload: load };
}
