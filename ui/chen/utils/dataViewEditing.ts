import type {
  ChenDataViewActionTarget,
  ChenDataViewActiveRequest,
  ChenDataViewDataset,
  ChenDataViewEditMode,
  ChenDataViewEditState,
  ChenDataViewField,
  ChenDataViewMeta,
  ChenDataViewRequestKind,
  ChenInsertRowDraft,
  ChenSaveChangesPayload,
  ChenSaveChangesPreviewResult,
  ChenSaveChangesResult,
  ChenWorkspaceTab
} from "~/chen/types";

const INSERT_ID = "__chenInsertId";
const INSERT_VALUES = "__chenValues";
const DELETED = "__chenDeleted";

export function createChenDataViewEditState(): ChenDataViewEditState {
  return {
    dirtyCells: {},
    insertRows: [],
    deletedRows: {},
    nextInsertRowId: 1,
    pendingSavePayload: null,
    previewResult: null,
    saveResult: null,
    dirtyVersion: 0,
    requestSequence: 0,
    activeRequest: null,
    refreshRequiredBeforeSave: false
  };
}

export function chenDataViewHasDirty(state: ChenDataViewEditState) {
  return (
    Object.keys(state.dirtyCells).length > 0 || state.insertRows.length > 0 || Object.keys(state.deletedRows).length > 0
  );
}

export function clearChenDataViewEdits(state: ChenDataViewEditState) {
  state.dirtyCells = {};
  state.insertRows = [];
  state.deletedRows = {};
  state.pendingSavePayload = null;
  state.previewResult = null;
  state.saveResult = null;
  state.dirtyVersion += 1;
}

function cloneChenValue<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map((item) => cloneChenValue(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneChenValue(item)])) as T;
  }
  return value;
}

function freezeChenValue<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach((item) => freezeChenValue(item));
  return Object.freeze(value);
}

export function beginChenDataViewRequest(
  state: ChenDataViewEditState,
  kind: ChenDataViewRequestKind,
  payload?: ChenSaveChangesPayload
): ChenDataViewActiveRequest | null {
  if (state.activeRequest) return null;
  state.requestSequence += 1;
  const snapshot = payload === undefined ? null : freezeChenValue(cloneChenValue(payload));
  state.activeRequest = {
    sequence: state.requestSequence,
    kind,
    dirtyVersion: state.dirtyVersion,
    payload: snapshot
  };
  if (kind === "preview" || kind === "save") state.pendingSavePayload = snapshot;
  return state.activeRequest;
}

export function isCurrentChenDataViewRequest(
  state: ChenDataViewEditState,
  sequence: number,
  kind?: ChenDataViewRequestKind
) {
  return state.activeRequest?.sequence === sequence && (!kind || state.activeRequest.kind === kind);
}

export function hasCurrentChenDirtyVersion(state: ChenDataViewEditState, sequence: number) {
  return isCurrentChenDataViewRequest(state, sequence) && state.activeRequest?.dirtyVersion === state.dirtyVersion;
}

export function setChenDataViewRequestKind(
  state: ChenDataViewEditState,
  sequence: number,
  expectedKind: ChenDataViewRequestKind,
  nextKind: ChenDataViewRequestKind
) {
  if (!isCurrentChenDataViewRequest(state, sequence, expectedKind) || !state.activeRequest) return null;
  state.activeRequest = { ...state.activeRequest, kind: nextKind };
  return state.activeRequest;
}

export function transitionChenDataViewRequest(
  state: ChenDataViewEditState,
  sequence: number,
  expectedKind: ChenDataViewRequestKind,
  nextKind: ChenDataViewRequestKind
) {
  if (
    !isCurrentChenDataViewRequest(state, sequence, expectedKind) ||
    !hasCurrentChenDirtyVersion(state, sequence) ||
    !state.activeRequest
  ) {
    return null;
  }
  state.requestSequence += 1;
  state.activeRequest = {
    ...state.activeRequest,
    sequence: state.requestSequence,
    kind: nextKind
  };
  return state.activeRequest;
}

