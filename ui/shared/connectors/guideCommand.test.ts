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
  it("uses native IBM db2cli with the Magnus endpoint, token and SERVER authentication", () => {
    expect(getGuideConnectCommand({ ...database, host: "[::1]", protocol: "db2" })).toBe(
      'db2cli execsql -connstring "DATABASE=app;HOSTNAME=::1;PORT=33060;PROTOCOL=TCPIP;AUTHENTICATION=SERVER;UID=token-id;PWD=s3cret;"'
    );
  });

  it.each([{ database: "app;PWD=x" }, { secret: "$(bad)" }, { host: "" }, { port: "65536" }])(
    "omits a DB2 command that cannot be copied safely (%o)",
    (override) => {
      expect(getGuideConnectCommand({ ...database, ...override, protocol: "db2" })).toBe("");
    }
  );

  it("uses the ClickHouse Native client with shell-quoted values", () => {
    expect(getGuideConnectCommand({ ...database, protocol: "clickhouse", port: "15525", secret: "a'b $(id)" })).toBe(
      "clickhouse-client --host='gateway.example.com' --port='15525' --user='token-id' --password='a'\\''b $(id)' --database='app'"
    );
  });

  it.each(["mariadb", "MariaDB", " MARIADB "])(
    "uses the MySQL client for %s without changing connection details",
    (protocol) => {
      const connection = { ...database, protocol, port: "5525" };
      expect(getGuideConnectCommand(connection)).toBe(
        "mysql --protocol=TCP -u token-id -ps3cret -h gateway.example.com -P 5525 --ssl-mode=DISABLED app"
      );
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
      "mysql --protocol=TCP -u token-id -ps3cret -h gateway.example.com -P 33060 --ssl-mode=DISABLED app"
    );
    expect(getGuideConnectCommand({ ...database, protocol: "postgresql", port: "5432" })).toBe(
      'psql "user=token-id password=s3cret host=gateway.example.com dbname=app port=5432 sslmode=disable"'
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

describe("Oracle connection guide role", () => {
  it.each([undefined, false, true])("uses the effective SYSDBA option (%s)", (useSysDBA) => {
    expect(getGuideConnectCommand({ ...database, protocol: "oracle", useSysDBA })).toBe(
      `sqlplus token-id/s3cret@gateway.example.com:33060/token-id${useSysDBA ? " as sysdba" : ""}`
    );
  });
  it("does not add Oracle roles to other protocols", () => {
    expect(getGuideConnectCommand({ ...database, protocol: "mysql", useSysDBA: true })).toBe(
      "mysql --protocol=TCP -u token-id -ps3cret -h gateway.example.com -P 33060 --ssl-mode=DISABLED app"
    );
  });
});
