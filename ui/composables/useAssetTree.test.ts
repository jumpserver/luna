import type { EffectScope } from "vue";
import type { AssetTreeNode } from "~/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, reactive, ref } from "vue";
import { applyAssetRename, hasAssetName, useAssetTree, useAssetTreeSearch } from "./useAssetTree";

describe("applyAssetRename", () => {
  it("renames matching leaves in place and leaves parents open", () => {
    const nodes: AssetTreeNode[] = [
      {
        id: "folder-1",
        name: "Linux",
        isParent: true,
        open: true,
        children: [
          { id: "node-1", key: "asset-1", name: "old", meta: { data: { id: "asset-1", name: "old" } } },
          { id: "node-2", key: "asset-2", name: "other", meta: { data: { id: "asset-2", name: "other" } } }
        ]
      }
    ];

    applyAssetRename(nodes, "asset-1", "new");

    expect(nodes[0]).toMatchObject({ name: "Linux", open: true });
    expect(nodes[0]!.children?.[0]).toMatchObject({ name: "new", meta: { data: { name: "new" } } });
    expect(nodes[0]!.children?.[1]).toMatchObject({ name: "other" });
  });
});

describe("asset rename names", () => {
  const nodes: AssetTreeNode[] = [
    {
      id: "folder-1",
      name: "Linux",
      isParent: true,
      children: [{ id: "node-1", key: "asset-1", name: "web-1", meta: { data: { id: "asset-1", name: "web-1" } } }]
    }
  ];

  it("detects duplicate leaf names and ignores the asset being renamed", () => {
    expect(hasAssetName(nodes, "web-1")).toBe(true);
    expect(hasAssetName(nodes, " WEB-1 ")).toBe(true);
    expect(hasAssetName(nodes, "web-1", "asset-1")).toBe(false);
  });
});

const userInfoStore = reactive({ loggedIn: true, orgId: "org-1", currentSite: "site-1", currentAccountId: "user-1" });
vi.mock("~/store/modules/userInfo", () => ({ useUserInfoStore: () => userInfoStore }));

