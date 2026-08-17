import type { ChenQueryConsoleTab } from "~/chen/types";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChenQueryConsole } from "~/chen/composables/useChenQueryConsole";

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
});
