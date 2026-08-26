import type { ChenQueryConsoleTab } from "~/chen/types";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { chenQueryResultLabel, useChenQueryConsole } from "~/chen/composables/useChenQueryConsole";

function queryTab(): ChenQueryConsoleTab {
  return {
    id: "query-1",
    title: "New Query",
    kind: "query",
    nodeKey: "database-1",
    statement: "UPDATE users SET active = false",
    aiRevision: 0,
    lastSqlError: null,
    uploadingSql: false,
    state: {},
    logs: [],
    message: null,
    resultTabs: [],
    activeResultTabId: "",
    socket: null
  };
}

describe("chen query console mutation results", () => {
  const sendConsoleAction = vi.fn(() => true);

  beforeEach(() => sendConsoleAction.mockClear());

  it("turns an affected-rows success log into a query result", () => {
    const tab = queryTab();
    const queryConsole = useChenQueryConsole(sendConsoleAction);

    queryConsole.runQueryTab(tab);
    queryConsole.handleQueryConsolePacket(tab, {
      type: "log",
      data: { level: 2, message: "execute sql: UPDATE users SET active = false" }
    });
    queryConsole.handleQueryConsolePacket(tab, {
      type: "log",
      data: { level: 3, message: "12 rows affected in 8 ms" }
    });

    expect(tab.resultTabs).toHaveLength(1);
    expect(tab.resultTabs[0]).toMatchObject({
      title: "UPDATE users SET active = false",
      affectedRows: 12,
      state: { durationMs: 8 },
      meta: { synthetic: true }
    });
    expect(tab.activeResultTabId).toBe(tab.resultTabs[0]?.id);
  });

  it("keeps a separate result for each mutation in a multi-statement execution", () => {
    const tab = queryTab();
    const queryConsole = useChenQueryConsole(sendConsoleAction);
    queryConsole.runQueryTab(tab);

    for (const [sql, count] of [
      ["UPDATE users SET active = false", 12],
      ["DELETE FROM sessions WHERE expired = true", 4]
    ] as const) {
      queryConsole.handleQueryConsolePacket(tab, { type: "log", data: { level: 2, message: `execute sql: ${sql}` } });
      queryConsole.handleQueryConsolePacket(tab, {
        type: "log",
        data: { level: 3, message: `${count} rows affected in 8 ms` }
      });
    }

    expect(tab.resultTabs.map(({ title, affectedRows }) => ({ title, affectedRows }))).toEqual([
      { title: "UPDATE users SET active = false", affectedRows: 12 },
      { title: "DELETE FROM sessions WHERE expired = true", affectedRows: 4 }
    ]);
  });

  it("closes a local mutation result without sending a server data-view action", () => {
    const tab = queryTab();
    const queryConsole = useChenQueryConsole(sendConsoleAction);
    queryConsole.runQueryTab(tab);
    queryConsole.handleQueryConsolePacket(tab, {
      type: "log",
      data: { level: 3, message: "1 row affected in 2 ms" }
    });
    sendConsoleAction.mockClear();

    queryConsole.closeQueryResult(tab, tab.resultTabs[0]?.id || "");

    expect(tab.resultTabs).toEqual([]);
    expect(sendConsoleAction).not.toHaveBeenCalled();
  });

  it("keeps pinned results when the server closes previous results", () => {
    const tab = queryTab();
    const queryConsole = useChenQueryConsole(sendConsoleAction);
    queryConsole.handleQueryConsolePacket(tab, {
      type: "new_data_view",
      data: { id: "result-1", title: "select 1", data: { fields: [], data: [] } }
    });
    queryConsole.handleQueryConsolePacket(tab, {
      type: "new_data_view",
      data: { id: "result-2", title: "select 2", data: { fields: [], data: [] } }
    });
    const pinned = tab.resultTabs.find((result) => result.id === "result-1");
    if (!pinned) throw new Error("expected result-1");
    pinned.state.pinned = true;

    queryConsole.handleQueryConsolePacket(tab, { type: "close_data_view", data: ["result-1", "result-2"] });

    expect(tab.resultTabs.map(({ id }) => id)).toEqual(["result-1"]);
  });

  it("forwards query logs to the session log console", () => {
    const tab = queryTab();
    const onLog = vi.fn();
    const queryConsole = useChenQueryConsole(sendConsoleAction, { onLog });
    const line = { level: 0, message: "Query failed" };

    queryConsole.handleQueryConsolePacket(tab, { type: "log", data: line });

    expect(onLog).toHaveBeenCalledWith(tab, line, "Query failed");
  });
});

describe("chen query result labels", () => {
  function result(overrides: Partial<ChenQueryConsoleTab["resultTabs"][number]> = {}) {
    return {
      id: "result-1",
      title: "select * from users",
      meta: { title: "select * from users" },
      data: { fields: [], data: [] },
      state: {},
      editState: {} as ChenQueryConsoleTab["resultTabs"][number]["editState"],
      ...overrides
    };
  }

  it("uses explicit table metadata before field source metadata", () => {
    expect(
      chenQueryResultLabel(
        result({
          meta: { title: "select * from users", table: "users" },
          data: { fields: [{ name: "id", sourceTable: "accounts" }], data: [] }
        }),
        0
      )
    ).toBe("users");
  });

  it("uses the returned field source table", () => {
    expect(
      chenQueryResultLabel(
        result({
          data: {
            fields: [
              { name: "id", sourceTable: "users" },
              { name: "name", table: "users" }
            ],
            data: []
          }
        }),
        0
      )
    ).toBe("users");
  });

  it("summarizes joins and falls back to a numbered result", () => {
    expect(
      chenQueryResultLabel(
        result({
          data: {
            fields: [
              { name: "id", sourceTable: "users" },
              { name: "role", sourceTable: "roles" }
            ],
            data: []
          }
        }),
        0
      )
    ).toBe("users +1");
    expect(chenQueryResultLabel(result(), 2)).toBe("Result 3");
  });
});
