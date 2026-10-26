import type { GoEditMetadata, GoExecution, GoRows } from "./api";
import { describe, expect, it } from "vitest";
import {
  acceptEditExecution,
  createEditDraft,
  editChanges,
  editDirty,
  editDraftRows,
  editPayloadBytes,
  editRowRef,
  stageDeleteRows,
  stageEditCell
} from "./dataEditing";
import { createQueryTab, reviewSubmission, warningSubmission } from "./workspace";

const rows: GoRows = {
  id: "r",
  columns: [
    { name: "id", data_type: "BIGINT" },
    { name: "value", data_type: "TEXT" }
  ],
  rows: [
    ["9223372036854775807", "before"],
    ["2", null]
  ],
  offset: 200,
  total_rows: 202,
  truncated: false
};
function draft(mode: "query" | "table" = "table") {
  const value = createEditDraft();
  value.metadata = {
    supported: true,
    mode,
    schema: "public",
    table: "t",
    offset: 200,
    row_refs: ["r1", "r2"],
    version: "r",
    columns: [
      { index: 0, name: "id", editable: false, insertable: true, nullable: false },
      { index: 1, name: "value", editable: true, insertable: true, nullable: true }
    ]
  } as GoEditMetadata;
  return value;
}
describe("staged data changes", () => {
  it("binds row updates to the current page's server refs, retains exact numeric strings and removes reverted cells", () => {
    const value = draft();
    expect(editRowRef(value, rows, 0)).toBe("r1");
    expect(stageEditCell(value, rows, 0, 1, "9223372036854775807")).toBe(true);
    expect(editChanges(value)).toEqual([{ op: "update", row_ref: "r1", values: { 1: "9223372036854775807" } }]);
    expect(rows.rows[0]![1]).toBe("before");
    expect(editDraftRows(value, rows).rows[0]![1]).toBe("9223372036854775807");
    expect(stageEditCell(value, rows, 0, 1, "before")).toBe(true);
    expect(editDirty(value)).toBe(false);
  });
  it("distinguishes null, empty strings and an omitted insert default", () => {
    const value = draft();
    value.inserts.push({ id: "new", values: {} });
    expect(editDraftRows(value, rows).rows[2]).toEqual([undefined, undefined]);
    expect(stageEditCell(value, rows, 2, 1, "")).toBe(true);
    expect(editChanges(value)[0]!.values).toEqual({ 1: "" });
    expect(stageEditCell(value, rows, 2, 1, null)).toBe(true);
    expect(editChanges(value)[0]!.values).toEqual({ 1: null });
    expect(stageEditCell(value, rows, 2, 0, null)).toBe(false);
  });
  it("requires trusted table mode for deletes and suppresses changes on deleted rows", () => {
    expect(stageDeleteRows(draft("query"), rows, [0])).toBe(false);
    const value = draft();
    stageEditCell(value, rows, 0, 1, "changed");
    expect(stageDeleteRows(value, rows, [0])).toBe(true);
    expect(editChanges(value)).toEqual([{ op: "delete", row_ref: "r1" }]);
    expect(stageEditCell(value, rows, 0, 1, "again")).toBe(false);
  });
  it("keeps CSV batches insert-only and restores grid mode when the import is removed", () => {
    const value = draft();
    value.source = "csv";
    value.inserts.push({ id: "new", values: { 1: "中文" } });
    expect(stageEditCell(value, rows, 0, 1, "blocked")).toBe(false);
    expect(stageDeleteRows(value, rows, [0])).toBe(false);
    expect(stageDeleteRows(value, rows, [2])).toBe(true);
    expect(value.source).toBe("grid");
    expect(editPayloadBytes([{ op: "insert", values: { 1: "中文" } }], "csv")).toBeGreaterThan(
      JSON.stringify({ changes: [{ op: "insert", values: { 1: "中文" } }], source: "csv" }).length
    );
  });
  it("retains unknown drafts but prevents another save; clears applied drafts without claiming commit", () => {
    const value = draft();
    stageEditCell(value, rows, 0, 1, "changed");
    value.plan = { plan_id: "p" } as never;
    acceptEditExecution(value, { edit: { plan_id: "p", outcome: "unknown", refresh_required: true } } as never);
    expect(editDirty(value)).toBe(true);
    expect(stageEditCell(value, rows, 0, 1, "again")).toBe(false);
    acceptEditExecution(value, {
      edit: {
        plan_id: "p",
        outcome: "staged",
        changes_applied: true,
        database_committed: false,
        refresh_required: true
      }
    } as never);
    expect(editDirty(value)).toBe(false);
    expect(value.status).toBe("staged");
  });
  it("keeps preview plans bound across explicit warning/review, and rejects approval after discarding", () => {
    const query = createQueryTab("Q", { database: "db", schema: "s" });
    query.edit.plan = { plan_id: "p" } as never;
    query.executionEditPlan = "p";
    query.executionSql = "UPDATE preview";
    query.execution = { status: "failed", error: { code: "command_review_required" } } as GoExecution;
    expect(reviewSubmission(query)?.editPlanId).toBe("p");
    query.execution!.error!.code = "command_warning_confirmation_required";
    expect(warningSubmission(query)?.editPlanId).toBe("p");
    query.edit.plan = null;
    expect(warningSubmission(query)).toBeNull();
    query.execution!.error!.code = "command_review_required";
    expect(reviewSubmission(query)).toBeNull();
  });
});
