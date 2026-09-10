import { describe, expect, it } from "vitest";
import {
  buildVideoPlayerTourDemoItems,
  buildVideoPlayerTourSteps,
  isVideoPlayerTourDemoItem,
  VIDEO_PLAYER_TOUR_DEMO_ID,
  VIDEO_PLAYER_TOUR_STORAGE_KEY,
  VIDEO_PLAYER_TOUR_TARGETS
} from "~/utils/videoPlayerTour";
import enMessages from "../../i18n/locales/en.json";
import zhMessages from "../../i18n/locales/zh.json";

const translate = (messages: unknown) => (key: string) => {
  const value = key.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[segment];
  }, messages);
  if (typeof value !== "string") throw new TypeError(`Missing translation: ${key}`);
  return value;
};

describe("video player tour", () => {
  it("covers import, drop, and add in both languages", () => {
    const chineseSteps = buildVideoPlayerTourSteps(translate(zhMessages));
    const englishSteps = buildVideoPlayerTourSteps(translate(enMessages));

    expect(VIDEO_PLAYER_TOUR_STORAGE_KEY).toBe("luna:videoplayer-tour:v2");
    expect(VIDEO_PLAYER_TOUR_TARGETS).toEqual(["import", "stage", "parts", "add"]);
    expect(chineseSteps).toHaveLength(4);
    expect(englishSteps).toHaveLength(chineseSteps.length);
    expect(chineseSteps[0]?.popover?.title).toBe("点击导入");
    expect(englishSteps[0]?.popover?.title).toBe("Click to import");
    expect(chineseSteps[2]?.popover?.title).toBe("分段录像");
    expect(chineseSteps[3]?.popover?.side).toBe("left");
  });

  it("keeps video player tour translation trees aligned", () => {
    const leafKeys = (value: unknown, prefix = ""): string[] => {
      if (!value || typeof value !== "object") return [prefix];
      return Object.entries(value).flatMap(([key, child]) => leafKeys(child, prefix ? `${prefix}.${key}` : key));
    };

    expect(leafKeys(enMessages.VideoPlayerTour).sort()).toEqual(leafKeys(zhMessages.VideoPlayerTour).sort());
  });

  it("builds disposable playlist rows", () => {
    const items = buildVideoPlayerTourDemoItems();
    const parts = items.filter((item) => (item.partTotal ?? 0) > 1);

    expect(items.map((item) => item.meta.asset)).toEqual([
      "web-prod-01",
      "generated_video (8).mp4",
      "db-audit",
      "jump-rdp-04",
      "jump-rdp-04",
      "jump-rdp-04"
    ]);
    expect(parts).toHaveLength(3);
    expect(parts[1]?.partIndex).toBe(2);
    expect(new Set(parts.map((item) => item.recordingId)).size).toBe(1);
    expect(new Set(parts.map((item) => item.meta.id)).size).toBe(1);
    expect(parts[0]?.recordingId).toBe(parts[0]?.meta.id);
    expect(items.every((item) => isVideoPlayerTourDemoItem(item.id))).toBe(true);
    expect(isVideoPlayerTourDemoItem(VIDEO_PLAYER_TOUR_DEMO_ID)).toBe(true);
    expect(isVideoPlayerTourDemoItem("real-item")).toBe(false);
  });
});
