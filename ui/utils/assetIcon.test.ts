import { describe, expect, it } from "vitest";
import { resolveAssetIconFromFields, resolveAssetIconSrc } from "./assetIcon";

describe("asset icon URLs", () => {
  it("uses the Nuxt app base URL for public icons", () => {
    expect(resolveAssetIconSrc("linux", "/luna/")).toBe("/luna/icons/linux.png");
    expect(resolveAssetIconFromFields({ platform: "PostgreSQL" }, "/luna/").src).toBe("/luna/icons/postgre.png");
  });

  it("keeps root-hosted icon URLs unchanged", () => {
    expect(resolveAssetIconSrc("windows")).toBe("/icons/windows.png");
  });
});
