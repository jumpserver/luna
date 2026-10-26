import { afterEach, describe, expect, it, vi } from "vitest";
import { ChenGoError, createChenGoApi, executionActive, executionCanCancel, reconcileExecution } from "./api";
import { readChenEvents } from "./events";
import { completionIsCurrent } from "./completion";
import { useGoChenProtocol } from "./routing";

vi.mock("~/chen/api/client", () => ({
  chenPath: (path: string, endpoint: string) => `${endpoint}/chen${path}`,
  buildHeaders: (token: string, extra: Record<string, string>) => ({ ...(token ? { token } : {}), ...extra })
}));
afterEach(() => vi.unstubAllGlobals());

function stream(chunks: string[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    }
  });
}
describe("Chen Go event transport", () => {
  it("decodes split CRLF and multiple data lines, ignores heartbeats", async () => {
    const received: unknown[] = [];
    await readChenEvents(
      stream([
        ": ping\r\n\r",
        '\ndata: {"sequence":1,\r',
        '\ndata: "type":"execution.updated","data":{}}\r\n\r',
        '\ndata: {"sequence":2,"type":"session.updated","data":{}}\n\n'
      ]),
      (event) => received.push(event)
    );
    expect(received).toEqual([
      { sequence: 1, type: "execution.updated", data: {} },
      { sequence: 2, type: "session.updated", data: {} }
    ]);
  });
  it("discards partial final frames so reconnect can resync HTTP state", async () => {
    const receive = vi.fn();
    await readChenEvents(stream(['data: {"sequence":1,"type":"execution.updated","data":{}}\n']), receive);
    expect(receive).not.toHaveBeenCalled();
  });
  it("supports CR-only event delimiters at end of stream", async () => {
    const receive = vi.fn();
    await readChenEvents(stream(['data: {"sequence":1,"type":"session.updated","data":{}}\r\r']), receive);
    expect(receive).toHaveBeenCalledOnce();
  });
  it("rejects malformed and unbounded events", async () => {
    await expect(readChenEvents(stream(['data: {"sequence":"bad","type":"x"}\n\n']), vi.fn())).rejects.toThrow(
      "Invalid Chen event"
    );
    await expect(readChenEvents(stream([`data: ${"x".repeat(1_048_577)}`]), vi.fn())).rejects.toThrow("size limit");
  });
});
describe("Go API and routing", () => {
  it("defaults supported protocols to Go and honors explicit legacy deployment overrides before auth", () => {
    expect(useGoChenProtocol("mysql")).toBe(true);
    expect(useGoChenProtocol("oceanbase-oracle")).toBe(true);
    expect(useGoChenProtocol("mongodb")).toBe(false);
    expect(useGoChenProtocol("mysql", "mysql,postgresql")).toBe(true);
    expect(useGoChenProtocol("postgres", "mysql,postgresql")).toBe(true);
    expect(useGoChenProtocol("mysql", "")).toBe(false);
    expect(useGoChenProtocol("oracle", "mysql,oracle")).toBe(true);
    expect(useGoChenProtocol("oracle", "mysql,postgresql")).toBe(false);
    expect(useGoChenProtocol("redis", "redis")).toBe(false);
  });
  it("keeps session credentials in headers and stable request IDs in mutation bodies", async () => {
    vi.stubGlobal("getWebApiMutationHeaders", () => ({ "X-CSRFToken": "csrf" }));
    const fetcher = vi.fn<typeof fetch>();
    fetcher.mockResolvedValueOnce(Response.json({ token: "session-secret", session: { id: "sid" } }));
    fetcher.mockResolvedValueOnce(Response.json({ id: "execution" }));
    const api = createChenGoApi("https://site.example", fetcher);
    await api.authenticate("one-use-token");
    await api.execute("console/one", "SELECT 1", 3, "stable-request-id");
    expect(fetcher.mock.calls[0]![0]).toBe("https://site.example/chen/api/v1/sessions");
    const authentication = JSON.parse(String(fetcher.mock.calls[0]![1]?.body));
    expect(authentication).toEqual({ connect_token: "one-use-token", request_id: expect.any(String) });
    expect(authentication.request_id.length).toBeGreaterThanOrEqual(16);
    expect(fetcher.mock.calls[0]![1]?.headers).toMatchObject({
      "X-CSRFToken": "csrf",
      "Idempotency-Key": expect.any(String)
    });
    expect(fetcher.mock.calls[1]![0]).toBe("https://site.example/chen/api/v1/consoles/console%2Fone/executions");
    expect(fetcher.mock.calls[1]![1]?.headers).toMatchObject({ token: "session-secret", "X-CSRFToken": "csrf" });
    expect(JSON.parse(String(fetcher.mock.calls[1]![1]?.body))).toEqual({
      sql: "SELECT 1",
      document_version: 3,
      request_id: "stable-request-id"
    });
  });
  it("keeps write plans and browsing on authenticated HTTP without sending preview SQL to apply", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ id: "x" }));
    const api = createChenGoApi("https://site.example", fetcher, { mode: "single" });
    await api.browse("c/1", "odd.schema", "items", "browse-key", true, true);
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toEqual({
      schema: "odd.schema",
      table: "items",
      request_id: "browse-key",
      submit_review: true,
      confirm_warnings: true
    });
    await api.editMetadata("c/1", "result/1", 200, 200);
    expect(fetcher.mock.calls[1]![0]).toContain("/consoles/c%2F1/results/result%2F1/edit?offset=200&limit=200");
    await api.previewEdits(
      "c/1",
      "result/1",
      [{ op: "insert", values: { 1: "9223372036854775807", 2: null, 3: "" } }],
      "csv"
    );
    expect(JSON.parse(String(fetcher.mock.calls[2]![1]?.body))).toEqual({
      changes: [{ op: "insert", values: { 1: "9223372036854775807", 2: null, 3: "" } }],
      source: "csv"
    });
    await api.applyEdits("c/1", "immutable-plan", "stable-apply-key", true, true);
    await api.applyEdits("c/1", "immutable-plan", "stable-apply-key", true, true);
    expect(fetcher.mock.calls[3]![0]).toContain("/edits/immutable-plan/apply");
    expect(JSON.parse(String(fetcher.mock.calls[3]![1]?.body))).toEqual({
      request_id: "stable-apply-key",
      submit_review: true,
      confirm_warnings: true
    });
    expect(fetcher.mock.calls[3]![1]?.body).toBe(fetcher.mock.calls[4]![1]?.body);
  });
  it("reports structured failures without retrying or exposing an HTML error page", async () => {
    vi.stubGlobal("getWebApiMutationHeaders", () => ({}));
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("<secret upstream html>", { status: 502 }));
    await expect(createChenGoApi("https://site.example", fetcher).authenticate("token")).rejects.toEqual(
      new ChenGoError("http_error", "Chen request failed (502)", 502)
    );
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("submits a review only on explicit request and preserves its idempotency payload", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ id: "review" }));
    const api = createChenGoApi("https://site.example", fetcher, { mode: "single" });
    await api.execute("one", "SELECT secret", 7, "review-request", true);
    await api.execute("one", "SELECT secret", 7, "review-request", true);
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toEqual({
      sql: "SELECT secret",
      document_version: 7,
      request_id: "review-request",
      submit_review: true
    });
    expect(fetcher.mock.calls[1]![1]?.body).toBe(fetcher.mock.calls[0]![1]?.body);
  });
  it("retains the same in-memory authentication nonce during an explicit retry", async () => {
    vi.stubGlobal("getWebApiMutationHeaders", () => ({}));
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 502 }))
      .mockResolvedValueOnce(Response.json({ token: "session-secret", session: { id: "sid" } }));
    const api = createChenGoApi("https://site.example", fetcher);
    await expect(api.authenticate("token")).rejects.toThrow();
    await api.authenticate("token");
    expect(fetcher.mock.calls[0]![1]?.body).toBe(fetcher.mock.calls[1]![1]?.body);
  });
  it("uses authenticated fetch for resumable SSE, with no token query parameter", async () => {
    vi.stubGlobal("getWebApiMutationHeaders", () => ({}));
    const fetcher = vi.fn<typeof fetch>();
    fetcher.mockResolvedValueOnce(Response.json({ token: "session-secret", session: { id: "sid" } }));
    fetcher.mockResolvedValueOnce(new Response(stream([]), { headers: { "Content-Type": "text/event-stream" } }));
    const api = createChenGoApi("https://site.example", fetcher);
    await api.authenticate("token");
    await api.events("sid", 42, new AbortController().signal);
    expect(fetcher.mock.calls[1]![0]).toBe("https://site.example/chen/api/v1/sessions/sid/events");
    expect(fetcher.mock.calls[1]![1]?.headers).toMatchObject({
      token: "session-secret",
      Accept: "text/event-stream",
      "Last-Event-ID": "42"
    });
  });
});
it("rejects stale, aborted and invalid-range completion replies including UTF16 offsets", () => {
  const result = { document_version: 4, from: 2, to: 4, items: [] };
  expect(completionIsCurrent(result, 4, 4, "😀us".length, false)).toBe(true);
  expect(completionIsCurrent(result, 4, 5, 4, false)).toBe(false);
  expect(completionIsCurrent(result, 3, 3, 4, false)).toBe(false);
  expect(completionIsCurrent(result, 4, 4, 4, true)).toBe(false);
  expect(completionIsCurrent({ ...result, to: 5 }, 4, 4, 4, false)).toBe(false);
});
it("keeps cancel_requested active until the database confirms a terminal outcome", () => {
  expect(executionActive({ status: "cancel_requested" } as never)).toBe(true);
  expect(executionActive({ status: "canceled" } as never)).toBe(false);
  expect(executionActive({ status: "unknown" } as never)).toBe(false);
});
it("honors an explicit driver cancellation limit and keeps older sessions compatible", () => {
  for (const status of ["queued", "running"] as const) {
    const execution = { status } as never;
    expect(executionCanCancel(execution)).toBe(true);
    expect(executionCanCancel(execution, true)).toBe(true);
    expect(executionCanCancel(execution, false)).toBe(false);
  }
  for (const status of ["cancel_requested", "succeeded", "failed", "canceled", "unknown"] as const)
    expect(executionCanCancel({ status } as never, true)).toBe(false);
  expect(executionCanCancel(null, true)).toBe(false);
});
it("does not regress terminal or audit states when an older HTTP response follows SSE", () => {
  const terminal = { id: "e", status: "canceled", audit_status: "recorded" } as never;
  const old = { id: "e", status: "cancel_requested", audit_status: "pending" } as never;
  expect(reconcileExecution(terminal, old)).toEqual(terminal);
});
it("keeps review active and cancelable even when the database driver cannot cancel SQL", () => {
  const waiting = { id: "e", status: "waiting_review", audit_status: "pending" } as never;
  expect(executionActive(waiting)).toBe(true);
  expect(executionCanCancel(waiting, false)).toBe(true);
  for (const status of ["running", "cancel_requested", "succeeded"] as const) {
    const newer = { id: "e", status, audit_status: "pending" } as never;
    expect(reconcileExecution(newer, waiting)).toBe(newer);
  }
});

