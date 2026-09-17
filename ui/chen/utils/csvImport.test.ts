import type { ChenDataViewField } from "~/chen/types";

import { describe, expect, it } from "vitest";

import { mapChenCsvRows, parseChenCsv } from "~/chen/utils/csvImport";

function field(name: string, extra: Partial<ChenDataViewField> = {}): ChenDataViewField {
  return {
    name,
    sourceColumn: extra.sourceColumn ?? name,
    insertable: extra.insertable ?? true,
    ...extra
  };
}

describe("csv import", () => {
  it("parses BOM, quoted commas, escaped quotes, and line breaks", () => {
    expect(parseChenCsv('\uFEFFname,note\r\nAlice,"hello, world"\r\nBob,"said ""hi""\nagain"\r\n')).toEqual({
      headers: ["name", "note"],
      rows: [
        ["Alice", "hello, world"],
        ["Bob", 'said "hi"\nagain']
      ]
    });
  });

  it("maps headers to insertable field aliases and handles empty values", () => {
    const csv = parseChenCsv("User ID,name\n42,\n");
    const fields = [
      field("id", { label: "User ID", sourceColumn: "user_id", insertable: true }),
      field("name", { sourceColumn: "name", insertable: true })
    ];
    expect(mapChenCsvRows(csv, fields, "null")).toEqual([{ id: "42", name: null }]);
  });

  it("rejects malformed rows and unknown columns", () => {
    expect(() => parseChenCsv("id,name\n1\n")).toThrow("expected 2");
    expect(() => mapChenCsvRows(parseChenCsv("unknown\nvalue\n"), [field("id")], "empty-string")).toThrow(
      "does not match a table column"
    );
  });

  it("ignores auto-increment id while importing insertable columns", () => {
    const csv = parseChenCsv("id,name\n1,Alice\n");
    const fields = [field("id", { insertable: false, primaryKey: true }), field("name")];
    expect(mapChenCsvRows(csv, fields, "empty-string")).toEqual([{ name: "Alice" }]);
  });

  it("ignores generated and read-only columns instead of treating them as unknown", () => {
    const csv = parseChenCsv("username,display_name,status_code\nalice,Alice,active\n");
    const fields = [
      field("username"),
      field("display_name", { insertable: false }),
      field("status_code", { insertable: false })
    ];
    expect(mapChenCsvRows(csv, fields, "empty-string")).toEqual([{ username: "alice" }]);
  });

  it("still rejects CSV columns that do not match any table field", () => {
    const fields = [field("id", { insertable: false }), field("name")];
    expect(() => mapChenCsvRows(parseChenCsv("name,extra\nAlice,x\n"), fields, "empty-string")).toThrow(
      "CSV column “extra” does not match a table column"
    );
  });

  it("reimports a Chen-exported CSV that includes every table field", () => {
    const csv = parseChenCsv("id,name,display_name\n1,Alice,Alice Display\n");
    const fields = [
      field("id", { insertable: false, primaryKey: true }),
      field("name"),
      field("display_name", { insertable: false })
    ];
    expect(mapChenCsvRows(csv, fields, "empty-string")).toEqual([{ name: "Alice" }]);
  });

  it("drops a historical trailing empty column so the remaining columns can import", () => {
    const csv = parseChenCsv("id,name,\n1,Alice,\n");
    expect(csv).toEqual({ headers: ["id", "name"], rows: [["1", "Alice"]] });
    expect(mapChenCsvRows(csv, [field("id", { insertable: false }), field("name")], "empty-string")).toEqual([
      { name: "Alice" }
    ]);
  });

  it("keeps duplicate, ambiguous, and invalid CSV checks", () => {
    expect(() => parseChenCsv("id,id\n1,2\n")).toThrow("duplicated");
    expect(() => parseChenCsv("id,name\n1\n")).toThrow("expected 2");
    expect(() => parseChenCsv("id,\n1,Alice\n")).toThrow("empty column header");
    expect(() =>
      mapChenCsvRows(
        parseChenCsv("id\n1\n"),
        [field("id", { label: "id" }), field("user_id", { label: "id" })],
        "empty-string"
      )
    ).toThrow("more than one table column");
    expect(() =>
      mapChenCsvRows(parseChenCsv("id,User ID\n1,2\n"), [field("id", { label: "User ID" })], "empty-string")
    ).toThrow("same table column");
  });
});
