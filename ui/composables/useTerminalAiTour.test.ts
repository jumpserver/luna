import { describe, expect, it } from "vitest";
import popover from "../components/Workspace/terminalAiCommandPopover.vue?raw";
import { TERMINAL_AI_TOUR_STORAGE_KEY } from "../utils/terminalAiTour";
import tour from "./useTerminalAiTour.ts?raw";

describe("terminal AI tour", () => {
  it("keeps the existing seen-state key and waits for a quiet connection", () => {
    expect(TERMINAL_AI_TOUR_STORAGE_KEY).toBe("luna:terminal-ai-tour:v1");
    expect(tour).toContain("useDeferredTourStart");
    expect(tour).toContain("onDoneClick: acknowledge");
    expect(tour).not.toContain(
      'localStorage?.setItem(TERMINAL_AI_TOUR_STORAGE_KEY, "completed");\n      activeTour = tour'
    );
    expect(popover).toContain("tour.scheduleOnce()");
    expect(popover).toContain("props.pane.connectionProgress");
    expect(popover).toContain("void tour.start()");
    expect(popover).not.toContain("void tour.startOnce()");
  });
});
