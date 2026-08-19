import { describe, expect, it } from "vitest";
import { chenGridPreferenceKey } from "~/chen/composables/useChenGridPreferences";

describe("chen grid preference scopes", () => {
  it("uses a stable table scope when table metadata is available", () => {
    expect(
      chenGridPreferenceKey({ title: "orders", schema: "public", table: "orders" }, "result-1", "postgresql")
    ).toBe("table:postgresql:public:orders");
  });

  it("uses a normalized result title when a query has no table metadata", () => {
    expect(chenGridPreferenceKey({ title: "select  *  from orders" }, "result-1", "postgresql")).toBe(
      "result:postgresql:select * from orders"
    );
  });
});
