interface StreamHandlers {
  onChunk: (chunk: string) => void
  onEnd: () => void
  onError: (message: string) => void
}

export function useVideoPlayerTauri() {
  const invoke = useTauriCoreInvoke;
  const listen = useTauriEventListen;

  async function writeGzipFile(buffer: ArrayBuffer, fileName: string) {
    return await invoke<string>("write_video_player_gzip_file", {
      buffer: Array.from(new Uint8Array(buffer)),
      fileName
    });
  }

  async function deleteTempFile(filePath: string) {
    await invoke("delete_video_player_file", { filePath });
  }

  async function streamTextFile(filePath: string, handlers: StreamHandlers) {
    const eventId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const chunkEvent = `videoplayer://${eventId}/chunk`;
    const endEvent = `videoplayer://${eventId}/end`;
    const errorEvent = `videoplayer://${eventId}/error`;

    const unlistenChunk = await listen(chunkEvent, (event: any) => {
      handlers.onChunk(event.payload?.chunk || "");
    });
    const unlistenEnd = await listen(endEvent, () => {
      handlers.onEnd();
    });
    const unlistenError = await listen(errorEvent, (event: any) => {
      handlers.onError(event.payload?.message || "Unknown stream error");
    });

    try {
      await invoke("read_video_player_text_stream", { eventId, filePath });
    } catch (error: any) {
      handlers.onError(error?.toString?.() || String(error));
    } finally {
      unlistenChunk();
      unlistenEnd();
      unlistenError();
    }
  }

  return {
    writeGzipFile,
    deleteTempFile,
    streamTextFile
  };
}
