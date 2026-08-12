import type { MaybeRefOrGetter } from "vue";
import type { ChenDataViewActionTarget, ChenDataViewField } from "~/chen/types";

import { computed, toValue } from "vue";
import {
  addChenDataViewInsertRow,
  applyChenDataViewCellChange,
  buildChenSaveChangesPayload,
  cancelChenSaveChangesConfirmation,
  canEditChenDataViewCell,
  chenDataViewHasDirty,
  chenDataViewRows,
  clearChenDataViewEdits,
  isChenDataViewEditable,
  isChenDataViewInsertable,
  markChenDataViewRowsDeleted
} from "~/chen/utils/dataViewEditing";

export function useChenDataViewEditing(target: MaybeRefOrGetter<ChenDataViewActionTarget>) {
  const current = computed(() => toValue(target));
  const dataset = computed(() => current.value.data);
  const editable = computed(() => isChenDataViewEditable(dataset.value));
  const insertable = computed(() => isChenDataViewInsertable(dataset.value));
  const dirty = computed(() => chenDataViewHasDirty(current.value.editState));
  const busy = computed(() => current.value.editState.activeRequest !== null);
  const refreshRequiredBeforeSave = computed(() => current.value.editState.refreshRequiredBeforeSave);
  const rows = computed(() => {
    const dirtyVersion = current.value.editState.dirtyVersion;
    void dirtyVersion;
    return dataset.value ? chenDataViewRows(dataset.value, current.value.editState) : [];
  });

  function addRow() {
    return addChenDataViewInsertRow(current.value.editState);
  }

  function deleteRows(targetRows: Array<Record<string, any>>) {
    if (!dataset.value) return 0;
    return markChenDataViewRowsDeleted(current.value.editState, dataset.value, targetRows);
  }

  function changeCell(row: Record<string, any>, field: ChenDataViewField, oldValue: any, newValue: any) {
    if (!dataset.value) return false;
    return applyChenDataViewCellChange(current.value.editState, dataset.value, row, field, oldValue, newValue);
  }

  function updateRows(targetRows: Array<Record<string, any>>, field: ChenDataViewField, newValue: any) {
    if (!dataset.value) return 0;
    let changed = 0;
    for (const row of targetRows) {
      if (!canEditChenDataViewCell(dataset.value, current.value.editState, "full", row, field)) continue;
      if (applyChenDataViewCellChange(current.value.editState, dataset.value, row, field, row[field.name], newValue)) {
        changed += 1;
      }
    }
    return changed;
  }

  function clear() {
    clearChenDataViewEdits(current.value.editState);
  }

  function cancelSaveConfirmation() {
    return cancelChenSaveChangesConfirmation(current.value.editState);
  }

  function buildPayload() {
    if (!current.value.meta || !dataset.value) return null;
    return buildChenSaveChangesPayload(current.value.meta, dataset.value, current.value.editState);
  }

  return {
    addRow,
    buildPayload,
    busy,
    cancelSaveConfirmation,
    changeCell,
    clear,
    deleteRows,
    dirty,
    editable,
    insertable,
    refreshRequiredBeforeSave,
    rows,
    updateRows
  };
}
