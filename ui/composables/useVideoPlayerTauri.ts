import type { VideoPlayerItemType, VideoPlayerMeta } from "~/composables/useVideoPlayerParser";

export interface OfflineRecordingEntry {
  entry_id: string;
  source_name: string;
  media_type: VideoPlayerItemType;
  byte_length: number;
  part_index?: number;
  part_total?: number;
  start_ms?: number;
  end_ms?: number;
  duration_ms?: number;
}

export interface OfflineRecordingManifest {
  version: number;
  recording_id: string;
  label: string;
  metadata: VideoPlayerMeta;
  entries: OfflineRecordingEntry[];
}

export function useVideoPlayerTauri() {
  async function importRecording(filePath: string) {
    return await useTauriCoreInvoke<OfflineRecordingManifest>("import_offline_recording", {
      filePath
    });
  }

  async function getEntryUrl(recordingId: string, entryId: string) {
    return await useTauriCoreInvoke<string>("get_offline_entry_url", {
      recordingId,
      entryId
    });
  }

  async function removeRecording(recordingId: string) {
    await useTauriCoreInvoke("remove_offline_recording", { recordingId });
  }

  return {
    importRecording,
    getEntryUrl,
    removeRecording
  };
}
