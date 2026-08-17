import { describe, expect, it } from "vitest";

import { buildChenDataViewFilter } from "~/chen/utils/dataViewFilter";

describe("data view filter builder", () => {
  it("quotes identifiers and string values", () => {
    expect(buildChenDataViewFilter("postgresql", { name: "display name", type: "varchar" }, "equals", "O'Reilly"))
      .toBe(`"display name" = 'O''Reilly'`);
  });

  it("keeps validated numeric values numeric", () => {
    expect(buildChenDataViewFilter("mysql", { name: "score", type: "decimal(10, 2)" }, "greater_than_or_equal", "12.5"))
      .toBe("`score` >= 12.5");
    expect(() => buildChenDataViewFilter("mysql", { name: "score", type: "integer" }, "equals", "1 OR 1=1"))
      .toThrow("Enter a valid number");
  });

  it("builds common text and null filters", () => {
    expect(buildChenDataViewFilter("sqlserver", { name: "status" }, "not_contains", "closed"))
      .toBe("[status] NOT LIKE '%closed%'");
    expect(buildChenDataViewFilter("oracle", { name: "deleted_at" }, "is_null", "ignored"))
      .toBe('"deleted_at" IS NULL');
  });
});
