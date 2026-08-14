import type { ChenDataViewColumnPreview } from "~/chen/composables/useChenDataViewDerivedMeta";
import type {
  ChenCreateTableWorkspaceTab,
  ChenDatabaseWorkspaceTab,
  ChenDataViewConsoleTab,
  ChenPromptConsoleTab,
  ChenQueryConsoleTab,
  ChenTabDefinition,
  ChenTableStructureWorkspaceTab,
  ChenWorkspaceTab
} from "~/chen/types";

import { chenCreateTableTypes } from "~/chen/utils/createTableSql";
import { createChenDataViewEditState } from "~/chen/utils/dataViewEditing";

export function newChenWorkspaceId(prefix: string) {
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

export function useChenWorkspaceTabs() {
  const workspaceTabs = ref<ChenTabDefinition[]>([]);
  const activeWorkspaceTabId = ref("");
  const workspaceTabState = reactive<Record<string, ChenWorkspaceTab>>({});

  const activeWorkspaceTab = computed(() => {
    return activeWorkspaceTabId.value ? workspaceTabState[activeWorkspaceTabId.value] || null : null;
  });

  function nextTabTitle(prefix: string) {
    const count = workspaceTabs.value.filter(
      (item) => item.title === prefix || item.title.startsWith(`${prefix} `)
    ).length;
    return count === 0 ? prefix : `${prefix} ${count + 1}`;
  }

  function displayWorkspaceTabTitle(tab: ChenTabDefinition) {
    if (tab.kind !== "data-view") return tab.title;
    const normalized = tab.title.replace(/^data\s*view\s*[:：\-]?\s*/i, "").trim();
    return normalized || tab.title;
  }

  function registerTab(tab: ChenWorkspaceTab) {
    workspaceTabs.value.push(tab);
    workspaceTabState[tab.id] = tab;
    activeWorkspaceTabId.value = tab.id;
    return tab;
  }

  function openQueryTab(nodeKey: string, title = "Query", reuseExisting = true) {
    const existingTab = reuseExisting
      ? workspaceTabs.value.find((item) => item.kind === "query" && item.nodeKey === nodeKey)
      : null;
    if (existingTab) {
      activeWorkspaceTabId.value = existingTab.id;
      return workspaceTabState[existingTab.id] || null;
    }

    const id = newChenWorkspaceId("query");
    const tab: ChenQueryConsoleTab = {
      id,
      title,
      icon: "i-lucide-terminal-square",
      kind: "query",
      nodeKey,
      statement: "",
      uploadingSql: false,
      sqlHints: {},
      hintsContext: "",
      hintsLoading: false,
      hintsRequestGeneration: 0,
      state: {},
      logs: [],
      message: null,
      resultTabs: [],
      activeResultTabId: "",
      socket: null
    };

    return registerTab(tab);
  }

  function openConsoleTab(nodeKey: string, title = "Console") {
    const id = newChenWorkspaceId("console");
    const tab: ChenPromptConsoleTab = {
      id,
      title,
      icon: "i-lucide-square-terminal",
      kind: "console",
      nodeKey,
      pendingSql: "",
      timelineEntries: [],
      activeTimelineEntryId: "",
      state: {},
      logs: [],
      message: null,
      historyEntries: [],
      socket: null
    };

    return registerTab(tab);
  }

  function openDataViewTab(nodeKey: string, title = "Data View") {
    const existingTab = workspaceTabs.value.find((item) => item.kind === "data-view" && item.nodeKey === nodeKey);
    if (existingTab) {
      activeWorkspaceTabId.value = existingTab.id;
      return workspaceTabState[existingTab.id] || null;
    }

    const id = newChenWorkspaceId("data-view");
    const tab: ChenDataViewConsoleTab = {
      id,
      title,
      icon: "i-lucide-table-properties",
      kind: "data-view",
      nodeKey,
      meta: null,
      data: null,
      state: {},
      logs: [],
      activePanel: "data",
      activePropertyTab: "basic",
      whereCondition: "",
      editState: createChenDataViewEditState(),
      socket: null
    };

    return registerTab(tab);
  }

  function openDatabaseTab(node: ChenDatabaseWorkspaceTab["node"], title: string) {
    const existingTab = workspaceTabs.value.find((item) => item.kind === "database" && item.nodeKey === node.key);
    if (existingTab) {
      activeWorkspaceTabId.value = existingTab.id;
      return workspaceTabState[existingTab.id] as ChenDatabaseWorkspaceTab;
    }

    const tab: ChenDatabaseWorkspaceTab = {
      id: newChenWorkspaceId("database"),
      title,
      icon: node.type === "schema" ? "i-lucide-library-big" : "i-lucide-database",
      kind: "database",
      nodeKey: node.key,
      node,
      activeSection: "basic",
      catalogLoaded: false,
      catalogLoading: false,
      catalogError: "",
      logs: [],
      socket: null
    };

    return registerTab(tab);
  }

  function openCreateTableTab(nodeKey: string, parentNode: ChenCreateTableWorkspaceTab["parentNode"], dbType: string) {
    const tab: ChenCreateTableWorkspaceTab = {
      id: newChenWorkspaceId("create-table"),
      title: nextTabTitle("New Table"),
      icon: "i-lucide-table-2",
      kind: "create-table",
      nodeKey,
      tableName: "",
      columns: [
        {
          id: newChenWorkspaceId("column"),
          name: "id",
          type: chenCreateTableTypes(dbType)[0] || "INTEGER",
          size: "",
          nullable: false,
          primaryKey: true
        }
      ],
      dbType,
      parentNode,
      state: {},
      logs: [],
      submitting: false,
      executionStarted: false,
      submitError: "",
      created: false,
      generatedSql: "",
      socket: null
    };
    return registerTab(tab);
  }

  function parseColumnType(value: string, dbType: string) {
    const match = value.trim().match(/^(.+?)(?:\((\d+(?:\s*,\s*\d+)?)\))?$/);
    const rawType = (match?.[1] || value).trim().toLowerCase();
    const types = chenCreateTableTypes(dbType);
    const candidates: Record<string, string[]> = {
      int: ["INT", "INTEGER"],
      int4: ["INTEGER", "INT"],
      integer: ["INTEGER", "INT"],
      int8: ["BIGINT"],
      bigint: ["BIGINT"],
      "character varying": ["VARCHAR", "VARCHAR2"],
      "double precision": ["DECIMAL", "NUMERIC", "NUMBER"],
      numeric: ["NUMERIC", "DECIMAL", "NUMBER"],
      number: ["NUMBER", "DECIMAL", "NUMERIC"],
      decimal: ["DECIMAL", "NUMERIC", "NUMBER"],
      "timestamp without time zone": ["TIMESTAMP", "DATETIME", "DATETIME2"],
      "timestamp with time zone": ["TIMESTAMP", "DATETIME", "DATETIME2"]
    };
    const requestedTypes = candidates[rawType] || [rawType];
    const type =
      requestedTypes
        .map((candidate) => types.find((item) => item.toLowerCase() === candidate.toLowerCase()))
        .find(Boolean) || rawType.toUpperCase();
    return { type, size: match?.[2]?.replaceAll(/\s/g, "") || "" };
  }

  function openTableStructureTab(
    sourceTabId: string,
    nodeKey: string,
    schemaName: string,
    tableName: string,
    columns: ChenDataViewColumnPreview[],
    dbType: string
  ) {
    const existing = workspaceTabs.value.find((item) => item.kind === "table-structure" && item.nodeKey === nodeKey);
    if (existing) {
      activeWorkspaceTabId.value = existing.id;
      return workspaceTabState[existing.id] as ChenTableStructureWorkspaceTab;
    }

    const tab: ChenTableStructureWorkspaceTab = {
      id: newChenWorkspaceId("table-structure"),
      title: `Alter ${tableName}`,
      icon: "i-lucide-table-properties",
      kind: "table-structure",
      nodeKey,
      schemaName,
      tableName,
      columns: columns.map((column) => {
        const parsed = parseColumnType(column.type, dbType);
        const primaryKey = column.key === "PK" && column.inferred !== true;
        const nullable = primaryKey ? false : column.nullable === "YES";
        return {
          id: newChenWorkspaceId("column"),
          name: column.name,
          type: parsed.type,
          size: parsed.size,
          nullable,
          primaryKey,
          originalName: column.name,
          originalType: parsed.type,
          originalSize: parsed.size,
          originalNullable: nullable,
          added: false,
          deleted: false
        };
      }),
      dbType,
      sourceTabId,
      state: {},
      logs: [],
      submitting: false,
      executionStarted: false,
      submitError: "",
      saved: false,
      generatedSql: "",
      socket: null
    };
    return registerTab(tab);
  }

  function closeTab(id: string) {
    const tab = workspaceTabState[id];
    tab?.socket?.close();
    delete workspaceTabState[id];
    workspaceTabs.value = workspaceTabs.value.filter((item) => item.id !== id);
    if (activeWorkspaceTabId.value === id) {
      activeWorkspaceTabId.value = workspaceTabs.value.at(-1)?.id || "";
    }
  }

  function closeAllTabs() {
    Object.values(workspaceTabState).forEach((tab) => tab.socket?.close());
    Object.keys(workspaceTabState).forEach((id) => delete workspaceTabState[id]);
    workspaceTabs.value = [];
    activeWorkspaceTabId.value = "";
  }

  function setActiveTab(id: string) {
    activeWorkspaceTabId.value = id;
  }

  function renameTab(id: string, title: string) {
    const tab = workspaceTabState[id];
    const normalized = title.trim();
    if (!tab || tab.kind !== "query" || !normalized) return;
    tab.title = normalized;
  }

  return {
    activeWorkspaceTab,
    activeWorkspaceTabId,
    workspaceTabs,
    workspaceTabState,
    closeAllTabs,
    closeTab,
    displayWorkspaceTabTitle,
    nextTabTitle,
    openConsoleTab,
    openCreateTableTab,
    openDatabaseTab,
    openDataViewTab,
    openQueryTab,
    openTableStructureTab,
    renameTab,
    setActiveTab
  };
}
