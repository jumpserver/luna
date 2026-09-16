import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computed, isReactive } from "vue";

import { useChenWorkspaceTabs } from "~/chen/composables/useChenWorkspaceTabs";

describe("chen database workspace tabs", () => {
  beforeEach(() => {
    vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function schemaNode() {
    return {
      key: "database:main/schema:public",
      label: "public",
      type: "schema" as const
    };
  }

  it("returns the reactive state entry when a schema tab is first opened", () => {
    const workspace = useChenWorkspaceTabs();
    const tab = workspace.openDatabaseTab(schemaNode(), "public");

    expect(isReactive(tab)).toBe(true);
    expect(tab).toBe(workspace.workspaceTabState[tab.id]);
  });

  it("updates loading state and table/view counts as soon as schema metadata resolves", async () => {
    const workspace = useChenWorkspaceTabs();
    const tab = workspace.openDatabaseTab(schemaNode(), "public");
    const loads = new WeakMap<typeof tab, symbol>();
    const load = Symbol("schema metadata load");

    loads.set(tab, load);
    tab.catalogLoading = true;

    const renderedLoading = computed(() => {
      const active = workspace.activeWorkspaceTab.value;
      return active?.kind === "database" ? active.catalogLoading : false;
    });
    const renderedCounts = computed(() => {
      const active = workspace.activeWorkspaceTab.value;
      if (!active || active.kind !== "database") return { tables: 0, views: 0 };
      return {
        tables: active.schemaOverview?.tables.length || 0,
        views: active.schemaOverview?.views.length || 0
      };
    });

    expect(renderedLoading.value).toBe(true);
    expect(renderedCounts.value).toEqual({ tables: 0, views: 0 });

    await Promise.resolve();
    if (loads.get(tab) === load) {
      tab.schemaOverview = {
        catalog: "main",
        schema: "public",
        capabilities: {
          tableRows: true,
          tableSize: true,
          tableEngine: true,
          tableCharacterSet: true,
          tableCollation: true,
          tableComment: true,
          viewComment: true,
          statistics: true,
          indexes: true,
          ddl: true,
          diagram: true,
          diagramRelationships: true
        },
        loadedSections: ["tables", "views"],
        tables: [
          {
            schema: "public",
            name: "users",
            estimatedRows: null,
            totalSizeBytes: null,
            engine: null,
            characterSet: null,
            collation: null,
            comment: null
          },
          {
            schema: "public",
            name: "orders",
            estimatedRows: null,
            totalSizeBytes: null,
            engine: null,
            characterSet: null,
            collation: null,
            comment: null
          }
        ],
        views: [{ schema: "public", name: "active_users", type: "VIEW", comment: null }],
        statistics: [],
        indexes: [],
        diagram: [],
        ddl: null
      };
      tab.catalogLoaded = true;
      tab.catalogLoading = false;
    }

    expect(renderedLoading.value).toBe(false);
    expect(renderedCounts.value).toEqual({ tables: 2, views: 1 });
  });

  it("reuses the same reactive tab and WeakMap load identity", () => {
    const workspace = useChenWorkspaceTabs();
    const first = workspace.openDatabaseTab(schemaNode(), "public");
    const loads = new WeakMap<typeof first, symbol>();
    const load = Symbol("schema metadata load");
    loads.set(first, load);

    const second = workspace.openDatabaseTab(schemaNode(), "public");

    expect(workspace.workspaceTabs.value).toHaveLength(1);
    expect(second).toBe(first);
    expect(second).toBe(workspace.workspaceTabState[first.id]);
    expect(loads.get(second)).toBe(load);
  });
});