export function finishChenDataViewRequest(
  state: ChenDataViewEditState,
  sequence: number,
  kind?: ChenDataViewRequestKind
) {
  if (!isCurrentChenDataViewRequest(state, sequence, kind)) return false;
  state.activeRequest = null;
  return true;
}

export function acceptChenDataViewResponse(state: ChenDataViewEditState) {
  const request = state.activeRequest;
  if (!request) return true;
  if (!finishChenDataViewRequest(state, request.sequence, "data")) return false;
  state.refreshRequiredBeforeSave = false;
  return true;
}

export function finishChenDataViewRequestWithoutData(state: ChenDataViewEditState) {
  const request = state.activeRequest;
  return Boolean(request && finishChenDataViewRequest(state, request.sequence, "data"));
}

export function acceptChenSaveChangesPreviewResult(state: ChenDataViewEditState, result: ChenSaveChangesPreviewResult) {
  const request = state.activeRequest;
  if (!request || !isCurrentChenDataViewRequest(state, request.sequence, "preview")) return "ignored" as const;
  if (!result?.success) {
    finishChenDataViewRequest(state, request.sequence, "preview");
    state.pendingSavePayload = null;
    state.previewResult = null;
    return "failed" as const;
  }
  if (!hasCurrentChenDirtyVersion(state, request.sequence)) {
    finishChenDataViewRequest(state, request.sequence, "preview");
    state.pendingSavePayload = null;
    state.previewResult = null;
    return "stale" as const;
  }
  setChenDataViewRequestKind(state, request.sequence, "preview", "confirm");
  state.previewResult = result;
  return "confirm" as const;
}

export function cancelChenSaveChangesConfirmation(state: ChenDataViewEditState) {
  const request = state.activeRequest;
  if (!request || !finishChenDataViewRequest(state, request.sequence, "confirm")) return false;
  state.pendingSavePayload = null;
  state.previewResult = null;
  return true;
}

export function acceptChenSaveChangesResult(state: ChenDataViewEditState, result: ChenSaveChangesResult) {
  const request = state.activeRequest;
  if (!request || !isCurrentChenDataViewRequest(state, request.sequence, "save")) return "ignored" as const;

  state.saveResult = result;
  const commitOutcomeUnknown = !result?.success && result?.reason === "SAVE_CHANGES_COMMIT_OUTCOME_UNKNOWN";
  const databaseChangesApplied =
    result?.databaseChangesApplied === true ||
    (result?.databaseChangesApplied === undefined && result?.success === true);

  if (commitOutcomeUnknown || (!databaseChangesApplied && result?.connectionInvalidated === true)) {
    finishChenDataViewRequest(state, request.sequence, "save");
    state.pendingSavePayload = null;
    state.refreshRequiredBeforeSave = true;
    return "commit-unknown" as const;
  }
  if (!databaseChangesApplied) {
    finishChenDataViewRequest(state, request.sequence, "save");
    state.pendingSavePayload = null;
    return "failed" as const;
  }

  if (result.connectionInvalidated === true) state.refreshRequiredBeforeSave = true;
  if (!hasCurrentChenDirtyVersion(state, request.sequence)) {
    finishChenDataViewRequest(state, request.sequence, "save");
    state.pendingSavePayload = null;
    return "stale-applied" as const;
  }

  finishChenDataViewRequest(state, request.sequence, "save");
  state.pendingSavePayload = null;
  return "applied" as const;
}

export function isChenDataViewEditable(dataset: ChenDataViewDataset | null | undefined) {
  return dataset?.editable === true && dataset.fields.some((field) => field.editable === true);
}

export function isChenDataViewInsertable(dataset: ChenDataViewDataset | null | undefined) {
  return isChenDataViewEditable(dataset) && dataset?.fields.some((field) => field.insertable === true) === true;
}

