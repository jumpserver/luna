import { afterEach, describe, expect, it, vi } from "vitest";
import { confirmAiTaskLeave, useAiTaskLeave } from "./useAiTaskLeave";

const mocks = vi.hoisted(() => ({ busy: false }));
vi.mock("./useWorkspaceAssistantPanelSession", () => ({
  hasActiveAiTask: () => mocks.busy
}));

const { confirmOpen, confirmLeave } = useAiTaskLeave();

afterEach(() => {
  mocks.busy = false;
  confirmOpen.value = false;
});

describe("confirmAiTaskLeave", () => {
  it("continues without a prompt when no AI task is running", async () => {
    await expect(confirmAiTaskLeave("tab", "a")).resolves.toBe(true);
    expect(confirmOpen.value).toBe(false);
  });

  it("blocks until the running AI task is confirmed", async () => {
    mocks.busy = true;
    const pending = confirmAiTaskLeave("logout");
    expect(confirmOpen.value).toBe(true);
    confirmLeave();
    await expect(pending).resolves.toBe(true);
  });

  it("cancels when the prompt is dismissed", async () => {
    mocks.busy = true;
    const pending = confirmAiTaskLeave("org");
    confirmOpen.value = false;
    await expect(pending).resolves.toBe(false);
  });
});
