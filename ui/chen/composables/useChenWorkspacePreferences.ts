import { useLocalStorage } from "@vueuse/core";

export type ChenTabTitleFormat = "table" | "table-schema";
export type ChenSqlKeywordCase = "lower" | "upper";

export interface ChenWorkspacePreferences {
  tabTitleFormat: ChenTabTitleFormat;
  sqlKeywordCase: ChenSqlKeywordCase;
}

const DEFAULT_CHEN_WORKSPACE_PREFERENCES: ChenWorkspacePreferences = {
  tabTitleFormat: "table",
  sqlKeywordCase: "lower"
};

export function useChenWorkspacePreferences() {
  return useLocalStorage<ChenWorkspacePreferences>(
    "jumpserver-client:chen-workspace-preferences",
    DEFAULT_CHEN_WORKSPACE_PREFERENCES,
    { mergeDefaults: true }
  );
}
