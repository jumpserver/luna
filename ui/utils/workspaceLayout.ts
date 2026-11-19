export type WorkspaceLayout<T = string> =
  | { type: "pane"; paneId: T }
  | {
      type: "split";
      direction: "horizontal" | "vertical";
      ratio: number;
      first: WorkspaceLayout<T>;
      second: WorkspaceLayout<T>;
    };

export function mapWorkspaceLayout<T, U>(layout: WorkspaceLayout<T>, map: (id: T) => U): WorkspaceLayout<U> {
  return layout.type === "pane"
    ? { type: "pane", paneId: map(layout.paneId) }
    : { ...layout, first: mapWorkspaceLayout(layout.first, map), second: mapWorkspaceLayout(layout.second, map) };
}

export function normalizeWorkspaceLayout<T extends string | number>(
  value: unknown,
  paneIds: T[]
): WorkspaceLayout<T> | undefined {
  const remaining = new Set(paneIds);
  let budget = paneIds.length * 2 - 1;
  const visit = (raw: unknown): WorkspaceLayout<T> | undefined => {
    if (--budget < 0 || !raw || typeof raw !== "object") return;
    const node = raw as Record<string, unknown>;
    if (node.type === "pane" && remaining.delete(node.paneId as T)) return { type: "pane", paneId: node.paneId as T };
    if (
      node.type !== "split" ||
      !["horizontal", "vertical"].includes(String(node.direction)) ||
      typeof node.ratio !== "number" ||
      !Number.isFinite(node.ratio)
    )
      return;
    const first = visit(node.first);
    const second = visit(node.second);
    if (!first || !second) return;
    return {
      type: "split",
      direction: node.direction as "horizontal" | "vertical",
      ratio: Math.min(95, Math.max(5, node.ratio)),
      first,
      second
    };
  };
  const result = visit(value);
  return result && !remaining.size ? result : undefined;
}

export function stackWorkspacePanes<T>(ids: T[], direction: "horizontal" | "vertical"): WorkspaceLayout<T> {
  if (ids.length === 1) return { type: "pane", paneId: ids[0]! };
  const middle = Math.ceil(ids.length / 2);
  return {
    type: "split",
    direction,
    ratio: (middle / ids.length) * 100,
    first: stackWorkspacePanes(ids.slice(0, middle), direction),
    second: stackWorkspacePanes(ids.slice(middle), direction)
  };
}

// Read old saved layouts without changing their pane positions.
export function legacyWorkspaceLayout<T>(ids: T[], mode: string, spanAxis?: string): WorkspaceLayout<T> {
  if (ids.length <= 2) return stackWorkspacePanes(ids, mode === "rows-2" ? "horizontal" : "vertical");
  if (ids.length === 3) {
    const direction = spanAxis === "columns" ? "horizontal" : "vertical";
    return {
      type: "split",
      direction,
      ratio: 50,
      first: { type: "pane", paneId: ids[0]! },
      second: stackWorkspacePanes(ids.slice(1), direction === "vertical" ? "horizontal" : "vertical")
    };
  }
  const middle = Math.ceil(ids.length / 2);
  return {
    type: "split",
    direction: "horizontal",
    ratio: (middle / ids.length) * 100,
    first: stackWorkspacePanes(ids.slice(0, middle), "vertical"),
    second: stackWorkspacePanes(ids.slice(middle), "vertical")
  };
}

export function splitWorkspaceLayout(
  layout: WorkspaceLayout,
  targetId: string,
  paneId: string,
  direction: "horizontal" | "vertical",
  before = false
): WorkspaceLayout {
  if (layout.type === "pane") {
    if (layout.paneId !== targetId) return layout;
    const added: WorkspaceLayout = { type: "pane", paneId };
    return { type: "split", direction, ratio: 50, first: before ? added : layout, second: before ? layout : added };
  }
  return {
    ...layout,
    first: splitWorkspaceLayout(layout.first, targetId, paneId, direction, before),
    second: splitWorkspaceLayout(layout.second, targetId, paneId, direction, before)
  };
}

export function removeWorkspaceLayoutPane(layout: WorkspaceLayout, paneId: string): WorkspaceLayout | undefined {
  if (layout.type === "pane") return layout.paneId === paneId ? undefined : layout;
  const first = removeWorkspaceLayoutPane(layout.first, paneId);
  const second = removeWorkspaceLayoutPane(layout.second, paneId);
  if (!first) return second;
  if (!second) return first;
  return { ...layout, first, second };
}

interface LayoutRect {
  left: number;
  top: number;
  width: number;
  height: number;
}
export function measureWorkspaceLayout(layout: WorkspaceLayout) {
  const panes = new Map<string, LayoutRect>();
  const dividers: Array<{ path: string; node: Extract<WorkspaceLayout, { type: "split" }>; bounds: LayoutRect }> = [];
  const visit = (node: WorkspaceLayout, bounds: LayoutRect, path: string) => {
    if (node.type === "pane") {
      panes.set(node.paneId, bounds);
      return;
    }
    dividers.push({ path, node, bounds });
    const vertical = node.direction === "vertical";
    const size = vertical ? bounds.width : bounds.height;
    const firstSize = (size * node.ratio) / 100;
    visit(node.first, { ...bounds, [vertical ? "width" : "height"]: firstSize }, `${path}0`);
    visit(
      node.second,
      {
        ...bounds,
        [vertical ? "left" : "top"]: (vertical ? bounds.left : bounds.top) + firstSize,
        [vertical ? "width" : "height"]: size - firstSize
      },
      `${path}1`
    );
  };
  visit(layout, { left: 0, top: 0, width: 100, height: 100 }, "");
  return { panes, dividers };
}
