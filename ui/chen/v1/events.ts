import type { GoEvent } from "./api";

// Streaming fetch supports the token header and Electron's session proxy, unlike EventSource.
export async function readChenEvents(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: GoEvent) => void,
  signal?: AbortSignal
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let data: string[] = [];
  let size = 0;
  function line(value: string) {
    if (!value) {
      if (data.length) {
        const event = JSON.parse(data.join("\n")) as GoEvent;
        if (!Number.isSafeInteger(event.sequence) || event.sequence < 0 || typeof event.type !== "string")
          throw new Error("Invalid Chen event");
        onEvent(event);
      }
      data = [];
      size = 0;
    } else if (value.startsWith("data:")) {
      const part = value.slice(5).replace(/^ /, "");
      size += part.length;
      if (size > 1_048_576) throw new Error("Chen event exceeds the size limit");
      data.push(part);
    }
  }
  const abort = () => {
    void reader.cancel();
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      if (signal?.aborted) break;
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      // Delay a final CR until the next chunk in case it is the first half of CRLF.
      while (true) {
        const match = /\r\n|\r(?!$)|\n/.exec(buffer);
        if (!match) break;
        line(buffer.slice(0, match.index));
        buffer = buffer.slice(match.index + match[0].length);
      }
      if (buffer.length > 1_048_576) throw new Error("Chen event exceeds the size limit");
      if (done) {
        if (buffer.endsWith("\r")) line(buffer.slice(0, -1));
        break;
      }
    }
    // A partial frame at EOF is discarded. Reconnect and resync authoritative HTTP state.
  } finally {
    signal?.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
