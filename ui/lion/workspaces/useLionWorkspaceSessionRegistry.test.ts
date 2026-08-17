import type { LionWorkspaceSessionController } from "~/lion/workspaces/useLionWorkspaceSessionRegistry";
import { describe, expect, it } from "vitest";
import {
  getLionWorkspaceSession,
  registerLionWorkspaceSession
} from "~/lion/workspaces/useLionWorkspaceSessionRegistry";

describe("lion workspace session registry", () => {
  it("keeps a newer pane controller when an older registration is cleaned up", () => {
    const paneId = "pane:lion-registry-test";
    const first = {} as LionWorkspaceSessionController;
    const second = {} as LionWorkspaceSessionController;
    const unregisterFirst = registerLionWorkspaceSession(paneId, first);
    const unregisterSecond = registerLionWorkspaceSession(paneId, second);

    unregisterFirst();
    expect(getLionWorkspaceSession(paneId)).toBe(second);

    unregisterSecond();
    expect(getLionWorkspaceSession(paneId)).toBeNull();
  });
});
