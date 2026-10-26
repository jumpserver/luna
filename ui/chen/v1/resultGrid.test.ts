import { describe, expect, it } from "vitest";
import {
  extendChenGridSelection,
  finishChenGridSelection,
  getChenGridSelectionBounds,
  startChenGridSelection
} from "~/chen/utils/dataGridSelection";
import {
  compareResultValues,
  formatResultJson,
  formatResultHex,
  resultBinaryHex,
  resultJsonFormat,
  resultValuePart,
  resultValuePreview,
  resultValueText,
  RESULT_JSON_FORMAT_LIMIT,
  resultContextSelection,
  resultDisplayText,
  resultFocusSelection,
  resultGridRows,
  resultSelectionTsv,
  resultTypeBadge
} from "./resultGrid";

describe("read-only result grid", () => {
  it("keeps a range on right-click inside it and selects a single cell outside it", () => {
    const selection = finishChenGridSelection(
      extendChenGridSelection(startChenGridSelection({ rowIndex: 2, colId: "a" }), { rowIndex: 4, colId: "c" })
    );
    expect(resultContextSelection(selection, ["a", "b", "c"], { rowIndex: 3, colId: "b" })).toEqual(selection);
    expect(resultContextSelection(selection, ["a", "b", "c"], { rowIndex: 1, colId: "b" })).toEqual(
      finishChenGridSelection(startChenGridSelection({ rowIndex: 1, colId: "b" }))
    );
  });
  it("classifies SQL types without mistaking intervals or points for numbers", () => {
    for (const type of ["INT4", "BIGINT", "UNSIGNED BIGINT", "decimal(20, 4)", "double precision", "float8"]) {
      expect(resultTypeBadge(type)).toBe("123");
    }
    expect(resultTypeBadge("interval")).toBe("date");
    expect(resultTypeBadge("point")).toBe("");
    expect(resultTypeBadge("timestamp with time zone")).toBe("date");
    expect(resultTypeBadge("character varying")).toBe("abc");
    expect(resultTypeBadge("_int4")).toBe("[]");
    expect(resultTypeBadge("integer[]")).toBe("[]");
    expect(resultTypeBadge("jsonb")).toBe("{}");
    expect(resultTypeBadge("boolean")).toBe("bool");
    expect(resultTypeBadge("bit varying")).toBe("bin");
  });
  it("keeps a keyboard range through delayed and out-of-order focus notifications", () => {
    let selection = finishChenGridSelection(startChenGridSelection({ rowIndex: 0, colId: "a" }));
    const expected = new Set<string>();
    for (const cell of [
      { rowIndex: 0, colId: "b" },
      { rowIndex: 0, colId: "c" },
      { rowIndex: 1, colId: "c" },
      { rowIndex: 2, colId: "c" }
    ]) {
      selection = finishChenGridSelection(extendChenGridSelection(selection, cell));
      expected.add(`${cell.rowIndex}:${cell.colId}`);
    }
    for (const cell of [
      { rowIndex: 1, colId: "c" },
      { rowIndex: 0, colId: "b" },
      { rowIndex: 0, colId: "c" },
      { rowIndex: 2, colId: "c" }
    ]) {
      selection = resultFocusSelection(selection, cell, expected);
    }
    expect(getChenGridSelectionBounds(selection, ["a", "b", "c"])).toMatchObject({
      minRow: 0,
      maxRow: 2,
      minCol: 0,
      maxCol: 2
    });
    selection = resultFocusSelection(selection, { rowIndex: 2, colId: "c" }, expected);
    expect(selection.anchor).toEqual({ rowIndex: 0, colId: "a" });
    selection = resultFocusSelection(selection, { rowIndex: 3, colId: "c" }, expected);
    expect(selection.anchor).toEqual({ rowIndex: 3, colId: "c" });
  });
  it("classifies extended-engine scalar, LOB and nested ClickHouse types", () => {
    for (const type of ["NUMBER(38, 0)", "BINARY_DOUBLE", "DECFLOAT", "UInt256", "Nullable(Decimal128(8))"])
      expect(resultTypeBadge(type)).toBe("123");
    for (const type of [
      "CLOB",
      "NCLOB",
      "DBCLOB",
      "NVARCHAR(MAX)",
      "NVARCHAR2(100)",
      "LONG",
      "LowCardinality(Nullable(String))"
    ])
      expect(resultTypeBadge(type)).toBe("abc");
    for (const type of ["LONG RAW", "RAW(16)", "BLOB", "VARBINARY(MAX)", "IMAGE"])
      expect(resultTypeBadge(type)).toBe("bin");
    for (const type of ["DateTime64(9, 'UTC')", "DATETIME2", "DATETIMEOFFSET", "Date32"])
      expect(resultTypeBadge(type)).toBe("date");
    for (const type of ["Nullable(Array(UInt64))", "Array(Tuple(String, UInt64))", "Tuple(UInt64, String)"])
      expect(resultTypeBadge(type)).toBe("[]");
    expect(resultTypeBadge("Map(String, UInt64)")).toBe("{}");
  });
  it("preserves exact API numeric strings inside ClickHouse arrays and maps", () => {
    const value = ["18446744073709551615", { id: "9007199254740993", nullable: null }];
    expect(resultValueText(value)).toBe('["18446744073709551615",{"id":"9007199254740993","nullable":null}]');
    expect(formatResultJson(resultValueText(value))).toContain('"18446744073709551615"');
  });
  it("formats JSON without rounding large numbers or changing escaped string content", () => {
    const text = '{"id":9007199254740993,"text":"x \\" y, []","empty":[],"nested":{"decimal":1.0000000000000001}}';
    const formatted = formatResultJson(text);
    expect(formatted).toContain("9007199254740993");
    expect(formatted).toContain("1.0000000000000001");
    expect(formatted).toContain('"text": "x \\" y, []"');
    expect(formatted).toContain('"empty": []');
    expect(JSON.parse(formatted)).toEqual(JSON.parse(text));
    expect(formatResultJson("not json")).toBe("not json");
  });
  it("bounds table previews without modifying multiline, empty or copied original values", () => {
    const original = `first\nsecond\t${"x".repeat(300)}`;
    const preview = resultValuePreview(original);
    expect(preview).toContain("first ↵ second ⇥ ");
    expect(preview).toMatch(/…$/);
    expect(preview).not.toContain("\n");
    expect(preview).not.toContain("\t");
    expect(resultSelectionTsv([{ value: original }], [{ id: "value", name: "value" }])).toContain(
      original.replaceAll('"', '""')
    );
    expect(resultValuePreview("123😀abc", 4)).toBe("123…");
    expect([null, "", "NULL"].map((value) => resultValuePreview(value))).toEqual(["NULL", "''", '\"NULL\"']);
  });
  it("splits large values without losing or duplicating surrogate pairs at part boundaries", () => {
    const original = "abc😀def🧑ghi";
    const parts = Array.from({ length: resultValuePart(original, 0, 4).total }, (_, index) =>
      resultValuePart(original, index, 4)
    );
    expect(parts.map((part) => part.text).join("")).toBe(original);
    expect(parts.map((part) => part.text)).toEqual(["abc", "😀def", "🧑gh", "i"]);
    expect(resultValuePart(original, 500, 4).index).toBe(3);
    expect(resultValuePart("", 0, 4)).toMatchObject({ total: 1, index: 0, text: "" });
    for (const part of parts) expect(part.text.isWellFormed()).toBe(true);
  });
  it("skips oversized JSON before parsing and limits deeply indented output", () => {
    const large = `{"body":"${"x".repeat(RESULT_JSON_FORMAT_LIMIT)}"}`;
    expect(resultJsonFormat(large)).toEqual({ text: null, limited: true });
    expect(formatResultJson(large)).toBe(large);
    const nested = "[".repeat(32) + Array.from({ length: 12000 }, () => "0").join(",") + "]".repeat(32);
    expect(resultJsonFormat(nested)).toEqual({ text: null, limited: true });
    expect(resultJsonFormat("invalid json")).toEqual({ text: null, limited: false });
    expect(resultJsonFormat('{"ok":true}')).toEqual({ text: '{\n  "ok": true\n}', limited: false });
  });
  it("recognizes binary values only from database binary types and preserves byte offsets", () => {
    expect(resultBinaryHex("0x414200ff", "BYTEA")).toBe("414200ff");
    expect(resultBinaryHex("0x", "BLOB")).toBe("");
    expect(resultBinaryHex("0x4142", "VARBINARY(50)")).toBe("4142");
    for (const type of ["RAW(16)", "LONG RAW", "IMAGE", "BLOB", "Nullable(BLOB)"])
      expect(resultBinaryHex("0x00ff", type)).toBe("00ff");
    for (const type of ["CLOB", "NCLOB", "DBCLOB", "NVARCHAR(MAX)", "FixedString(16)", "String"])
      expect(resultBinaryHex("0x00ff", type)).toBeNull();
    expect(resultBinaryHex("0x4142", "TEXT")).toBeNull();
    expect(resultBinaryHex("0x4142", "BIT")).toBeNull();
    expect(resultBinaryHex("0x123", "BLOB")).toBeNull();
    expect(formatResultHex("414200ff", 256)).toBe("00000100  41 42 00 ff                                      |AB..|");
    expect(formatResultHex("00".repeat(17)).split("\n")[1]).toMatch(/^00000010 {2}00/);
  });
  it("preserves duplicate, dotted and prototype-like column names by ordinal", () => {
    expect(
      resultGridRows({
        id: "r",
        columns: [
          { name: "id", data_type: "int8" },
          { name: "id", data_type: "int8" },
          { name: "__proto__", data_type: "text" },
          { name: "a.b", data_type: "text" }
        ],
        rows: [["9007199254740993", "2", "safe", "value"]],
        offset: 200,
        total_rows: 201,
        truncated: false
      })
    ).toEqual([{ __row: 201, column_0: "9007199254740993", column_1: "2", column_2: "safe", column_3: "value" }]);
  });
  it("copies selected columns in display order with duplicate headers and escaped multiline values", () => {
    expect(
      resultSelectionTsv(
        [{ column_0: "a\tb", column_1: 'line\n"two"', column_2: { ok: true } }],
        [
          { id: "column_1", name: "value" },
          { id: "column_0", name: "value" },
          { id: "column_2", name: "json" }
        ],
        true
      )
    ).toBe('value\tvalue\tjson\n"line\n""two"""\t"a\tb"\t"{""ok"":true}"');
  });
  it("distinguishes null, empty and literal NULL values without changing copied strings", () => {
    expect([null, "", "NULL"].map(resultDisplayText)).toEqual(["NULL", "''", '"NULL"']);
    expect(
      resultSelectionTsv(
        [{ a: null, b: "", c: "NULL" }],
        [
          { id: "a", name: "a" },
          { id: "b", name: "b" },
          { id: "c", name: "c" }
        ]
      )
    ).toBe("NULL\t\tNULL");
  });
  it("sorts exact integers and decimals without losing precision", () => {
    for (const [a, b] of [
      ["2", "10"],
      ["9007199254740992", "9007199254740993"],
      ["1.00000000000000000001", "1.00000000000000000002"],
      ["-10", "-2"],
      ["0.001", "1e-2"],
      ["0", "0.1"]
    ]) {
      expect(compareResultValues(a, b, true)).toBeLessThan(0);
      expect(compareResultValues(b, a, true)).toBeGreaterThan(0);
    }
    expect(compareResultValues("001.00", "1e0", true)).toBe(0);
    expect(compareResultValues("-0", "0", true)).toBe(0);
    expect(compareResultValues(null, "1", true)).toBeLessThan(0);
  });
});