describe("asset tree search", () => {
  let scope: EffectScope;
  const getAssetTree = vi.fn();
  const getUserAssetTreeMetrics = vi.fn();
  const onResults = vi.fn();
  const onError = vi.fn();

  const startSearch = (initialQuery = "production") => {
    const query = ref(initialQuery);
    const search = scope.run(() => useAssetTreeSearch(() => query.value, { onResults, onError }))!;
    return { query, ...search };
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.stubGlobal("getAssetTree", getAssetTree);
    vi.stubGlobal("getUserAssetTreeMetrics", getUserAssetTreeMetrics);
    Object.assign(userInfoStore, { loggedIn: true, orgId: "org-1", currentSite: "site-1", currentAccountId: "user-1" });
    getAssetTree.mockResolvedValue([{ id: "asset-1", name: "Production" }]);
    scope = effectScope();
  });

  afterEach(() => {
    scope.stop();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("acknowledges the initial search and stops loading when the assets arrive", async () => {
    const search = startSearch("  production  ");
    expect(search.loading.value).toBe(true);

    await vi.advanceTimersByTimeAsync(250);

    expect(getAssetTree).toHaveBeenCalledExactlyOnceWith("search", { search: "production" }, undefined);
    expect(onResults).toHaveBeenCalledExactlyOnceWith("production", search.nodes.value);
    expect(search.nodes.value).toMatchObject([{ id: "asset-1" }]);
    expect(search.completedQuery.value).toBe("production");
    expect(search.loading.value).toBe(false);
  });

  it("cancels the debounce and resets loading when the search is cleared", async () => {
    const search = startSearch();
    search.query.value = "staging";
    await nextTick();
    search.query.value = "";
    await nextTick();
    await vi.advanceTimersByTimeAsync(250);

    expect(getAssetTree).not.toHaveBeenCalled();
    expect(search.loading.value).toBe(false);
    expect(search.nodes.value).toEqual([]);
  });

  it("ignores an older response without clearing the current search's loading state", async () => {
    const oldRequest = Promise.withResolvers<unknown>();
    const newRequest = Promise.withResolvers<unknown>();
    getAssetTree.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise);
    const search = startSearch();
    await vi.advanceTimersByTimeAsync(250);
    search.query.value = "staging";
    await nextTick();
    await vi.advanceTimersByTimeAsync(250);

    oldRequest.resolve([{ id: "old-asset" }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(onResults).not.toHaveBeenCalled();
    expect(search.loading.value).toBe(true);

    newRequest.resolve([{ id: "new-asset" }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(search.nodes.value).toMatchObject([{ id: "new-asset" }]);
    expect(search.completedQuery.value).toBe("staging");
    expect(search.loading.value).toBe(false);
  });

  it.each(["orgId", "currentSite", "currentAccountId"] as const)(
    "repeats the search after %s changes and ignores stale failures",
    async (key) => {
      const oldRequest = Promise.withResolvers<unknown>();
      getAssetTree.mockReturnValueOnce(oldRequest.promise);
      const search = startSearch();
      await vi.advanceTimersByTimeAsync(250);
      userInfoStore[key] = "changed";
      await nextTick();
      oldRequest.reject(new Error("Previous context failed"));
      await vi.advanceTimersByTimeAsync(250);

      expect(getAssetTree).toHaveBeenCalledTimes(2);
      expect(onError).not.toHaveBeenCalled();
      expect(onResults).toHaveBeenCalledOnce();
      expect(search.loading.value).toBe(false);
    }
  );

  it("clears results on logout and searches again on login", async () => {
    const search = startSearch();
    await vi.advanceTimersByTimeAsync(250);
    userInfoStore.loggedIn = false;
    await nextTick();
    await vi.advanceTimersByTimeAsync(250);
    expect(search.nodes.value).toEqual([]);
    expect(search.completedQuery.value).toBe("");
    expect(search.loading.value).toBe(false);
    expect(getAssetTree).toHaveBeenCalledOnce();

    userInfoStore.loggedIn = true;
    await nextTick();
    await vi.advanceTimersByTimeAsync(250);
    expect(getAssetTree).toHaveBeenCalledTimes(2);
    expect(search.nodes.value).toMatchObject([{ id: "asset-1" }]);
  });

  it("reports a failed request and stops loading", async () => {
    const error = new Error("Search request failed");
    getAssetTree.mockRejectedValueOnce(error);
    const search = startSearch();
    await vi.advanceTimersByTimeAsync(250);

    expect(onError).toHaveBeenCalledExactlyOnceWith("production", error);
    expect(onResults).not.toHaveBeenCalled();
    expect(search.completedQuery.value).toBe("");
    expect(search.loading.value).toBe(false);
  });

  it("ignores an in-flight request after the tree is unmounted", async () => {
    const request = Promise.withResolvers<unknown>();
    getAssetTree.mockReturnValueOnce(request.promise);
    const search = startSearch();
    await vi.advanceTimersByTimeAsync(250);
    scope.stop();
    request.resolve([{ id: "asset-1" }]);
    await vi.advanceTimersByTimeAsync(0);

    expect(onResults).not.toHaveBeenCalled();
    expect(search.nodes.value).toEqual([]);
  });

  it("loads authorization nodes before the first direct asset page", async () => {
    getAssetTree
      .mockResolvedValueOnce({
        results: [{ id: "1:1", name: "Production", isParent: true }],
        node_pagination: { has_more: false, next: null }
      })
      .mockResolvedValueOnce({
        results: [{ id: "asset-1", name: "web-1", isParent: false }],
        node_pagination: { has_more: false, next: null },
        asset_pagination: { has_more: true, next_offset: 100 }
      });
    const { fetchAuthorizationTreePage } = useAssetTree();
    const parent = { id: "1", name: "Default", isParent: true, level: 0 } as AssetTreeNode;

    const page = await fetchAuthorizationTreePage(parent);

    expect(getAssetTree).toHaveBeenNthCalledWith(
      1,
      "authorization",
      { parent_key: "1", node_page_size: 100 },
      undefined
    );
    expect(getAssetTree).toHaveBeenNthCalledWith(
      2,
      "authorization",
      { parent_key: "1", include_nodes: false, include_assets: true, asset_page_size: 100 },
      undefined
    );
    expect(page.nodes).toHaveLength(2);
    expect(page.nextPage).toEqual({ phase: "assets", assetOffset: 100 });
  });

  it("recognizes lightweight authorization nodes by their metadata", async () => {
    getAssetTree.mockResolvedValueOnce({
      results: [
        { id: "ungrouped", name: "Ungrouped", meta: { type: "node", data: { id: "ungrouped" } } },
        { id: "1:2", name: "Child", meta: { type: "node", data: { id: "node-2" } } }
      ],
      node_pagination: { has_more: false, next: null }
    });
    const { fetchAuthorizationTreePage } = useAssetTree();

    const page = await fetchAuthorizationTreePage();

    expect(page.nodes).toMatchObject([
      { id: "ungrouped", isParent: true, meta: { type: "node" } },
      { id: "1:2", isParent: true, meta: { type: "node" } }
    ]);
  });

  it("loads counts for every supplied authorization node in one request", async () => {
    getUserAssetTreeMetrics.mockResolvedValueOnce({
      results: [
        { type: "node", id: "ungrouped", count: 3 },
        { type: "node", id: "node-2", count: 8 }
      ]
    });
    const { fetchAuthorizationTreeMetrics } = useAssetTree();
    const nodes = [
      {
        id: "ungrouped",
        name: "Ungrouped",
        meta: { type: "node", data: { id: "ungrouped" } }
      },
      { id: "1:2", name: "Child", meta: { type: "node", data: { id: "node-2" } } },
      { id: "asset-1", name: "Asset", meta: { type: "asset" } }
    ] as AssetTreeNode[];

    const counts = await fetchAuthorizationTreeMetrics(nodes);

    expect(getUserAssetTreeMetrics).toHaveBeenCalledExactlyOnceWith(
      [
        { type: "node", id: "ungrouped" },
        { type: "node", id: "node-2" }
      ],
      undefined
    );
    expect(Object.fromEntries(counts)).toEqual({ ungrouped: 3, "node-2": 8 });
  });

  it("loads type-tree assets in pages of 100", async () => {
    getAssetTree.mockResolvedValueOnce({
      results: [{ id: "asset-1", name: "linux-1", meta: { type: "asset" } }],
      asset_pagination: { has_more: true, next_offset: 100 }
    });
    const { fetchTypeTreePage } = useAssetTree();
    const parent = {
      id: "ROOT_HOST_LINUX",
      name: "Linux",
      isParent: true,
      level: 1,
      type: "linux",
      category: "host"
    } as AssetTreeNode;

    const page = await fetchTypeTreePage(parent);

    expect(getAssetTree).toHaveBeenCalledExactlyOnceWith(
      "type",
      { type: "linux", category: "host", asset_page_size: 100 },
      undefined
    );
    expect(page.nodes).toHaveLength(1);
    expect(page.nextPage).toEqual({ phase: "assets", assetOffset: 100 });
  });
});
