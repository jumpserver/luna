import type { ChenTabDefinition } from "~/chen/types";

import { useLocalStorage } from "@vueuse/core";

export type ChenTabTitleFormat = "table" | "table-schema";

export interface ChenWorkspacePreferences {
  tabTitleFormat: ChenTabTitleFormat;
}

const DEFAULT_CHEN_WORKSPACE_PREFERENCES: ChenWorkspacePreferences = {
  tabTitleFormat: "table"
};

export function useChenWorkspacePreferences() {
  return useLocalStorage<ChenWorkspacePreferences>(
    "jumpserver-client:chen-workspace-preferences",
    DEFAULT_CHEN_WORKSPACE_PREFERENCES,
    { mergeDefaults: true }
  );
}

export function formatChenWorkspaceTabTitle(tab: ChenTabDefinition, format: ChenTabTitleFormat) {
  if (tab.kind !== "data-view") return tab.title;

  const meta: Record<string, unknown> | null =
    "meta" in tab && tab.meta && typeof tab.meta === "object" ? (tab.meta as Record<string, unknown>) : null;
  const normalizedTitle = tab.title.replace(/^data\s*view\s*[:：\-]?\s*/i, "").trim();
  const table = typeof meta?.table === "string" ? meta.table.trim() : "";
  const schema = typeof meta?.schema === "string" ? meta.schema.trim() : "";

  if (table) return format === "table-schema" && schema ? `${table}.${schema}` : table;
  if (format === "table") return normalizedTitle.split(".").at(-1)?.trim() || normalizedTitle || tab.title;
  return normalizedTitle || tab.title;
}
