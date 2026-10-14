import { describe, expect, it } from "vitest";
import { getGuideClientProtocol, getGuideConnectCommand } from "./guideCommand";

const database = {
  id: "token-id",
  secret: "s3cret",
  host: "gateway.example.com",
  port: "33060",
  database: "app"
};

describe("connection guide client protocol", () => {
  it("uses the OceanBase client only for OceanBase assets on the shared MySQL port", () => {
    expect(getGuideClientProtocol("mysql", "oceanbase")).toBe("oceanbase");
    expect(getGuideClientProtocol("mysql", "mysql")).toBe("mysql");
  });
  it.each(["mariadb", "MariaDB", " MARIADB "])("presents %s as mysql", (protocol) => {
    expect(getGuideClientProtocol(protocol)).toBe("mysql");
  });

  it.each(["mysql", "postgresql", "redis", "oracle", "dameng", "sqlserver", "mongodb", "ssh", "vnc", "", "unknown"])(
    "preserves other protocols (%s)",
    (protocol) => {
      expect(getGuideClientProtocol(protocol)).toBe(protocol);
    }
  );
});

describe("connection guide CLI", () => {
  it("offers obclient for either OceanBase tenant mode", () => {
    expect(getGuideConnectCommand({ ...database, protocol: "mysql", assetType: "oceanbase" })).toBe(
      "obclient -u token-id -ps3cret -h gateway.example.com -P 33060 app"
    );
  });

  it("quotes special characters in copied OceanBase credentials", () => {
    expect(getGuideConnectCommand({ ...database, protocol: "mysql", assetType: "oceanbase", secret: "p'a&b" })).toBe(
      "obclient -u token-id -p'p'\\''a&b' -h gateway.example.com -P 33060 app"
    );
  });
  it.each(["mariadb", "MariaDB", " MARIADB "])(
    "uses the MySQL client for %s without changing connection details",
    (protocol) => {
      const connection = { ...database, protocol, port: "5525" };
      expect(getGuideConnectCommand(connection)).toBe("mysql -u token-id -ps3cret -h gateway.example.com -P 5525 app");
      expect(connection.protocol).toBe(protocol);
    }
  );

  it("matches the v4 MongoDB client URI including auth and load-balancer flags", () => {
    expect(
      getGuideConnectCommand({
        ...database,
        protocol: "mongodb",
        port: "27017",
        database: "admin"
      })
    ).toBe(
      'mongosh "mongodb://token-id:s3cret@gateway.example.com:27017/admin?authSource=admin&loadBalanced=true&retryWrites=false"'
    );
  });

  it("keeps the v4 SQL client command shapes", () => {
    expect(getGuideConnectCommand({ ...database, protocol: "mysql" })).toBe(
      "mysql -u token-id -ps3cret -h gateway.example.com -P 33060 app"
    );
    expect(getGuideConnectCommand({ ...database, protocol: "postgresql", port: "5432" })).toBe(
      'psql "user=token-id password=s3cret host=gateway.example.com dbname=app port=5432"'
    );
    expect(getGuideConnectCommand({ ...database, protocol: "dameng", port: "5525" })).toBe(
      "disql token-id/s3cret@gateway.example.com:5525"
    );
    expect(
      getGuideConnectCommand({
        ...database,
        protocol: "redis",
        port: "6379",
        redisAuth: "token-id@s3cret"
      })
    ).toBe("redis-cli -h gateway.example.com -p 6379 -a token-id@s3cret");
  });
});