it("sends explicit warning consent separately from review and preserves both flags", async () => {
  vi.stubGlobal("getWebApiMutationHeaders", () => ({}));
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: "execution" }));
  const api = createChenGoApi("https://site.example", fetcher);
  await api.execute("console", "SELECT 1", 7, "confirmed-request", true, true);
  expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toEqual({
    sql: "SELECT 1",
    document_version: 7,
    request_id: "confirmed-request",
    submit_review: true,
    confirm_warnings: true
  });
});
it("uses session-authenticated HTTP for SQL AI manifests and MCP messages", async () => {
  vi.stubGlobal("getWebApiMutationHeaders", () => ({}));
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ token: "session-token", session: { id: "sid" } }))
    .mockResolvedValueOnce(Response.json({ type: "mcp.manifest" }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  const api = createChenGoApi("https://site.example", fetcher);
  await api.authenticate("connection-token");
  expect(await api.aiManifest("session/id")).toEqual({ type: "mcp.manifest" });
  const frame = { type: "mcp.request", version: 1, resource_session_id: "sid", data: "{}" };
  await api.aiMessage("session/id", frame);
  expect(fetcher.mock.calls[1]![0]).toBe("https://site.example/chen/api/v1/sessions/session%2Fid/ai/manifest");
  expect(fetcher.mock.calls[2]![0]).toBe("https://site.example/chen/api/v1/sessions/session%2Fid/ai/messages");
  expect(fetcher.mock.calls[2]![1]?.headers).toMatchObject({ token: "session-token" });
  expect(JSON.parse(String(fetcher.mock.calls[2]![1]?.body))).toEqual(frame);
});

