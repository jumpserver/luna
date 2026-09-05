import type { AssetItem } from "~/types";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import {
  toWorkspaceUiAssetCandidate,
  useWorkspaceUiAutomation,
  useWorkspaceUiAutomationHost
} from "./useWorkspaceUiAutomation";

const router = vi.hoisted(() => ({
  currentRoute: { value: { path: "/" } },
  push: vi.fn(async () => undefined)
}));

vi.mock("vue-router", () => ({ useRouter: () => router }));

const asset: AssetItem = {
  id: "asset-1",
  name: "Production host",
  address: "10.0.0.8",
  org_id: "org-1",
  platform: "Linux",
  zone: "default",
  category: "host",
  type: "linux",
  isActive: true,
  savedConnection: {
    protocol: "ssh",
    username: "root",
    manualPassword: "hidden"
  }
};

describe("workspace UI automation", () => {
  beforeEach(() => {
    const states = new Map<string, ReturnType<typeof ref>>();
    vi.stubGlobal("useState", (key: string, init: () => unknown) => {
      if (!states.has(key)) states.set(key, ref(init()));
      return states.get(key);
    });
    vi.stubGlobal("useSettingsWindow", () => ({ closeSettings: vi.fn(async () => undefined) }));
    vi.stubGlobal("useSettingManager", () => ({
      setCollapse: vi.fn(),
      setSidebarSections: vi.fn()
    }));
    router.currentRoute.value.path = "/";
    router.push.mockClear();
  });

  it("exposes only display-safe asset fields", () => {
    expect(toWorkspaceUiAssetCandidate(asset)).toEqual({
      id: "asset-1",
      name: "Production host",
      address: "10.0.0.8",
      orgId: "org-1",
      platform: "Linux",
      zone: "default",
      category: "host",
      type: "linux",
      isActive: true
    });
  });

  it("waits for the asset tree to acknowledge real search results", async () => {
    const automation = useWorkspaceUiAutomation();
    const host = useWorkspaceUiAutomationHost();
    const resultPromise = automation.setSearch("  production  ", { timeoutMs: 1_000 });

    await Promise.resolve();
    await nextTick();
    await Promise.resolve();
    expect(host.currentCommand.value).toMatchObject({ type: "set-search", status: "pending" });

    host.reportSearchResults("production", [toWorkspaceUiAssetCandidate(asset)]);
    await expect(resultPromise).resolves.toMatchObject({
      candidates: [{ id: "asset-1" }]
    });
  });

  it("issues a selection receipt only for a real user selection", () => {
    const automation = useWorkspaceUiAutomation();
    const host = useWorkspaceUiAutomationHost();

    host.reportFocusedAsset(asset, { source: "automation" });
    expect(automation.snapshot.value).toMatchObject({
      focusedAssetSource: "automation",
      selectionReceipt: null
    });

    host.reportFocusedAsset(asset, { source: "user" });
    expect(automation.snapshot.value).toMatchObject({
      focusedAssetSource: "user",
      selectionReceipt: {
        assetId: "asset-1",
        revision: automation.uiRevision.value
      }
    });
  });

  it("consumes an assistant selection click without triggering the normal asset action", async () => {
    const automation = useWorkspaceUiAutomation();
    const host = useWorkspaceUiAutomationHost();
    const search = automation.setSearch("production", { timeoutMs: 1_000 });

    await Promise.resolve();
    await nextTick();
    await Promise.resolve();
    host.reportSearchResults("production", [toWorkspaceUiAssetCandidate(asset)]);
    await search;

    automation.requestAssetSelection();
    expect(host.reportFocusedAsset(asset, { source: "user" })).toBe(true);
    expect(host.reportFocusedAsset(asset, { source: "user" })).toBe(false);

    automation.requestAssetSelection();
    host.resetForContext({ clearSearch: true });
    expect(automation.snapshot.value).toMatchObject({
      searchQuery: "",
      candidates: [],
      focusedAsset: null,
      focusedAssetSource: null,
      selectionReceipt: null
    });
  });
});
