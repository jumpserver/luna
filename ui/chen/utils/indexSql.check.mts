import assert from "node:assert/strict";

import { buildChenCreateIndexSql, buildChenDropIndexSql } from "./indexSql.ts";

assert.equal(
  buildChenCreateIndexSql(
    {
      schema: "public",
      table: "users",
      name: "users_email_idx",
      columns: ["email"],
      unique: true,
      method: "btree"
    },
    "postgresql"
  ),
  'CREATE UNIQUE INDEX "users_email_idx" ON "public"."users" USING btree ("email");'
);
assert.equal(
  buildChenDropIndexSql("", "users", "users_email_idx", "mysql"),
  "DROP INDEX `users_email_idx` ON `users`;"
);
assert.equal(
  buildChenDropIndexSql("dbo", "users", "users_email_idx", "sqlserver"),
  "DROP INDEX [users_email_idx] ON [dbo].[users];"
);
assert.throws(
  () =>
    buildChenCreateIndexSql(
      { schema: "default", table: "events", name: "events_time_idx", columns: ["time"], unique: false },
      "clickhouse"
    ),
  /not supported/
);
