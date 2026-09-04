export interface PlatformAiStreamEvent {
  event: string;
  data: any;
}

const MAX_BUFFER_BYTES = 384 * 1024;
const MAX_EVENT_BYTES = 320 * 1024;

export function parseEventBlock(block: string): PlatformAiStreamEvent | null {
  let event = "message";
  const data: string[] = [];

  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue;
    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? "" : line.slice(separator + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    if (field === "data") data.push(value);
  }

  if (!data.length) return null;
  const raw = data.join("\n");
  if (raw.length > MAX_EVENT_BYTES) throw new Error("Platform AI SSE event exceeds the configured limit");
  try {
    return { event, data: JSON.parse(raw) };
  } catch {
    return { event, data: raw };
  }
}

export function createEventStreamParser(onEvent: (event: PlatformAiStreamEvent) => void) {
  let buffer = "";

  const drain = (flush = false) => {
    let boundary = /\r?\n\r?\n/.exec(buffer);
    while (boundary) {
      const block = buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary[0].length);
      const event = block.trim() ? parseEventBlock(block) : null;
      if (event) onEvent(event);
      boundary = /\r?\n\r?\n/.exec(buffer);
    }
    if (flush && buffer.trim()) {
      const event = parseEventBlock(buffer);
      if (event) onEvent(event);
      buffer = "";
    }
  };

  return {
    push(chunk: string) {
      buffer += chunk;
      if (buffer.length > MAX_BUFFER_BYTES) throw new Error("Platform AI SSE buffer exceeds the configured limit");
      drain();
    },
    finish() {
      drain(true);
    }
  };
}
