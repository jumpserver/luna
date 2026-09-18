import type { ChenTreeNode } from "~/chen/types";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useChenResourceTree } from "~/chen/composables/useChenResourceTree";

const { fetchChenTreeChildren } = vi.hoisted(() => ({
  fetchChenTreeChildren: vi.fn()
}));

vi.mock("~/chen/api", () => ({
  fetchChenTreeChildren,
  runChenAction: vi.fn()
}));

const DATASOURCE = "datasource:db";
const DATABASE = "datasource:db,database:app";
const SCHEMA = "datasource:db,database:app,schema:public";
const TABLES = "datasource:db,database:app,schema:public,tables";
const VIEWS = "datasource:db,database:app,schema:public,views";
const USERS = "datasource:db,database:app,schema:public,table:users";
const ORDERS = "datasource:db,database:app,schema:public,table:orders";
const RECENT_TABLES = "__chen_recent_tables__";

function node(key: string, type: string, extra: Partial<ChenTreeNode> = {}): ChenTreeNode {
  return {
    key,
    type,
    label: key,
    hasChildren: type !== "table" && type !== "view",
    ...extra
  };
}

describe("useChenResourceTree refreshRoot", () => {
  let catalog: Record<string, ChenTreeNode[]>;

  beforeEach(() => {
    catalog = {
      __root__: [node(DATASOURCE, "datasource")],
      [DATASOURCE]: [node(DATABASE, "database")],
      [DATABASE]: [node(SCHEMA, "schema")],
      [SCHEMA]: [node(TABLES, "tables"), node(VIEWS, "views")],
      [TABLES]: [node(USERS, "table")],
      [VIEWS]: []
    };

    fetchChenTreeChildren.mockReset();
    fetchChenTreeChildren.mockImplementation(async (_token: string, parent?: ChenTreeNode | null) => {
      const key = parent?.key || "__root__";
      return (catalog[key] || []).map((item) => ({ ...item }));
    });
  });

  function createTree() {
    return useChenResourceTree(ref("token"));
  }

  function fetchCalls() {
    return fetchChenTreeChildren.mock.calls.map(([, parent, force]) => ({
      parent: (parent as ChenTreeNode | null | undefined)?.key ?? null,
      force: Boolean(force)
    }));
  }

  async function expandKeys(tree: ReturnType<typeof useChenResourceTree>, keys: string[]) {
    await tree.loadNodeChildren(null);
    tree.expandedKeys.value = [];
    for (const key of keys) {
      const current = tree.findNodeByKey(key);
      expect(current, key).toBeTruthy();
      tree.expandedKeys.value = [...tree.expandedKeys.value, key];
      await tree.loadNodeChildren(current);
    }
  }

  it("reloads the whole expanded path and keeps those nodes expanded", async () => {
    const tree = createTree();
    await expandKeys(tree, [DATASOURCE, DATABASE, SCHEMA, TABLES]);
    tree.expandedKeys.value = [...tree.expandedKeys.value, RECENT_TABLES];
    catalog[TABLES] = [node(USERS, "table"), node(ORDERS, "table")];
    fetchChenTreeChildren.mockClear();

    await tree.refreshRoot();

    expect(fetchCalls()).toEqual([
      { parent: null, force: true },
      { parent: DATASOURCE, force: true },
      { parent: DATABASE, force: true },
      { parent: SCHEMA, force: true },
      { parent: TABLES, force: true }
    ]);
    expect(tree.expandedKeys.value).toEqual([DATASOURCE, DATABASE, SCHEMA, TABLES, RECENT_TABLES]);
    expect(tree.findNodeByKey(TABLES)?.children?.map((item) => item.key)).toEqual([USERS, ORDERS]);
    expect(tree.findNodeByKey(VIEWS)?.children).toBeUndefined();
  });

  it("drops expanded keys that no longer exist instead of leaving empty expanded folders", async () => {
    const tree = createTree();
    await expandKeys(tree, [DATASOURCE, DATABASE, SCHEMA, TABLES]);
    catalog[SCHEMA] = [node(VIEWS, "views")];
    delete catalog[TABLES];

    await tree.refreshRoot();

    expect(tree.expandedKeys.value).toEqual([DATASOURCE, DATABASE, SCHEMA]);
    expect(tree.findNodeByKey(TABLES)).toBeNull();
    expect(tree.findNodeByKey(SCHEMA)?.children?.map((item) => item.key)).toEqual([VIEWS]);
  });

  it("collapses a node when its children fail to reload", async () => {
    const tree = createTree();
    await expandKeys(tree, [DATASOURCE, DATABASE, SCHEMA]);
    fetchChenTreeChildren.mockImplementation(async (_token: string, parent?: ChenTreeNode | null, force?: boolean) => {
      const key = parent?.key || "__root__";
      if (key === SCHEMA && force) throw new Error("schema gone");
      return (catalog[key] || []).map((item) => ({ ...item }));
    });

    await tree.refreshRoot();

    expect(tree.expandedKeys.value).toEqual([DATASOURCE, DATABASE]);
    expect(tree.findNodeByKey(SCHEMA)?.children).toBeUndefined();
    expect(tree.loadErrors[SCHEMA]).toBe("schema gone");
  });

  it("does not reconnect or clear expansion when the root reload fails", async () => {
    const tree = createTree();
    await expandKeys(tree, [DATASOURCE, DATABASE]);
    const expandedBefore = [...tree.expandedKeys.value];
    const rootBefore = tree.rootNodes.value[0];
    fetchChenTreeChildren.mockImplementation(async (_token: string, parent?: ChenTreeNode | null) => {
      if (!parent) throw new Error("root unavailable");
      const key = parent.key || "__root__";
      return (catalog[key] || []).map((item) => ({ ...item }));
    });

    await expect(tree.refreshRoot()).rejects.toThrow("root unavailable");
    expect(tree.expandedKeys.value).toEqual(expandedBefore);
    expect(tree.rootNodes.value[0]).toBe(rootBefore);
  });

  it("does not leave an in-flight folder expanded without children after whole-tree refresh", async () => {
    const tree = createTree();
    await expandKeys(tree, [DATASOURCE, DATABASE, SCHEMA]);

    let releaseStale!: (value: ChenTreeNode[]) => void;
    const staleLoad = new Promise<ChenTreeNode[]>((resolve) => {
      releaseStale = resolve;
    });
    fetchChenTreeChildren.mockImplementation(async (_token: string, parent?: ChenTreeNode | null, force?: boolean) => {
      const key = parent?.key || "__root__";
      if (key === SCHEMA && !force) return staleLoad;
      return (catalog[key] || []).map((item) => ({ ...item }));
    });

    const staleNode = tree.findNodeByKey(SCHEMA);
    const inFlight = tree.loadNodeChildren(staleNode);
    expect(tree.loadingChildren[SCHEMA]).toBe(true);
    catalog[SCHEMA] = [node(TABLES, "tables")];

    await tree.refreshRoot();
    releaseStale([node(VIEWS, "views")]);
    await inFlight;

    const schema = tree.findNodeByKey(SCHEMA);
    expect(Boolean(tree.expandedKeys.value.includes(SCHEMA) && !Array.isArray(schema?.children))).toBe(false);
    expect(schema?.children?.map((item) => item.key)).toEqual([TABLES]);
    expect(tree.childrenMap[SCHEMA]?.map((item) => item.key)).toEqual([TABLES]);
  });

  it("keeps node-level refresh on the clicked node only", async () => {
    const tree = createTree();
    await expandKeys(tree, [DATASOURCE, DATABASE, SCHEMA, TABLES]);
    const expandedBefore = [...tree.expandedKeys.value];
    const tables = tree.findNodeByKey(TABLES);
    catalog[TABLES] = [node(ORDERS, "table")];
    fetchChenTreeChildren.mockClear();

    await tree.loadNodeChildren(tables, true);

    expect(fetchCalls()).toEqual([{ parent: TABLES, force: true }]);
    expect(tree.expandedKeys.value).toEqual(expandedBefore);
    expect(tables?.children?.map((item) => item.key)).toEqual([ORDERS]);
    expect(tree.findNodeByKey(USERS)).toBeNull();
  });
});
