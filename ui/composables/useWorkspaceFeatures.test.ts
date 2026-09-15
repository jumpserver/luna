import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { effectScope, reactive, shallowRef } from "vue";
import type { PublicSettings } from "./useApiRequest";
import { useWorkspaceFeatures } from "./useWorkspaceFeatures";
import { workspaceAiEnabled } from "~/shared/aiAvailability";

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  store: {} as any
}));
vi.mock("~/composables/useApiRequest", () => ({ getPublicSettings: mocks.request }));
vi.mock("~/store/modules/userInfo", () => ({ useUserInfoStore: () => mocks.store }));

let scope: ReturnType<typeof effectScope>;
beforeEach(() => {
  mocks.request.mockReset();
  mocks.store = reactive({
    loggedIn: true,
    currentSite: "site-a",
    currentAccountId: "user-a",
    orgId: "org-a",
    setCommandExecutionEnabled: vi.fn()
  });
  scope = effectScope();
});
afterEach(() => scope.stop());

it.skipIf(typeof window === "undefined")(
  "waits for authentication and refreshes on browser focus and visibility events",
  async () => {
    const ready = shallowRef(false);
    mocks.request.mockResolvedValue({ CHAT_AI_ENABLED: true, SECURITY_COMMAND_EXECUTION: true });
    const features = scope.run(() => useWorkspaceFeatures(ready))!;
    expect(mocks.request).not.toHaveBeenCalled();
    ready.value = true;
    await features.refresh();
    expect(mocks.request).toHaveBeenCalledOnce();
    expect(workspaceAiEnabled.value).toBe(true);
    expect(mocks.store.setCommandExecutionEnabled).toHaveBeenLastCalledWith(true);
    mocks.request.mockResolvedValue({ CHAT_AI_ENABLED: false });
    window.dispatchEvent(new Event("focus"));
    await vi.waitFor(() => expect(workspaceAiEnabled.value).toBe(false));
    mocks.request.mockResolvedValue({ CHAT_AI_ENABLED: true });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(workspaceAiEnabled.value).toBe(true));
    expect(mocks.request).toHaveBeenCalledTimes(3);
  }
);

it("ignores settings returned for a previous site and clears state on logout", async () => {
  const oldSite = Promise.withResolvers<PublicSettings>();
  mocks.request.mockReturnValueOnce(oldSite.promise).mockResolvedValue({ CHAT_AI_ENABLED: false });
  const features = scope.run(() => useWorkspaceFeatures(shallowRef(true)))!;
  const oldRequest = features.refresh();
  mocks.store.currentSite = "site-b";
  await features.refresh();
  oldSite.resolve({ CHAT_AI_ENABLED: true });
  await oldRequest;
  expect(workspaceAiEnabled.value).toBe(false);
  mocks.request.mockResolvedValue({ CHAT_AI_ENABLED: true });
  await features.refresh();
  expect(workspaceAiEnabled.value).toBe(true);
  mocks.store.loggedIn = false;
  expect(workspaceAiEnabled.value).toBe(false);
  await features.refresh();
  expect(mocks.request).toHaveBeenCalledTimes(3);
});

it("requires explicit enablement and disables AI if refreshing settings fails", async () => {
  mocks.request
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({ CHAT_AI_ENABLED: true })
    .mockRejectedValueOnce(new Error("offline"));
  const features = scope.run(() => useWorkspaceFeatures(shallowRef(true)))!;
  await features.refresh();
  expect(workspaceAiEnabled.value).toBe(false);
  await features.refresh();
  expect(workspaceAiEnabled.value).toBe(true);
  await features.refresh();
  expect(workspaceAiEnabled.value).toBe(false);
});
