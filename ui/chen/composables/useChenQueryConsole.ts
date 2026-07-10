import type {
  ChenPacket,
  ChenPromptConsoleTab,
  ChenQueryConsoleTab,
  ChenQueryLikeWorkspaceTab
} from "~/chen/types";

import { newChenWorkspaceId } from "~/chen/composables/useChenWorkspaceTabs";

export function useChenQueryConsole(
  sendConsoleAction: (tab: ChenQueryLikeWorkspaceTab, type: string, data?: any) => void
) {
  function formatLogEntry(value: unknown) {
    if (typeof value === "string") return value;
    if (value == null) return "";

    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  function appendLog(tab: { logs: string[] }, line: unknown) {
    const content = formatLogEntry(line);
    if (!content) return;
    tab.logs.push(content);
    if (tab.logs.length > 400) {
      tab.logs.splice(0, tab.logs.length - 400);
    }
  }

  function updateQueryResult(tab: ChenQueryLikeWorkspaceTab, meta: { title: string, [key: string]: any }, data?: any) {
    let resultTab = tab.resultTabs.find((item) => item.title === meta.title);
    if (!resultTab) {
      resultTab = {
        id: newChenWorkspaceId("result"),
        title: meta.title,
        meta,
        data: data || null
      };
      tab.resultTabs.push(resultTab);
    } else if (data) {
      resultTab.data = data;
    }

    if (data) resultTab.data = data;
    tab.activeResultTabId = resultTab.id;
  }

  function removeQueryResult(tab: ChenQueryLikeWorkspaceTab, title: string) {
    tab.resultTabs = tab.resultTabs.filter((item) => item.title !== title);
    if (!tab.resultTabs.some((item) => item.id === tab.activeResultTabId)) {
      tab.activeResultTabId = tab.resultTabs[0]?.id || "";
    }
  }

  function handleQueryConsolePacket(tab: ChenQueryLikeWorkspaceTab, packet: ChenPacket) {
    switch (packet.type) {
      case "new_data_view":
        updateQueryResult(tab, packet.data);
        break;
      case "update_data_view":
        if (packet.data?.title) updateQueryResult(tab, { title: packet.data.title }, packet.data.data);
        break;
      case "close_data_view":
        if (typeof packet.data === "string") removeQueryResult(tab, packet.data);
        if (packet.data?.sql) removeQueryResult(tab, packet.data.sql);
        break;
    }
  }

  function runQueryTab(tab: ChenQueryConsoleTab) {
    const sql = tab.statement.trim();
    if (!sql) return;
    sendConsoleAction(tab, "query_console_action", { action: "run_sql", data: sql });
  }

  function runConsoleTab(tab: ChenPromptConsoleTab) {
    const sql = tab.pendingSql.trim();
    if (!sql) return;
    tab.historyEntries.push({
      id: newChenWorkspaceId("history"),
      sql
    });
    if (tab.historyEntries.length > 200) {
      tab.historyEntries.splice(0, tab.historyEntries.length - 200);
    }
    sendConsoleAction(tab, "query_console_action", { action: "run_sql", data: sql });
    tab.pendingSql = "";
  }

  function cancelQueryLikeTab(tab: ChenQueryLikeWorkspaceTab) {
    sendConsoleAction(tab, "query_console_action", { action: "cancel" });
  }

  return {
    appendLog,
    cancelQueryLikeTab,
    handleQueryConsolePacket,
    removeQueryResult,
    runConsoleTab,
    runQueryTab,
    updateQueryResult
  };
}