function isNull(value: any) {
  return value === null || value === undefined;
}

function valuesEqual(left: any, right: any) {
  return left === right;
}

function primaryKeyField(dataset: ChenDataViewDataset) {
  return dataset.fields.find((field) => field.primaryKey === true || field.isPrimaryKey === true) || null;
}

function dirtyKey(pkValue: any, sourceColumn: string) {
  return `${JSON.stringify(pkValue)}::${sourceColumn}`;
}

function deleteKey(pkValue: any) {
  return JSON.stringify(pkValue);
}

function normalizeFieldType(type?: string) {
  if (!type) return "";
  let normalized = type.trim().toLowerCase();
  let changed = true;
  while (changed) {
    changed = false;
    for (const wrapper of ["nullable", "lowcardinality"]) {
      const prefix = `${wrapper}(`;
      if (normalized.startsWith(prefix) && normalized.endsWith(")")) {
        normalized = normalized.slice(prefix.length, -1).trim();
        changed = true;
      }
    }
  }
  const precisionIndex = normalized.indexOf("(");
  return precisionIndex >= 0 ? normalized.slice(0, precisionIndex).trim() : normalized;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function normalizeDate(value: any) {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }
  const match = String(value)
    .trim()
    .match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? value;
}

function normalizeTime(value: any) {
  if (value instanceof Date) {
    return `${pad2(value.getHours())}:${pad2(value.getMinutes())}:${pad2(value.getSeconds())}`;
  }
  const text = String(value).trim();
  const localized = text.match(/^(\d{1,2}):(\d{2}):(\d{2})(\.\d{1,9})?\s*(上午|下午|AM|PM)$/i);
  if (localized) {
    let hour = Number(localized[1]);
    const meridiem = localized[5]!.toUpperCase();
    if ((meridiem === "下午" || meridiem === "PM") && hour < 12) hour += 12;
    if ((meridiem === "上午" || meridiem === "AM") && hour === 12) hour = 0;
    return `${pad2(hour)}:${localized[2]}:${localized[3]}${localized[4] || ""}`;
  }
  const canonical = text.match(/^(\d{1,2}):(\d{2}):(\d{2})(\.\d{1,9})?$/);
  if (canonical) return `${pad2(Number(canonical[1]))}:${canonical[2]}:${canonical[3]}${canonical[4] || ""}`;
  return text.match(/[T\s](\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?)/)?.[1] ?? value;
}

function normalizeTimestamp(value: any, keepOffset: boolean) {
  if (value instanceof Date) {
    return `${normalizeDate(value)} ${normalizeTime(value)}`;
  }
  const text = String(value).trim();
  if (keepOffset) return text;
  const match = text.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?)/);
  return match ? `${match[1]} ${match[2]}` : value;
}

export function normalizeChenDataViewValue(value: any, field: ChenDataViewField) {
  if (isNull(value)) return value;
  const type = normalizeFieldType(field.type);
  if (type === "date") return normalizeDate(value);
  if (type === "time" || type === "time without time zone") return normalizeTime(value);
  const offset = ["timestamptz", "timestamp with time zone", "datetimeoffset"].includes(type);
  if (offset || ["timestamp", "timestamp without time zone", "datetime", "datetime2", "smalldatetime"].includes(type)) {
    return normalizeTimestamp(value, offset);
  }
  return value;
}

export function isChenInsertRow(row: Record<string, any> | null | undefined) {
  return row?.[INSERT_ID] !== undefined;
}

export function isChenDeletedRow(
  state: ChenDataViewEditState,
  dataset: ChenDataViewDataset,
  row: Record<string, any> | null | undefined
) {
  if (!row || isChenInsertRow(row)) return false;
  const primaryKey = primaryKeyField(dataset);
  if (!primaryKey) return false;
  return Boolean(state.deletedRows[deleteKey(row[primaryKey.name])]);
}