it("prepares EXPLAIN without executing the query", async () => {
  vi.stubGlobal("getWebApiMutationHeaders", () => ({}));
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ sql: "EXPLAIN SELECT 1" }));
  const api = createChenGoApi("https://site.example", fetcher);
  expect(await api.explain("console", "SELECT 1")).toEqual({ sql: "EXPLAIN SELECT 1" });
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0]![0]).toBe("https://site.example/chen/api/v1/consoles/console/explain");
});
it("binds export retries to SQL, format and explicit command consent", async () => {
  vi.stubGlobal("getWebApiMutationHeaders", () => ({}));
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ id: "export" }));
  const api = createChenGoApi("https://site.example", fetcher);
  await api.exportQuery("console/one", "SELECT original", 4, "stable-export", "xlsx", true, true);
  await api.exportQuery("console/one", "SELECT original", 4, "stable-export", "xlsx", true, true);
  expect(fetcher.mock.calls[0]![0]).toBe("https://site.example/chen/api/v1/consoles/console%2Fone/exports");
  expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toEqual({
    sql: "SELECT original",
    document_version: 4,
    request_id: "stable-export",
    format: "xlsx",
    submit_review: true,
    confirm_warnings: true
  });
  expect(fetcher.mock.calls[1]![1]?.body).toBe(fetcher.mock.calls[0]![1]?.body);
  await api.exportCached("result/id", "csv", "cached-stable");
  expect(fetcher.mock.calls[2]![0]).toBe("https://site.example/chen/api/v1/results/result%2Fid/exports");
  expect(JSON.parse(String(fetcher.mock.calls[2]![1]?.body))).toEqual({ format: "csv", request_id: "cached-stable" });
});
it("accepts only the fixed connector route for a body-bound download ticket", async () => {
  vi.stubGlobal("getWebApiMutationHeaders", () => ({}));
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({ method: "POST", download_url: "/chen/api/v1/downloads", fields: { ticket: "one-use" } })
    )
    .mockResolvedValueOnce(
      Response.json({ method: "POST", download_url: "https://evil.test/download", fields: { ticket: "one-use" } })
    );
  const api = createChenGoApi("https://site.example", fetcher);
  expect(await api.exportDownloadTicket("export/id")).toMatchObject({
    download_url: "https://site.example/chen/api/v1/downloads",
    fields: { ticket: "one-use" }
  });
  expect(fetcher.mock.calls[0]![0]).not.toContain("one-use");
  await expect(api.exportDownloadTicket("export/id")).rejects.toThrow("Invalid export download response");
});
it("keeps expensive DDL requests separate from metadata inspection", async () => {
  vi.stubGlobal("getWebApiMutationHeaders", () => ({}));
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ supported: true }));
  const api = createChenGoApi("https://site.example", fetcher);
  await api.catalogInspect("sid", "a.b", 'odd"table');
  expect(fetcher).toHaveBeenCalledOnce();
  const inspectUrl = new URL(String(fetcher.mock.calls[0]![0]));
  expect(inspectUrl.pathname).toBe("/chen/api/v1/sessions/sid/catalog/inspect");
  expect(inspectUrl.searchParams.get("schema")).toBe("a.b");
  expect(inspectUrl.searchParams.get("table")).toBe('odd"table');
  await api.catalogDdl("sid", "a.b", 'odd"table');
  expect(new URL(String(fetcher.mock.calls[1]![0])).pathname).toBe("/chen/api/v1/sessions/sid/catalog/ddl");
});
