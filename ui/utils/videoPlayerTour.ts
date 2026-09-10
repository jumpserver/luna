import type { DriveStep } from "driver.js";
import type { VideoPlayerItem, VideoPlayerItemType } from "~/composables/useVideoPlayerParser";

/** Persisted after a user completes or closes the first-run offline player guide. */
export const VIDEO_PLAYER_TOUR_STORAGE_KEY = "luna:videoplayer-tour:v2";
export const VIDEO_PLAYER_TOUR_TARGETS = ["import", "stage", "parts", "add"] as const;
export const VIDEO_PLAYER_TOUR_DEMO_ID = "luna-videoplayer-tour-demo";
export const VIDEO_PLAYER_TOUR_DEMO_ACTIVE_ID = `${VIDEO_PLAYER_TOUR_DEMO_ID}-rdp-2`;

type VideoPlayerTourTarget = (typeof VIDEO_PLAYER_TOUR_TARGETS)[number];

function isVisible(element: Element) {
  const htmlElement = element as HTMLElement;
  const style = globalThis.getComputedStyle?.(htmlElement);
  const rect = htmlElement.getBoundingClientRect();
  return style?.display !== "none" && style?.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
}

export function getVisibleVideoPlayerTourTarget(target: VideoPlayerTourTarget) {
  if (typeof document === "undefined") return undefined;
  return [...document.querySelectorAll(`[data-videoplayer-tour="${target}"]`)].find(isVisible);
}

export function hasVisibleVideoPlayerTourTargets() {
  return VIDEO_PLAYER_TOUR_TARGETS.every((target) => getVisibleVideoPlayerTourTarget(target));
}

export function isVideoPlayerTourDemoItem(id: string) {
  return id === VIDEO_PLAYER_TOUR_DEMO_ID || id.startsWith(`${VIDEO_PLAYER_TOUR_DEMO_ID}-`);
}

function demoItem(options: {
  id: string;
  type: VideoPlayerItemType;
  asset: string;
  user?: string;
  protocol?: string;
  duration?: string;
  dateStart?: string;
  recordingId?: string;
  metaId?: string;
  partIndex?: number;
  partTotal?: number;
}): VideoPlayerItem {
  const id = `${VIDEO_PLAYER_TOUR_DEMO_ID}-${options.id}`;
  const recordingId = options.recordingId ?? id;
  return {
    id,
    name: options.asset,
    source: "",
    type: options.type,
    meta: {
      id: options.metaId ?? recordingId,
      asset: options.asset,
      user: options.user,
      protocol: options.protocol,
      duration: options.duration,
      date_start: options.dateStart
    },
    recordingId,
    recordingLabel: options.asset,
    partIndex: options.partIndex,
    partTotal: options.partTotal
  };
}

export function buildVideoPlayerTourDemoItems(): VideoPlayerItem[] {
  const rdpSession = `${VIDEO_PLAYER_TOUR_DEMO_ID}-rdp`;
  return [
    demoItem({
      id: "ssh",
      type: "cast",
      asset: "web-prod-01",
      user: "alice",
      protocol: "ssh",
      duration: "00:12:08",
      dateStart: "2026-03-12 12:00:00"
    }),
    demoItem({
      id: "mp4",
      type: "mp4",
      asset: "generated_video (8).mp4"
    }),
    demoItem({
      id: "db",
      type: "gua",
      asset: "db-audit",
      user: "root",
      protocol: "mysql",
      duration: "00:04:22",
      dateStart: "2026-03-11 18:03:00"
    }),
    demoItem({
      id: "rdp-1",
      type: "gua",
      asset: "jump-rdp-04",
      user: "bob",
      protocol: "rdp",
      dateStart: "2026-03-12 09:01:00",
      recordingId: rdpSession,
      metaId: rdpSession,
      partIndex: 1,
      partTotal: 3
    }),
    demoItem({
      id: "rdp-2",
      type: "gua",
      asset: "jump-rdp-04",
      user: "bob",
      protocol: "rdp",
      dateStart: "2026-03-12 09:10:00",
      recordingId: rdpSession,
      metaId: rdpSession,
      partIndex: 2,
      partTotal: 3
    }),
    demoItem({
      id: "rdp-3",
      type: "gua",
      asset: "jump-rdp-04",
      user: "bob",
      protocol: "rdp",
      dateStart: "2026-03-12 09:19:00",
      recordingId: rdpSession,
      metaId: rdpSession,
      partIndex: 3,
      partTotal: 3
    })
  ];
}

export function buildVideoPlayerTourSteps(t: (key: string) => string): DriveStep[] {
  return [
    {
      element: () => getVisibleVideoPlayerTourTarget("import")!,
      popover: {
        title: t("VideoPlayerTour.ClickTitle"),
        description: t("VideoPlayerTour.ClickDescription"),
        side: "bottom",
        align: "center"
      }
    },
    {
      element: () => getVisibleVideoPlayerTourTarget("stage")!,
      popover: {
        title: t("VideoPlayerTour.DropTitle"),
        description: t("VideoPlayerTour.DropDescription"),
        side: "left",
        align: "center"
      }
    },
    {
      element: () => getVisibleVideoPlayerTourTarget("parts")!,
      popover: {
        title: t("VideoPlayerTour.PartsTitle"),
        description: t("VideoPlayerTour.PartsDescription"),
        side: "left",
        align: "start"
      }
    },
    {
      element: () => getVisibleVideoPlayerTourTarget("add")!,
      popover: {
        title: t("VideoPlayerTour.AddTitle"),
        description: t("VideoPlayerTour.AddDescription"),
        side: "left",
        align: "start"
      }
    }
  ];
}
