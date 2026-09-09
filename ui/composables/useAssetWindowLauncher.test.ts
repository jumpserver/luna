import type { AssetItem } from "~/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAssetWindowLauncher } from "./useAssetWindowLauncher";

const { openDesktopWindow } = vi.hoisted(() => ({ openDesktopWindow: vi.fn() }));

vi.mock("~/composables/useSessionWindowConnect", () => ({
  buildSessionPath: (asset: AssetItem, connection?: { protocol: string }) =>
    `/session/${encodeURIComponent(asset.id)}${connection ? `?protocol=${connection.protocol}` : ""}`
}));

vi.mock("~/shared/desktop/bridge", () => ({
  desktopWindow: { open: openDesktopWindow }
}));

describe("asset window dispatch", () => {
  const asset = { id: "asset-1", name: "Database" } as AssetItem;
  const connection = {
    protocol: "ssh",
    account: "root",
    accountMode: "hosted" as const,
    manualUsername: "",
    manualPassword: "",
    dynamicPassword: "",
    rememberSecret: false,
    connectMethod: "koko"
  };

  beforeEach(() => {
    vi.stubGlobal("isDesktopRuntime", () => true);
    openDesktopWindow.mockResolvedValue({ label: "asset-1" });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("launches a local client without opening a Luna window", async () => {
    const launchExternal = vi.fn().mockResolvedValue(undefined);

    await useAssetWindowLauncher().dispatchAssetWindow(true, asset, connection, launchExternal);

    expect(launchExternal).toHaveBeenCalledOnce();
    expect(openDesktopWindow).not.toHaveBeenCalled();
  });

  it("opens embedded clients in a session window", async () => {
    await useAssetWindowLauncher().dispatchAssetWindow(false, asset, connection, vi.fn());

    expect(openDesktopWindow).toHaveBeenCalledWith(
      expect.stringMatching(/^asset-asset-1-/),
      expect.objectContaining({ url: expect.stringMatching(/^\/session\/asset-1\?/) })
    );
  });

  it("opens the connection dialog without a saved connection", () => {
    expect(useAssetWindowLauncher().buildWindowUrl(asset)).toBe("/session/asset-1");
  });
});
