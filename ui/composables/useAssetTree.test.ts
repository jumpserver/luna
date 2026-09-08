import type { EffectScope } from "vue";
import type { AssetTreeNode } from "~/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, reactive, ref } from "vue";
import { applyAssetRename, useAssetTreeSearch } from "./useAssetTree";

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

const userInfoStore = reactive({ loggedIn: true, orgId: "org-1", currentSite: "site-1", currentAccountId: "user-1" });
vi.mock("~/store/modules/userInfo", () => ({ useUserInfoStore: () => userInfoStore }));

describe("asset tree search", () => {
  let scope: EffectScope;
  const getAssetTree = vi.fn();
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
});
