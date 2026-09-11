import type { DriveStep } from "driver.js";

/** Persisted after the first SSH Terminal AI guide. */
export const TERMINAL_AI_TOUR_STORAGE_KEY = "luna:terminal-ai-tour:v1";

export function buildTerminalAiTourSteps(t: (key: string) => string): DriveStep[] {
  return [
    {
      element: '[data-terminal-ai-tour="panel"]',
      popover: {
        title: t("TerminalAi.TourHudTitle"),
        description: t("TerminalAi.TourHudDescription"),
        side: "bottom",
        align: "start"
      }
    },
    {
      element: '[data-terminal-ai-tour="history"]',
      popover: {
        title: t("TerminalAi.TourHistoryTitle"),
        description: t("TerminalAi.TourHistoryDescription"),
        side: "bottom",
        align: "end"
      }
    },
    {
      element: '[data-terminal-ai-tour="close"]',
      popover: {
        title: t("TerminalAi.TourCloseTitle"),
        description: t("TerminalAi.TourCloseDescription"),
        side: "bottom",
        align: "end"
      }
    }
  ];
}
