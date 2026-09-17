import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTranscodeStore } from "./transcode";

const mocks = vi.hoisted(() => {
  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: vi.fn(),
    removeItem: vi.fn()
  });
  return {
    addErrorToast: vi.fn(),
    desktopInvoke: vi.fn(),
    desktopListen: vi.fn(async () => () => {})
  };
});

vi.mock("~/composables/useErrorToast", () => ({
  useErrorToast: () => ({ addErrorToast: mocks.addErrorToast })
}));
vi.mock("~/shared/desktop/bridge", () => ({
  desktopInvoke: mocks.desktopInvoke,
  desktopListen: mocks.desktopListen
}));

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useToast", () => ({ add: vi.fn() }));
});

afterEach(() => vi.unstubAllGlobals());

describe("transcode output directory authorization", () => {
  it("requires reselecting a restored output directory", async () => {
    const store = useTranscodeStore();
    store.setArchives(["D:\\recordings\\session.tar"]);
    store.$patch({ outputDir: "D:\\Desktop" });

    await store.startTranscode();

    expect(store.outputDirAuthorized).toBe(false);
    expect(mocks.desktopInvoke).not.toHaveBeenCalledWith("transcode_replays", expect.anything());
    expect(mocks.addErrorToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Transcode.SelectOutputDirFirst" })
    );
  });

  it("authorizes a directory selected in the current session", () => {
    const store = useTranscodeStore();

    store.setOutputDir("D:\\Desktop");

    expect(store.outputDir).toBe("D:\\Desktop");
    expect(store.outputDirAuthorized).toBe(true);
  });

  it("keeps a completed archive when it is added again", async () => {
    const store = useTranscodeStore();
    const archivePath = "/tmp/session.tar";
    store.setArchives([archivePath]);
    store.applyBatchResults([{ id: "session", input: archivePath, output: "/tmp/session.mp4", success: true }]);

    store.appendArchives([archivePath]);

    expect(store.taskItems).toHaveLength(2);
    expect(store.taskItems[0]).toMatchObject({ status: "success", output: "/tmp/session.mp4" });
    expect(store.taskItems[1]).toMatchObject({
      path: archivePath,
      status: "pending",
      progress: 0,
      output: "",
      error: ""
    });
    expect(store.canStart).toBe(true);

    store.setOutputDir("/tmp");
    mocks.desktopInvoke.mockResolvedValueOnce([
      { id: "session", index: 0, input: archivePath, output: "/tmp/session (1).mp4", success: true }
    ]);
    await store.startTranscode();

    expect(store.taskItems[1]).toMatchObject({ status: "success", output: "/tmp/session (1).mp4" });
  });

  it("cancels the current desktop transcode", async () => {
    const store = useTranscodeStore();

    await store.cancelCurrentTask();

    expect(mocks.desktopInvoke).toHaveBeenCalledWith("cancel_transcode");
  });
});
