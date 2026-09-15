import { describe, expect, it } from "vitest";
import { resolveAssetIconFromCandidates, resolveAssetIconFromFields, resolveAssetIconSrc } from "./assetIcon";

describe("asset icon URLs", () => {
  it("uses the Nuxt app base URL for public icons", () => {
    expect(resolveAssetIconSrc("linux", "/luna/")).toBe("/luna/icons/linux.svg");
    expect(resolveAssetIconFromFields({ platform: "PostgreSQL" }, "/luna/").src).toBe("/luna/icons/postgre.svg");
  });

  it("keeps root-hosted icon URLs unchanged", () => {
    expect(resolveAssetIconSrc("windows")).toBe("/icons/windows.svg");
  });

  it.each([
    ["MySQL", "mysql.svg"],
    ["MariaDB", "mariadb.svg"],
    ["Oracle", "oracle.svg"],
    ["SQLServer", "sqlserver.svg"],
    ["PostgreSQL", "postgre.svg"],
    ["Redis", "redis.svg"],
    ["MongoDB", "mongodb.svg"],
    ["ClickHouse", "clickhouse.svg"],
    ["Dameng", "dameng.png"],
    ["Linux", "linux.svg"],
    ["Windows", "windows.svg"],
    ["Windows_AD", "windows.svg"],
    ["Website", "chrome.svg"],
    ["Kubernetes", "kubernetes.svg"],
    ["K8s", "kubernetes.svg"]
  ])("uses the same icon for %s in asset and favorite trees", (platform, filename) => {
    const icon = resolveAssetIconFromFields({ platform }, "/luna/");
    expect(icon.src).toBe(`/luna/icons/${filename}`);
    expect(resolveAssetIconFromCandidates([undefined, platform, "asset"], "/luna/")).toEqual(icon);
    expect(resolveAssetIconSrc(platform, "/luna/")).toBe(icon.src);
  });

  it("keeps a known database vendor ahead of the generic database category", () => {
    expect(resolveAssetIconFromFields({ platform: "MySQL", category: "database" }).src).toBe("/icons/mysql.svg");
  });

  it("keeps database vendors ahead of web hints in tree labels", () => {
    expect(resolveAssetIconFromCandidates(["PostgreSQL", "database", "web-db"]).src).toBe("/icons/postgre.svg");
  });

  it("uses a generic database icon when no vendor is known", () => {
    expect(resolveAssetIconFromFields({ category: "database" })).toEqual({
      src: "",
      fallback: "i-tabler-database-filled"
    });
    expect(resolveAssetIconSrc("database")).toBe("");
  });
});