export function canEditChenDataViewCell(
  dataset: ChenDataViewDataset,
  state: ChenDataViewEditState,
  mode: ChenDataViewEditMode,
  row: Record<string, any>,
  field: ChenDataViewField
) {
  if (mode === "none" || !isChenDataViewEditable(dataset) || !field.sourceColumn) return false;
  if (isChenDeletedRow(state, dataset, row)) return false;
  if (isChenInsertRow(row)) return mode === "full" && field.insertable === true;
  return field.editable === true;
}

export function applyChenDataViewCellChange(
  state: ChenDataViewEditState,
  dataset: ChenDataViewDataset,
  row: Record<string, any>,
  field: ChenDataViewField,
  oldValue: any,
  nextValue: any
) {
  if (!field.sourceColumn) return false;
  const newValue = normalizeChenDataViewValue(nextValue, field);

  if (isChenInsertRow(row)) {
    const draft = state.insertRows.find((item) => item.id === row[INSERT_ID]);
    if (!draft) return false;
    if (nextValue === undefined) {
      delete draft.values[field.sourceColumn];
      delete draft.data[field.name];
      delete draft.data[INSERT_VALUES][field.sourceColumn];
    } else {
      draft.values[field.sourceColumn] = { value: newValue, valueIsNull: isNull(newValue) };
      draft.data[field.name] = newValue;
      draft.data[INSERT_VALUES][field.sourceColumn] = true;
    }
    state.dirtyVersion += 1;
    return true;
  }

  const primaryKey = primaryKeyField(dataset);
  if (!primaryKey?.sourceColumn) return false;
  const pkValue = row[primaryKey.name];
  if (isNull(pkValue)) return false;

  const key = dirtyKey(pkValue, field.sourceColumn);
  const existing = state.dirtyCells[key];
  const normalizedOldValue = normalizeChenDataViewValue(oldValue, field);
  const originalValue = existing ? existing.oldValue : cloneChenValue(normalizedOldValue);
  const originalValueIsNull = existing ? existing.oldValueIsNull : isNull(normalizedOldValue);
  const newValueIsNull = isNull(newValue);

  if (originalValueIsNull === newValueIsNull && valuesEqual(originalValue, newValue)) {
    delete state.dirtyCells[key];
  } else {
    state.dirtyCells[key] = {
      pkColumn: primaryKey.sourceColumn,
      pkValue,
      pkValueIsNull: false,
      sourceColumn: field.sourceColumn,
      oldValue: originalValue,
      oldValueIsNull: originalValueIsNull,
      newValue: cloneChenValue(newValue),
      newValueIsNull
    };
  }
  state.dirtyVersion += 1;
  return true;
}

export function addChenDataViewInsertRow(state: ChenDataViewEditState): ChenInsertRowDraft {
  const id = state.nextInsertRowId++;
  const draft = {
    id,
    data: { [INSERT_ID]: id, [INSERT_VALUES]: {} },
    values: {}
  };
  state.insertRows.push(draft);
  state.dirtyVersion += 1;
  return draft;
}

export function markChenDataViewRowsDeleted(
  state: ChenDataViewEditState,
  dataset: ChenDataViewDataset,
  rows: Array<Record<string, any>>
) {
  const primaryKey = primaryKeyField(dataset);
  let changed = 0;
  for (const row of rows) {
    if (isChenInsertRow(row)) {
      const index = state.insertRows.findIndex((item) => item.id === row[INSERT_ID]);
      if (index >= 0) {
        state.insertRows.splice(index, 1);
        changed += 1;
      }
      continue;
    }
    if (!primaryKey?.sourceColumn) continue;
    const pkValue = row[primaryKey.name];
    if (isNull(pkValue)) continue;
    const prefix = `${JSON.stringify(pkValue)}::`;
    for (const key of Object.keys(state.dirtyCells)) {
      if (key.startsWith(prefix)) delete state.dirtyCells[key];
    }
    const key = deleteKey(pkValue);
    if (!state.deletedRows[key]) {
      state.deletedRows[key] = { pkColumn: primaryKey.sourceColumn, pkValue, pkValueIsNull: false };
      changed += 1;
    }
  }
  if (changed) state.dirtyVersion += 1;
  return changed;
}

