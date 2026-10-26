import { describe, expect, it } from "vitest";
import type { GoCatalogObject } from "./api";
import { columnChangeSql, createTableSql, canAlterColumnDefinition, droppableIndexes } from "./schemaSql";
const object: GoCatalogObject = { database: "db", schema: "a.b", name: "items", kind: "table" };
const input = { name: "name", type: "VARCHAR", size: "200", nullable: true };
const original = { name: "before", data_type: "varchar(100)", nullable: false };
describe("schema change SQL previews", () => {
  it("keeps schema and table identifiers separate, even with dots and quotes", () => {
    expect(
      createTableSql(
        { ...object, name: 'new"table' },
        [{ id: "1", name: "id", type: "BIGINT", size: "", nullable: false, primaryKey: true }],
        "postgresql"
      )
    ).toContain('CREATE TABLE "a.b"."new""table"');
    expect(columnChangeSql(object, "mysql", "rename", original, input)).toBe(
      "ALTER TABLE `a.b`.`items` RENAME COLUMN `before` TO `name`;"
    );
  });
  it("does not generate MySQL MODIFY that would silently discard defaults and identity", () => {
    expect(canAlterColumnDefinition("oceanbase-mysql")).toBe(false);
    expect(() => columnChangeSql(object, "mysql", "alter", original, input)).toThrow("preserve column attributes");
  });
  it("uses native Db2 type and PostgreSQL nullability commands", () => {
    expect(columnChangeSql(object, "db2", "alter", original, input)).toContain(
      'ALTER COLUMN "before" SET DATA TYPE VARCHAR(200);'
    );
    expect(columnChangeSql(object, "postgresql", "alter", original, input)).toBe(
      'ALTER TABLE "a.b"."items" ALTER COLUMN "before" TYPE VARCHAR(200);\nALTER TABLE "a.b"."items" ALTER COLUMN "before" DROP NOT NULL;'
    );
  });
  it("preserves native types for nullability-only PG and Db2 changes", () => {
    for (const dialect of ["postgresql", "db2"]) {
      expect(
        columnChangeSql(
          object,
          dialect,
          "alter",
          { ...original, data_type: "timestamp with time zone" },
          { ...input, type: "timestamp with time zone", size: "" }
        )
      ).toBe('ALTER TABLE "a.b"."items" ALTER COLUMN "before" DROP NOT NULL;');
    }
    expect(() =>
      columnChangeSql(
        object,
        "sqlserver",
        "alter",
        { ...original, data_type: "nvarchar(max)" },
        { ...input, type: "NVARCHAR", size: "max" }
      )
    ).toThrow("precision");
  });
  it("rejects type/precision injection while quoting user identifiers", () => {
    expect(() =>
      columnChangeSql(object, "postgresql", "add", undefined, { ...input, size: "2); DROP TABLE x; --" })
    ).toThrow("precision");
    expect(() =>
      columnChangeSql(object, "postgresql", "add", undefined, { ...input, type: "TEXT); DROP TABLE x; --" })
    ).toThrow("supported type");
    expect(
      columnChangeSql(object, "postgresql", "add", undefined, { ...input, name: 'x"; DROP TABLE t; --' })
    ).toContain('"x""; DROP TABLE t; --"');
  });
  it("protects primary, unique and constraint indexes across all constituent columns", () => {
    expect(
      droppableIndexes({
        sections: {
          primary_key: { items: [{ name: "pk" }] },
          indexes: {
            items: [
              { name: "pk" },
              { name: "ordinary", unique: false },
              { name: "constraint", protected: true },
              { name: "constraint" },
              { name: "renamed_pk_index", unique: true },
              { name: "unique_index", unique: true }
            ]
          }
        }
      } as never)
    ).toEqual(["ordinary"]);
  });
});
