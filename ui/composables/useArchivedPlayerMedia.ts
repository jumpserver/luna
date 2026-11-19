import type { Ref } from "vue";
import type { VideoPlayerItem } from "./useVideoPlayerParser";
import { streamArchiveEntry } from "~/utils/browserRecordingArchive";
import { openOfflineMediaStream } from "~/utils/offlineMedia";

/** Only the active non-Guacamole entry is materialized; playlist entries remain disk references. */
export function useArchivedPlayerMedia(item: Ref<VideoPlayerItem | null>) {
  const source = shallowRef("");
  const castData = shallowRef<string>();
  const loading = shallowRef(false);
  const error = shallowRef("");

  watch(
    item,
    async (next, _previous, onCleanup) => {
      source.value = next?.source || "";
      castData.value = next?.castData;
      loading.value = false;
      error.value = "";
      if (!next?.recordingEntry || next.type === "gua") return;

      const controller = new AbortController();
      let objectUrl: string | null = null;
      onCleanup(() => {
        controller.abort();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      });
      loading.value = true;
      try {
        const entry = next.recordingEntry;
        const stream = await openOfflineMediaStream({ stream: () => streamArchiveEntry(entry, controller.signal) });
        const blob = await new Response(stream).blob();
        if (controller.signal.aborted) return;
        if (next.type === "cast") {
          const text = await blob.text();
          if (!controller.signal.aborted) castData.value = text;
        } else {
          objectUrl = URL.createObjectURL(new Blob([blob], { type: "video/mp4" }));
          source.value = objectUrl;
        }
      } catch (cause) {
        if (!controller.signal.aborted) error.value = cause instanceof Error ? cause.message : String(cause);
      } finally {
        if (!controller.signal.aborted) loading.value = false;
      }
    },
    { immediate: true }
  );

  return { source, castData, loading, error };
}
