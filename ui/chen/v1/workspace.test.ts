import { describe, expect, it, vi } from "vitest";
import type { GoCatalogObject, GoExecution } from "./api";
import { createChenGoApi } from "./api";
import {
  acceptQueryExecution,
  closeWarnings,
  createQueryTab,
  mergeCatalogNodes,
  objectKey,
  objectSelect,
  qualifiedObjectName,
  quoteIdentifier,
  tabContext
} from "./workspace";

vi.mock("~/chen/api/client", () => ({
  chenPath: (path: string, endpoint: string) => `${endpoint}/chen${path}`,
  buildHeaders: () => ({})
}));
const object: GoCatalogObject = { database: "db", schema: "a.b", name: 'order"items', kind: "table" };
const execution = (id: string, console = "one"): GoExecution => ({
  id,
  console_id: console,
  status: "running",
  result_ids: [],
  statement_results: [],
  audit_status: "pending"
});

describe("database workspace isolation", () => {
  it("inherits the active tab context, never the tree selection, and allocates independent drafts", () => {
    const fallback = { database: "db", schema: "public" };
    const first = createQueryTab("one", fallback);
    const nextContext = tabContext(first, fallback);
    const second = createQueryTab("two", nextContext);
    second.context.schema = "other";
    second.sql = "DELETE FROM example";
    expect(first.context.schema).toBe("public");
    expect(first.sql).toBe("SELECT 1;");
    expect(second.id).not.toBe(first.id);
    expect(tabContext({ id: "obj", kind: "object", title: "table", object }, fallback)).toEqual({
      database: "db",
      schema: "a.b"
    });
  });
  it("quotes each identifier without splitting dots and limits only explicit previews", () => {
    expect(objectSelect(object, "postgresql")).toBe('SELECT * FROM "a.b"."order""items";');
    expect(objectSelect(object, "postgresql", true)).toBe('SELECT * FROM "a.b"."order""items" LIMIT 200;');
    expect(objectSelect({ ...object, schema: "db`name", name: "a.b" }, "mysql", true)).toBe(
      "SELECT * FROM `db``name`.`a.b` LIMIT 200;"
    );
    expect(objectKey(object)).not.toBe(objectKey({ ...object, schema: "a", name: 'b.order"items' }));
    expect(quoteIdentifier('field"with.dot', "postgresql")).toBe('"field""with.dot"');
    expect(quoteIdentifier("field`with.dot", "mysql")).toBe("`field``with.dot`");
    expect(qualifiedObjectName({ ...object, schema: "" }, "postgresql")).toBe('"order""items"');
  });
  it("routes execution updates only to the matching console and current request", () => {
    const query = createQueryTab("one", { database: "db", schema: "public" });
    query.console = { id: "one", database: "db", schema: "public", state: "ready" };
    expect(acceptQueryExecution(query, execution("x", "two"))).toBe(false);
    query.pending = { sql: "SELECT 1", version: 1, id: "pending" };
    expect(acceptQueryExecution(query, execution("x"))).toBe(false);
    query.pending = null;
    expect(acceptQueryExecution(query, execution("x"))).toBe(true);
    expect(acceptQueryExecution(query, execution("old"))).toBe(false);
    expect(query.execution?.id).toBe("x");
    query.closed = true;
    expect(acceptQueryExecution(query, { ...execution("x"), status: "succeeded" })).toBe(false);
  });
  it("preserves previous results while a new execution runs and separates audit updates", () => {
    const query = createQueryTab("one", { database: "db", schema: "public" });
    query.console = { id: "one", database: "db", schema: "public", state: "ready" };
    const previous = { ...execution("before"), status: "succeeded" as const };
    query.resultExecution = previous;
    query.resultSql = "SELECT 1";
    expect(acceptQueryExecution(query, execution("after"))).toBe(true);
    expect(query.resultExecution.id).toBe("before");
    query.resultExecution = { ...execution("after"), status: "succeeded" };
    query.execution = query.resultExecution;
    acceptQueryExecution(query, { ...execution("after"), status: "succeeded", audit_status: "failed" });
    expect(query.execution.status).toBe("succeeded");
    expect(query.execution.audit_status).toBe("failed");
    expect(query.resultExecution.audit_status).toBe("failed");
    acceptQueryExecution(query, execution("after"));
    expect(query.execution.status).toBe("succeeded");
  });
  it("warns about unsaved SQL, unknown submissions and unobserved transactions independently", () => {
    const query = createQueryTab("one", { database: "db", schema: "public" });
    expect(closeWarnings([query])).toEqual({ dirty: false, running: false, unknown: false, transaction: false });
    query.sql = "BEGIN; DELETE FROM important";
    query.console = { id: "one", database: "db", schema: "public", state: "ready" };
    query.pending = { sql: query.sql, version: 2, id: "unknown" };
    expect(closeWarnings([query])).toEqual({ dirty: true, running: true, unknown: true, transaction: true });
  });
  it("retains expanded branches on refresh and deduplicates cursor boundaries", () => {
    const existing = { id: "schema", label: "public", expanded: true, children: [{ id: "table" }] };
    const refreshed = mergeCatalogNodes(
      [existing],
      [{ id: "schema", label: "public", expanded: false, children: [] }],
      false
    );
    expect(refreshed[0]).toBe(existing);
    expect(refreshed[0]?.expanded).toBe(true);
    expect(refreshed[0]?.children).toEqual([{ id: "table" }]);
    expect(
      mergeCatalogNodes(
        refreshed,
        [
          { id: "schema", label: "public", expanded: false, children: [] },
          { id: "next", label: "other", expanded: false, children: [] }
        ],
        true
      ).map((item) => item.id)
    ).toEqual(["schema", "next"]);
  });
});

describe("authorized session catalog HTTP", () => {
  it("uses session scope, encoded object paths, cursor pagination and full database search", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ items: [], has_more: false }));
    const api = createChenGoApi("https://example.test", fetcher, { mode: "single" });
    const controller = new AbortController();
    await api.catalogObjects("sid/one", { q: "a.b 中文", cursor: "next+page" }, controller.signal);
    await api.catalogColumns("sid/one", "a.b", 'table"name', "cursor");
    await api.catalogSchemas("sid/one", "more");
    const search = new URL(String(fetcher.mock.calls[0]![0]));
    expect(search.pathname).toBe("/chen/api/v1/sessions/sid%2Fone/catalog/objects");
    expect(Object.fromEntries(search.searchParams)).toEqual({ q: "a.b 中文", cursor: "next+page", limit: "100" });
    expect(fetcher.mock.calls[0]![1]?.signal).toBe(controller.signal);
    expect(new URL(String(fetcher.mock.calls[1]![0])).searchParams.get("table")).toBe('table"name');
    expect(new URL(String(fetcher.mock.calls[2]![0])).searchParams.get("cursor")).toBe("more");
    expect(fetcher.mock.calls.every((call) => call[1]?.method === "GET")).toBe(true);
  });
});
