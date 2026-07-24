import type {
  ChenDataViewActionTarget,
  ChenDataViewEditState,
  ChenQueryLikeWorkspaceTab,
  ChenWorkspaceTab
} from "~/chen/types";

export function emptyChenDataViewEditState(): ChenDataViewEditState {
  return {
    insertedRows: [],
    updatedRows: [],
    deletedRows: [],
    previewResult: null,
    saveResult: null,
    pendingSavePayload: null
  };
}

export function chenDataViewHasDirty(editState: ChenDataViewEditState) {
  return Boolean(
    editState.insertedRows.length
    || editState.updatedRows.length
    || editState.deletedRows.length
    || editState.pendingSavePayload
  );
}

export function clearChenDataViewEdits(editState: ChenDataViewEditState) {
  editState.insertedRows = [];
  editState.updatedRows = [];
  editState.deletedRows = [];
  editState.previewResult = null;
  editState.saveResult = null;
  editState.pendingSavePayload = null;
}

export function chenDataViewTargets(tab: ChenWorkspaceTab): ChenDataViewActionTarget[] {
  if (tab.kind === "data-view") return [tab];
  if (tab.kind === "query") return tab.resultTabs;
  return [];
}

export function findChenDataViewTarget(
  tab: ChenWorkspaceTab,
  dataView: unknown
): ChenDataViewActionTarget | null {
  const title = typeof dataView === "string"
    ? dataView
    : dataView && typeof dataView === "object" && "title" in dataView && typeof dataView.title === "string"
      ? dataView.title
      : "";

  if (tab.kind === "data-view") {
    if (!title || tab.meta?.title === title || tab.title === title) return tab;
    return null;
  }

  if (tab.kind === "console") return null;
  return findChenQueryResultTarget(tab, title);
}

function findChenQueryResultTarget(tab: ChenQueryLikeWorkspaceTab, title: string) {
  if (!title) return null;
  return tab.resultTabs.find((item) => item.title === title || item.meta.title === title) || null;
}
