import { describe, expect, it } from "vitest";

import { mapChenCsvRows, parseChenCsv } from "~/chen/utils/csvImport";

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
      { name: "id", label: "User ID", sourceColumn: "user_id", insertable: true },
      { name: "name", sourceColumn: "name", insertable: true }
    ];
    expect(mapChenCsvRows(csv, fields, "null")).toEqual([{ id: "42", name: null }]);
  });

  it("rejects malformed rows and unknown columns", () => {
    expect(() => parseChenCsv("id,name\n1\n")).toThrow("expected 2");
    expect(() => mapChenCsvRows(parseChenCsv("unknown\nvalue\n"), [{ name: "id" }], "empty-string")).toThrow(
      "does not match"
    );
  });
});
