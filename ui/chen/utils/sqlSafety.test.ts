import { describe, expect, it } from "vitest";
import { chenUnrestrictedMutations } from "~/chen/utils/sqlSafety";

describe("sql mutation safety", () => {
  it.each([
    ["UPDATE accounts SET enabled = false", ["UPDATE"]],
    ["UPDATE accounts SET note = 'where'", ["UPDATE"]],
    ["delete from sessions;", ["DELETE"]],
    ["DELETE FROM sessions /* WHERE id = 1 */", ["DELETE"]],
    ["WITH stale AS (SELECT id FROM sessions WHERE expired) DELETE FROM sessions", ["DELETE"]],
    ["WITH removed AS (DELETE FROM sessions RETURNING id) SELECT * FROM removed", ["DELETE"]],
    ["UPDATE accounts SET owner_id = (SELECT id FROM users WHERE admin)", ["UPDATE"]],
    ["SELECT 1; DELETE FROM sessions; UPDATE accounts SET enabled = false", ["DELETE", "UPDATE"]]
  ])("requires confirmation for unrestricted mutations: %s", (sql, expected) => {
    expect(chenUnrestrictedMutations(sql)).toEqual(expected);
  });

  it.each([
    "UPDATE accounts SET enabled = false WHERE id = 1",
    "DELETE FROM sessions WHERE expired = true",
    "-- DELETE FROM sessions\nSELECT 1",
    "SELECT 'UPDATE accounts SET enabled = false'",
    "UPDATE accounts SET note = 'where' WHERE id = 1",
    "WITH target AS (SELECT id FROM sessions WHERE expired) DELETE FROM sessions WHERE id IN (SELECT id FROM target)"
  ])("does not require confirmation for constrained or non-executed SQL: %s", (sql) => {
    expect(chenUnrestrictedMutations(sql)).toEqual([]);
  });
});
