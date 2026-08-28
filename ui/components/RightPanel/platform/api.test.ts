import { describe, expect, it, vi } from "vitest";
import { createEventStreamParser, parseEventBlock } from "./sse";

describe("Platform AI event stream", () => {
  it("parses JSON and multi-line SSE data", () => {
    expect(parseEventBlock('event: message_delta\ndata: {"content":"hello"}')).toEqual({
      event: "message_delta",
      data: { content: "hello" }
    });
    expect(parseEventBlock("event: note\ndata: first\ndata: second")).toEqual({
      event: "note",
      data: "first\nsecond"
    });
  });

  it("handles event boundaries split across transport chunks", () => {
    const onEvent = vi.fn();
    const parser = createEventStreamParser(onEvent);

    parser.push('event: message_delta\ndata: {"content":');
    parser.push('"A"}\n\nevent: message_done\ndata: {"status":"completed"}');
    parser.finish();

    expect(onEvent).toHaveBeenNthCalledWith(1, {
      event: "message_delta",
      data: { content: "A" }
    });
    expect(onEvent).toHaveBeenNthCalledWith(2, {
      event: "message_done",
      data: { status: "completed" }
    });
  });
});
