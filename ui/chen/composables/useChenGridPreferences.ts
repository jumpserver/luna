import type { ChenDataViewMeta } from "~/chen/types";

import { useStorage } from "@vueuse/core";

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
  stripedRows: false,
  showCellBorders: true,
  compactRows: false,
  hiddenFieldsByGrid: {}
};

// Validate persisted data before either the old workbench or the Go grid consumes it.
export function normalizeChenGridPreferences(value: unknown): ChenGridPreferences {
  const saved =
    value && typeof value === "object" && !Array.isArray(value) ? (value as Partial<ChenGridPreferences>) : {};
  const preferences = { ...DEFAULT_CHEN_GRID_PREFERENCES, hiddenFieldsByGrid: {} };
  if (["keyword", "parenthesized", "blank"].includes(saved.nullDisplay as string))
    preferences.nullDisplay = saved.nullDisplay!;
  for (const key of ["showEmptyStrings", "stripedRows", "showCellBorders", "compactRows"] as const) {
    if (typeof saved[key] === "boolean") preferences[key] = saved[key];
  }
  if (
    saved.hiddenFieldsByGrid &&
    typeof saved.hiddenFieldsByGrid === "object" &&
    !Array.isArray(saved.hiddenFieldsByGrid)
  ) {
    preferences.hiddenFieldsByGrid = Object.fromEntries(
      Object.entries(saved.hiddenFieldsByGrid)
        .filter(([, fields]) => Array.isArray(fields) && fields.every((field) => typeof field === "string"))
        .map(([key, fields]) => [key, [...new Set(fields)]])
    );
  }
  return preferences;
}

export function useChenGridPreferences() {
  return useStorage<ChenGridPreferences>(
    "jumpserver-client:chen-grid-preferences",
    normalizeChenGridPreferences(null),
    undefined,
    {
      serializer: {
        read: (raw) => {
          try {
            return normalizeChenGridPreferences(JSON.parse(raw));
          } catch {
            return normalizeChenGridPreferences(null);
          }
        },
        write: (value) => JSON.stringify(normalizeChenGridPreferences(value))
      },
      // Storage can be denied in browsers and Electron; preferences stay usable in memory.
      onError: () => {}
    }
  );
}

export function chenGridPreferenceKey(meta: ChenDataViewMeta | null | undefined, fallback: string, dbType = "") {
  if (meta?.schema || meta?.table) {
    return ["table", dbType, meta.schema || "", meta.table || ""].join(":");
  }
  const normalizedFallback = String(meta?.title || fallback)
    .trim()
    .replace(/\s+/g, " ");
  return ["result", dbType, normalizedFallback || "empty"].join(":");
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
