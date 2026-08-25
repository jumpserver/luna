import type { Replay, ReplayPartItem } from "#online-player/types";

import prettyBytes from "pretty-bytes";
import { fetchReplayManifest, fetchReplayPart } from "#online-player/api/replay";
import { resolveReplayPartPayload } from "#online-player/utils/replay";
import { formatDurationLabel } from "#online-player/utils/time";

export function useReplayParts(replay: MaybeRefOrGetter<Replay | null>, sessionId: MaybeRefOrGetter<string>) {
  const { locale } = useI18n();
  const parts = ref<ReplayPartItem[]>([]);
  const current = ref<ReplayPartItem | null>(null);
  const loading = ref(false);
  const preparing = ref(false);
  const error = ref("");
  const partType = ref("");
  let activeRequest: AbortController | null = null;

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const fetchSection = async (filename: string, size: number, duration: number, isFirst: boolean) => {
    const sid = toValue(sessionId);
    if (!sid) return isFirst;

    for (let attempt = 0; attempt < 40; attempt++) {
      if (activeRequest?.signal.aborted) return isFirst;

      const res = await fetchReplayPart(sid, filename);
      const data = resolveReplayPartPayload(res);

      if (res?.status === "running") {
        preparing.value = true;
        await wait(3000);
        continue;
      }

      if (!data?.src) return isFirst;

      const item: ReplayPartItem = {
        ...data,
        id: toValue(replay)?.id || sid,
        name: filename,
        sizeLabel: prettyBytes(size || 0),
        durationLabel: formatDurationLabel(duration || 0, locale.value === "zh")
      };

      parts.value.push(item);
      preparing.value = false;

      if (isFirst && item.src) {
        current.value = item;
        return false;
      }

      return isFirst;
    }

    preparing.value = false;
    return isFirst;
  };

  const load = async () => {
    activeRequest?.abort();
    activeRequest = new AbortController();
    parts.value = [];
    current.value = null;
    partType.value = "";
    preparing.value = false;
    error.value = "";

    const currentReplay = toValue(replay);
    if (!currentReplay?.src || currentReplay.type !== "parts") {
      loading.value = false;
      return;
    }

    loading.value = true;

    try {
      const manifest = await fetchReplayManifest(currentReplay.src);
      partType.value = manifest.type || "";
      let isFirst = true;

      for (const file of manifest.files || []) {
        if (activeRequest.signal.aborted) break;
        isFirst = await fetchSection(file.name, file.size, file.duration, isFirst);
      }
    } catch (cause) {
      parts.value = [];
      error.value = cause instanceof Error ? cause.message : String(cause || "");
    } finally {
      loading.value = false;
      preparing.value = false;
    }
  };

  const selectPart = (item: ReplayPartItem) => {
    if (!item.src || current.value?.src === item.src) return;
    current.value = { ...item };
  };

  watch(
    () => [toValue(replay)?.src, toValue(replay)?.type, toValue(sessionId)],
    () => void load(),
    { immediate: true }
  );

  onBeforeUnmount(() => activeRequest?.abort());

  return {
    parts,
    current,
    loading,
    preparing,
    partType,
    error,
    selectPart
  };
}
