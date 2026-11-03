import { expect, it } from "vitest";
import {
  legacyWorkspaceLayout,
  mapWorkspaceLayout,
  measureWorkspaceLayout,
  normalizeWorkspaceLayout,
  removeWorkspaceLayoutPane,
  splitWorkspaceLayout,
  stackWorkspacePanes
} from "./workspaceLayout";

it("lays out one main pane and nine equally sized vertical targets without overlap", () => {
  const ids = Array.from({ length: 10 }, (_, index) => `pane-${index}`);
  const layout = {
    type: "split" as const,
    direction: "vertical" as const,
    ratio: 40,
    first: { type: "pane" as const, paneId: ids[0]! },
    second: stackWorkspacePanes(ids.slice(1), "horizontal")
  };
  const result = measureWorkspaceLayout(layout);
  expect(result.dividers).toHaveLength(9);
  expect(result.panes.get(ids[0]!)).toEqual({ left: 0, top: 0, width: 40, height: 100 });
  ids.slice(1).forEach((id, index) => {
    const bounds = result.panes.get(id)!;
    expect(bounds.left).toBe(40);
    expect(bounds.width).toBe(60);
    expect(bounds.top).toBeCloseTo((index * 100) / 9);
    expect(bounds.height).toBeCloseTo(100 / 9);
  });
  const indexed = mapWorkspaceLayout(layout, (id) => ids.indexOf(id));
  const restored = normalizeWorkspaceLayout(
    indexed,
    ids.map((_, index) => index)
  )!;
  expect(mapWorkspaceLayout(restored, (index) => ids[index]!)).toEqual(layout);
});

it("splits a chosen leaf, resizes only that branch, and collapses it on close", () => {
  let layout = splitWorkspaceLayout({ type: "pane", paneId: "a" }, "a", "b", "vertical");
  layout = splitWorkspaceLayout(layout, "b", "c", "horizontal");
  const before = measureWorkspaceLayout(layout).panes.get("a");
  if (layout.type === "split" && layout.second.type === "split") layout.second.ratio = 20;
  expect(measureWorkspaceLayout(layout).panes.get("a")).toEqual(before);
  expect(measureWorkspaceLayout(layout).panes.get("b")?.height).toBe(20);
  layout = removeWorkspaceLayoutPane(layout, "b")!;
  expect(measureWorkspaceLayout(layout).panes.get("c")).toEqual({ left: 50, top: 0, width: 50, height: 100 });
  layout = splitWorkspaceLayout(removeWorkspaceLayoutPane(layout, "c")!, "a", "c", "horizontal", true);
  expect(measureWorkspaceLayout(layout).panes.get("c")?.top).toBe(0);
});

it("preserves legacy two, three and four pane positions", () => {
  expect(measureWorkspaceLayout(legacyWorkspaceLayout(["a", "b"], "rows-2")).panes.get("b")?.top).toBe(50);
  expect(
    measureWorkspaceLayout(legacyWorkspaceLayout(["a", "b", "c"], "grid-2x2", "rows")).panes.get("a")?.height
  ).toBe(100);
  expect(
    measureWorkspaceLayout(legacyWorkspaceLayout(["a", "b", "c"], "grid-2x2", "columns")).panes.get("a")?.width
  ).toBe(100);
  expect(measureWorkspaceLayout(legacyWorkspaceLayout(["a", "b", "c", "d"], "grid-2x2")).panes.get("c")).toEqual({
    left: 0,
    top: 50,
    width: 50,
    height: 50
  });
});

it("rejects missing, duplicate and unknown leaves and invalid directions or ratios", () => {
  const valid = stackWorkspacePanes([0, 1], "vertical");
  expect(normalizeWorkspaceLayout(valid, [0, 1])).toEqual(valid);
  expect(normalizeWorkspaceLayout(valid, [0, 1, 2])).toBeUndefined();
  expect(normalizeWorkspaceLayout(valid, [0])).toBeUndefined();
  expect(normalizeWorkspaceLayout({ ...valid, second: { type: "pane", paneId: 0 } }, [0, 1])).toBeUndefined();
  expect(normalizeWorkspaceLayout({ ...valid, direction: "diagonal" }, [0, 1])).toBeUndefined();
  expect(normalizeWorkspaceLayout({ ...valid, ratio: NaN }, [0, 1])).toBeUndefined();
  expect(normalizeWorkspaceLayout({ ...valid, ratio: 200 }, [0, 1])).toMatchObject({ ratio: 95 });
});
