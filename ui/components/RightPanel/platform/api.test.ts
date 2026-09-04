import { describe, expect, it, vi } from "vitest";
import { platformConversationResults } from "./api";
import { createEventStreamParser, parseEventBlock } from "./sse";

vi.mock("~/composables/useApiRequest", () => ({
  ApiRequestError: class extends Error {},
  apiRequest: vi.fn()
}));

describe("Platform AI conversations", () => {
  it("keeps unique general conversations out of the shared capability history", () => {
    const general = { id: "general-1", kind: "general" as const, surface: "general.chat" };

    expect(
      platformConversationResults({
        results: [
          general,
          { ...general },
          { id: "terminal-1", kind: "capability", surface: "session.terminal" },
          { id: "deleted-1", kind: "general", status: "deleted" }
        ]
      })
    ).toEqual([general]);
  });
});

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
