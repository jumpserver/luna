import type { GoEditChange, GoEditMetadata, GoEditPlan, GoExecution, GoRows } from "./api";

export const GO_EDIT_LIMIT = 500;
export const GO_EDIT_MAX_BYTES = 2 * 1024 * 1024;
export function editPayloadBytes(changes: GoEditChange[], source: "grid" | "csv") {
  return new TextEncoder().encode(JSON.stringify({ changes, source })).length;
}
export interface GoEditDraft {
  metadata: GoEditMetadata | null;
  changes: Record<string, GoEditChange>;
  inserts: { id: string; values: Record<string, string | null> }[];
  plan: GoEditPlan | null;
  source: "grid" | "csv";
  busy: boolean;
  refreshRequired: boolean;
  status: "" | "committed" | "staged" | "rolled_back" | "unknown";
}
export function createEditDraft(): GoEditDraft {
  return {
    metadata: null,
    changes: {},
    inserts: [],
    plan: null,
    source: "grid",
    busy: false,
    refreshRequired: false,
    status: ""
  };
}
export function editChanges(draft: GoEditDraft): GoEditChange[] {
  return [
    ...Object.values(draft.changes),
    ...draft.inserts.map(({ values }) => ({ op: "insert" as const, values: { ...values } }))
  ];
}
export function editDirty(draft: GoEditDraft) {
  return !!Object.keys(draft.changes).length || !!draft.inserts.length;
}
export function editRowRef(draft: GoEditDraft, rows: GoRows, index: number) {
  return draft.metadata?.row_refs[index + rows.offset - (draft.metadata.offset || 0)];
}
export function editDraftRows(draft: GoEditDraft, rows: GoRows): GoRows {
  return {
    ...rows,
    rows: [
      ...rows.rows.map((row, index) => {
        const ref = editRowRef(draft, rows, index);
        const values = ref && draft.changes[ref]?.values;
        return values ? row.map((value, column) => (Object.hasOwn(values, column) ? values[column] : value)) : row;
      }),
      ...draft.inserts.map(({ values }) =>
        rows.columns.map((_, index) => (Object.hasOwn(values, index) ? values[index] : undefined))
      )
    ]
  };
}
export function stageEditCell(
  draft: GoEditDraft,
  rows: GoRows,
  rowIndex: number,
  columnIndex: number,
  value: string | null
) {
  const column = draft.metadata?.columns.find((item) => item.index === columnIndex);
  const insertion = draft.inserts[rowIndex - rows.rows.length];
  if (!column || draft.refreshRequired || (value === null && !column.nullable)) return false;
  if (insertion) {
    if (!column.insertable) return false;
    insertion.values[columnIndex] = value;
  } else {
    if (draft.source === "csv") return false;
    const ref = editRowRef(draft, rows, rowIndex);
    if (!column.editable || !ref || draft.changes[ref]?.op === "delete") return false;
    const original = rows.rows[rowIndex]?.[columnIndex];
    const equivalent = value === null ? original == null : original != null && String(original) === value;
    const change = draft.changes[ref] || { op: "update" as const, row_ref: ref, values: {} };
    if (equivalent) delete change.values![columnIndex];
    else change.values![columnIndex] = value;
    if (!Object.keys(change.values!).length) delete draft.changes[ref];
    else {
      if (!draft.changes[ref] && editChanges(draft).length >= GO_EDIT_LIMIT) return false;
      draft.changes[ref] = change;
    }
  }
  draft.plan = null;
  draft.status = "";
  return true;
}
export function stageDeleteRows(draft: GoEditDraft, rows: GoRows, indexes: number[]) {
  if (draft.metadata?.mode !== "table" || draft.refreshRequired) return false;
  if (draft.source === "csv" && indexes.some((index) => index < rows.rows.length)) return false;
  const next = { ...draft.changes };
  for (const index of indexes) {
    if (index >= rows.rows.length) continue;
    const ref = editRowRef(draft, rows, index);
    if (!ref) return false;
    next[ref] = { op: "delete", row_ref: ref };
  }
  const inserts = draft.inserts.filter((_, index) => !indexes.includes(index + rows.rows.length));
  if (Object.keys(next).length + inserts.length > GO_EDIT_LIMIT) return false;
  draft.changes = next;
  draft.inserts = inserts;
  if (!Object.keys(next).length && !inserts.length) draft.source = "grid";
  draft.plan = null;
  return true;
}
export function clearEditDraft(draft: GoEditDraft) {
  draft.changes = {};
  draft.inserts = [];
  draft.plan = null;
  draft.source = "grid";
}
export function acceptEditExecution(draft: GoEditDraft, execution: GoExecution) {
  const result = execution.edit;
  if (!result || result.plan_id !== draft.plan?.plan_id) return;
  draft.status = result.outcome;
  draft.refreshRequired ||= result.refresh_required || result.outcome === "unknown";
  if (result.changes_applied) clearEditDraft(draft);
}