export function isChenDirtyCell(
  state: ChenDataViewEditState,
  dataset: ChenDataViewDataset,
  row: Record<string, any>,
  field: ChenDataViewField
) {
  if (!field.sourceColumn) return false;
  if (isChenInsertRow(row)) return Boolean(row[INSERT_VALUES]?.[field.sourceColumn]);
  const primaryKey = primaryKeyField(dataset);
  if (!primaryKey) return false;
  const pkValue = row[primaryKey.name];
  if (isNull(pkValue)) return false;
  return Boolean(state.dirtyCells[dirtyKey(pkValue, field.sourceColumn)]);
}

export function chenDataViewRows(dataset: ChenDataViewDataset, state: ChenDataViewEditState) {
  const primaryKey = primaryKeyField(dataset);
  const rows = dataset.data.map((source) => {
    const row = { ...source };
    for (const field of dataset.fields) {
      if (Object.hasOwn(row, field.name)) {
        row[field.name] = normalizeChenDataViewValue(row[field.name], field);
      }
    }
    const pkValue = primaryKey ? row[primaryKey.name] : undefined;
    if (!isNull(pkValue)) {
      for (const field of dataset.fields) {
        if (!field.sourceColumn) continue;
        const change = state.dirtyCells[dirtyKey(pkValue, field.sourceColumn)];
        if (change) row[field.name] = change.newValue;
      }
      if (state.deletedRows[deleteKey(pkValue)]) row[DELETED] = true;
    }
    return row;
  });
  const insertRows = state.insertRows.map<Record<string, any>>((item) => ({
    ...item.data,
    [INSERT_VALUES]: { ...item.data[INSERT_VALUES] }
  }));
  return [...insertRows, ...rows];
}

function editableSourceField(dataset: ChenDataViewDataset) {
  return dataset.fields.find((field) => field.editable && field.sourceTable && field.sourceColumn) || null;
}

export function buildChenSaveChangesPayload(
  meta: ChenDataViewMeta,
  dataset: ChenDataViewDataset,
  state: ChenDataViewEditState
): ChenSaveChangesPayload {
  const sourceField = editableSourceField(dataset);
  return {
    schema: Object.hasOwn(meta, "schema") ? meta.schema : sourceField?.sourceSchema,
    table: Object.hasOwn(meta, "table") ? meta.table : sourceField?.sourceTable,
    changes: Object.values(state.dirtyCells),
    insertRows: state.insertRows
      .filter((row) => Object.keys(row.values).length > 0)
      .map((row) => ({ values: row.values })),
    deleteRows: Object.values(state.deletedRows)
  };
}

export function chenDataViewTargets(tab: ChenWorkspaceTab): ChenDataViewActionTarget[] {
  if (tab.kind === "data-view") return [tab];
  if (tab.kind === "query") return tab.resultTabs;
  return [];
}

export function findChenDataViewTarget(tab: ChenWorkspaceTab, dataView: unknown): ChenDataViewActionTarget | null {
  let reference = "";
  if (typeof dataView === "string") {
    reference = dataView;
  } else if (dataView && typeof dataView === "object" && "id" in dataView && typeof dataView.id === "string") {
    reference = dataView.id;
  } else if (dataView && typeof dataView === "object" && "title" in dataView && typeof dataView.title === "string") {
    reference = dataView.title;
  }

  if (tab.kind === "data-view") {
    if (!reference || tab.meta?.id === reference || tab.meta?.title === reference || tab.title === reference)
      return tab;
    return null;
  }

  if (tab.kind !== "query" || !reference) return null;
  return (
    tab.resultTabs.find(
      (item) =>
        item.id === reference || item.meta.id === reference || item.title === reference || item.meta.title === reference
    ) || null
  );
}
