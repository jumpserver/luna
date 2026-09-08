import { describe, expect, it } from "vitest";
import { hasItemName, isItemNameTooLong, ITEM_NAME_MAX_LENGTH } from "~/utils/itemName";

describe("item names", () => {
  it("detects duplicate names and ignores the item being renamed", () => {
    const items = [
      { id: "a", name: "web-1" },
      { id: "b", name: "db-1" }
    ];

    expect(hasItemName(items, "web-1")).toBe(true);
    expect(hasItemName(items, " WEB-1 ")).toBe(true);
    expect(hasItemName(items, "web-1", "a")).toBe(false);
    expect(hasItemName(items, "other")).toBe(false);
  });

  it("limits names to the supported length", () => {
    expect(isItemNameTooLong("a".repeat(ITEM_NAME_MAX_LENGTH))).toBe(false);
    expect(isItemNameTooLong("a".repeat(ITEM_NAME_MAX_LENGTH + 1))).toBe(true);
    expect(isItemNameTooLong("😀".repeat(ITEM_NAME_MAX_LENGTH / 2))).toBe(false);
    expect(isItemNameTooLong("😀".repeat(ITEM_NAME_MAX_LENGTH / 2 + 1))).toBe(true);
  });
});
