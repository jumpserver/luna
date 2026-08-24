import { describe, expect, it } from "vitest";
import { interpolateWatermark } from "#online-player/utils/watermark";

describe("interpolateWatermark", () => {
  it("replaces known fields and uses N/A for blanks", () => {
    expect(
      interpolateWatermark(["$", "{name}($", "{userName}) @ $", "{assetName}"].join(""), {
        name: "张三",
        userName: "zhangsan",
        assetName: ""
      })
    ).toBe("张三(zhangsan) @ N/A");
  });
});
