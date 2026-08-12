import type { ChenDataViewMeta } from "~/chen/types";

import { useLocalStorage } from "@vueuse/core";

export type ChenNullDisplay = "keyword" | "parenthesized" | "blank";

export interface ChenGridPreferences {
  nullDisplay: ChenNullDisplay;
  showEmptyStrings: boolean;
  stripedRows: boolean;
  showCellBorders: boolean;
  compactRows: boolean;
  hiddenFieldsByGrid: Record<string, string[]>;
}

const DEFAULT_CHEN_GRID_PREFERENCES: ChenGridPreferences = {
  nullDisplay: "keyword",
  showEmptyStrings: false,
  stripedRows: true,
  showCellBorders: true,
  compactRows: false,
  hiddenFieldsByGrid: {}
};

export function useChenGridPreferences() {
  return useLocalStorage<ChenGridPreferences>(
    "jumpserver-client:chen-grid-preferences",
    DEFAULT_CHEN_GRID_PREFERENCES,
    { mergeDefaults: true }
  );
}

export function chenGridPreferenceKey(meta: ChenDataViewMeta | null | undefined, fallback: string, dbType = "") {
  if (meta?.schema || meta?.table) {
    return ["table", dbType, meta.schema || "", meta.table || ""].join(":");
  }
  return `result:${fallback}`;
}

export function formatChenGridValue(
  value: unknown,
  preferences: Pick<ChenGridPreferences, "nullDisplay" | "showEmptyStrings">
) {
  if (value == null) {
    if (preferences.nullDisplay === "parenthesized") return "(null)";
    if (preferences.nullDisplay === "blank") return "";
    return "NULL";
  }
  if (value === "" && preferences.showEmptyStrings) return '""';
  return String(value);
}
