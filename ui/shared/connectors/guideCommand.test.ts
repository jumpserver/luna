import { describe, expect, it } from "vitest";
import { getGuideConnectCommand } from "./guideCommand";

const database = {
  id: "token-id",
  secret: "s3cret",
  host: "gateway.example.com",
  port: "33060",
  database: "app"
};

describe("connection guide CLI", () => {
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
