import type { ChenDataViewField } from "~/chen/types";

import { describe, expect, it } from "vitest";
import { createChenInsertSql, createChenUpdateSql, hasChenPrimaryKey, resolveChenCopyMeta } from "./dataGridCopy";

const meta = { id: "result-1", title: "SELECT * FROM users WHERE id = 133 ORDER BY id DESC" };
const fields: ChenDataViewField[] = [
  { name: "id", schema: "app", sourceTable: "users", sourceColumn: "id", isPrimaryKey: true },
  { name: "value", schema: "app", sourceTable: "users", sourceColumn: "value" }
];

describe("query result SQL copy metadata", () => {
  it("copies INSERT and UPDATE from a title-only v5 query result", () => {
    const resolved = resolveChenCopyMeta(meta, fields);
    expect(resolved).toEqual({ ...meta, schema: "app", table: "users" });
    expect(meta).not.toHaveProperty("schema");
    expect(meta).not.toHaveProperty("table");
    const row = { id: 133, value: "O'Brien" };
    expect(createChenInsertSql("mysql", resolved!, fields, row)).toBe(
      "INSERT INTO `app`.`users` (`id`, `value`) VALUES (133, 'O''Brien');"
    );
    expect(createChenUpdateSql("mysql", resolved!, fields, row)).toBe(
      "UPDATE `app`.`users` SET `value` = 'O''Brien' WHERE `id` = 133;"
    );
  });

  it("uses canonical source columns for aliases and an explicitly qualified database", () => {
    const aliased = fields.map((field) => ({
      ...field,
      name: `alias_${field.name}`,
      columnName: `alias_${field.name}`,
      sourceSchema: "archive"
    }));
    const resolved = resolveChenCopyMeta(meta, aliased);
    const row = { alias_id: 133, alias_value: null };
    expect(createChenInsertSql("mysql", resolved!, aliased, row)).toBe(
      "INSERT INTO `archive`.`users` (`id`, `value`) VALUES (133, NULL);"
    );
    expect(createChenUpdateSql("mysql", resolved!, aliased, row)).toBe(
      "UPDATE `archive`.`users` SET `value` = NULL WHERE `id` = 133;"
    );
  });

  it("allows INSERT without requiring a primary key", () => {
    const noKey = fields.map((field) => ({ ...field, isPrimaryKey: false }));
    expect(resolveChenCopyMeta(meta, noKey)).toMatchObject({ schema: "app", table: "users" });
    expect(hasChenPrimaryKey(noKey)).toBe(false);
    expect(() => createChenUpdateSql("mysql", resolveChenCopyMeta(meta, noKey)!, noKey, {})).toThrow(
      "UPDATE requires reliable primary key metadata"
    );
  });

  it("preserves explicit table-view metadata", () => {
    const explicit = { ...meta, schema: "app", table: "users" };
    expect(resolveChenCopyMeta(explicit, [{ name: "id" }])).toBe(explicit);
  });

  it.each([
    ["missing fields", []],
    ["missing schema", fields.map((field) => ({ ...field, schema: undefined }))],
    ["missing source table", fields.map((field) => ({ ...field, sourceTable: undefined }))],
    ["missing source column", [fields[0]!, { ...fields[1]!, sourceColumn: undefined }]],
    ["expression column", [...fields, { name: "total", schema: "app", table: "users" }]],
    ["different tables", [fields[0]!, { ...fields[1]!, sourceTable: "members" }]],
    ["different schemas", [fields[0]!, { ...fields[1]!, schema: "archive" }]],
    ["duplicate source columns", [fields[0]!, { ...fields[0]!, name: "other_id" }]]
  ] as const)("leaves SQL copy unavailable for %s", (_name, columns) => {
    expect(resolveChenCopyMeta(meta, [...columns])).toBeNull();
  });

  it("requires analyzed provenance even when JDBC table names are available", () => {
    const jdbcOnly = fields.map(({ sourceTable, sourceColumn, ...field }) => ({ ...field, table: sourceTable }));
    expect(resolveChenCopyMeta(meta, jdbcOnly)).toBeNull();
    expect(resolveChenCopyMeta(null, fields)).toBeNull();
  });

  it("rejects conflicting partial result metadata", () => {
    expect(resolveChenCopyMeta({ ...meta, schema: "archive" }, fields)).toBeNull();
    expect(resolveChenCopyMeta({ ...meta, table: "members" }, fields)).toBeNull();
  });

  it("keeps separate results isolated", () => {
    expect(resolveChenCopyMeta(meta, fields)).toMatchObject({ schema: "app" });
    expect(
      resolveChenCopyMeta(
        meta,
        fields.map((field) => ({ ...field, schema: "archive" }))
      )
    ).toMatchObject({
      schema: "archive"
    });
    expect(resolveChenCopyMeta(meta, [])).toBeNull();
  });
});
