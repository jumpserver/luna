import { describe, expect, it } from "vitest";
import type { ReplayIndexEvent } from "#online-player/types";
import {
  eventExcerpt,
  eventMatchesQuery,
  eventPositionMs,
  isReplayIndex,
  visibleIndexMarkers
} from "#online-player/utils/replayIndex";

const event: ReplayIndexEvent = {
  ordinal: 1,
  kind: "screen_text",
  replay_ms: 84_900,
  part_index: 1,
  local_ms: 4_900,
  ocr: {
    text: "RDP recording and index validation",
    delta_text: "index validation",
    removed_text: "old text",
    confidence: 96
  }
};

describe("recording index", () => {
  it("only accepts a matching sidecar v1 and valid canonical event times", () => {
    const index = {
      schema: "jumpserver.recording-index",
      version: 1,
      session: { id: "sid-1" },
      source: { duration_ms: 121_965, part_count: 2 },
      event_count: 1,
      events: [event]
    };
    expect(isReplayIndex(index, "sid-1")).toBe(true);
    expect(isReplayIndex(index, "another-sid")).toBe(false);
    expect(isReplayIndex({ ...index, version: 2 }, "sid-1")).toBe(false);
    expect(isReplayIndex({ ...index, event_count: 2 }, "sid-1")).toBe(false);
    expect(isReplayIndex({ ...index, events: [{ ...event, replay_ms: 121_966 }] }, "sid-1")).toBe(false);
    expect(isReplayIndex({ ...index, events: [{ ...event, part_index: 2 }] }, "sid-1")).toBe(false);
    expect(isReplayIndex({ ...index, events: [{ ...event, timeline_marker: false }] }, "sid-1")).toBe(true);
    expect(isReplayIndex({ ...index, events: [{ ...event, timeline_marker: "false" }] }, "sid-1")).toBe(false);
  });

  it("searches the full OCR text while showing a short matching excerpt", () => {
    expect(eventMatchesQuery(event, "RDP recording")).toBe(true);
    expect(eventMatchesQuery(event, "INDEX VALIDATION")).toBe(true);
    expect(eventMatchesQuery(event, "old text")).toBe(true);
    expect(eventMatchesQuery(event, "not present")).toBe(false);
    expect(eventExcerpt(event, "RDP recording")).toContain("RDP recording");
    expect(eventExcerpt(event)).toBe("index validation");
  });

  it("uses global replay_ms for a single video and part-local time for segments", () => {
    expect(eventPositionMs(event, false)).toBe(84_900);
    expect(eventPositionMs(event, true, 1)).toBe(4_900);
    expect(eventPositionMs(event, true, 0)).toBeNull();
  });

  it("limits timeline DOM markers while retaining list search over every event", () => {
    const events = Array.from({ length: 1000 }, (_, ordinal) => ({ ...event, ordinal }));
    expect(visibleIndexMarkers(events)).toHaveLength(200);
    expect(events).toHaveLength(1000);
  });

  it("keeps dense browser OCR searchable but omits its explicit non-event timeline labels", () => {
    const browserEvents = Array.from({ length: 30 }, (_, ordinal) => ({
      ...event,
      ordinal,
      ocr: { ...event.ocr, text: `Browser article page ${ordinal}` },
      timeline_marker: false,
      timeline_reason: "dense_browser_text"
    }));
    const meaningful = { ...event, ordinal: 30, timeline_marker: true };
    expect(visibleIndexMarkers([...browserEvents, meaningful])).toEqual([meaningful]);
    expect(browserEvents.filter((item) => eventMatchesQuery(item, "browser article"))).toHaveLength(30);
    expect(visibleIndexMarkers([{ ...event }])).toHaveLength(1); // legacy sidecars remain visible
  });
});
