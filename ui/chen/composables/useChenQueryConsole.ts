import type {
  ChenPacket,
  ChenPromptConsoleTab,
  ChenQueryConsoleTab,
  ChenQueryLikeWorkspaceTab
} from "~/chen/types";

import { newChenWorkspaceId } from "~/chen/composables/useChenWorkspaceTabs";
import { emptyChenDataViewEditState } from "~/chen/utils/dataViewEditing";

const SQL_CHUNK_SIZE = 4096;

export function useChenQueryConsole(
  sendConsoleAction: (tab: ChenQueryLikeWorkspaceTab, type: string, data?: any) => void
) {
  function formatLogEntry(value: unknown) {
    if (typeof value === "string") return value;
    if (value == null) return "";
    if (typeof value === "object" && "message" in value && typeof value.message === "string") {
      return value.message;
    }

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
        data: data ?? null,
        state: {},
        editState: emptyChenDataViewEditState()
      };
      tab.resultTabs.push(resultTab);
    } else {
      resultTab.meta = { ...resultTab.meta, ...meta };
    }

    if (data !== undefined) {
      resultTab.data = data;
    }
    tab.activeResultTabId = resultTab.id;
  }

  function removeQueryResult(tab: ChenQueryLikeWorkspaceTab, title: string) {
    tab.resultTabs = tab.resultTabs.filter((item) => item.title !== title);
    if (!tab.resultTabs.some((item) => item.id === tab.activeResultTabId)) {
      tab.activeResultTabId = tab.resultTabs.at(-1)?.id || "";
    }
  }

  function removeQueryResults(tab: ChenQueryLikeWorkspaceTab, data: unknown) {
    if (typeof data === "string") {
      removeQueryResult(tab, data);
      return;
    }
    if (Array.isArray(data)) {
      data.forEach((title) => {
        if (typeof title === "string") removeQueryResult(tab, title);
      });
      return;
    }
    if (data && typeof data === "object" && "sql" in data && typeof data.sql === "string") {
      removeQueryResult(tab, data.sql);
    }
  }

  function closeQueryResult(tab: ChenQueryLikeWorkspaceTab, title: string) {
    removeQueryResult(tab, title);
    sendConsoleAction(tab, "close_data_view", title);
  }

  function dismissQueryMessage(tab: ChenQueryLikeWorkspaceTab) {
    tab.message = null;
  }

  function handleQueryConsolePacket(tab: ChenQueryLikeWorkspaceTab, packet: ChenPacket) {
    switch (packet.type) {
      case "init":
        tab.title = packet.data?.title || tab.title;
        break;
      case "log":
        appendLog(tab, packet.data);
        break;
      case "message":
        tab.message = typeof packet.data === "string"
          ? { type: "info", message: packet.data }
          : packet.data || null;
        if (tab.kind === "console") appendLog(tab, packet.data);
        break;
      case "update_state":
        if (packet.data?.title && packet.data.title !== tab.title) {
          const resultTab = tab.resultTabs.find((item) => item.title === packet.data.title);
          if (resultTab) resultTab.state = packet.data;
        } else {
          tab.state = packet.data || {};
        }
        break;
      case "new_data_view":
        if (packet.data?.title) updateQueryResult(tab, packet.data);
        break;
      case "update_data_view":
        if (packet.data?.title) updateQueryResult(tab, { title: packet.data.title }, packet.data.data);
        break;
      case "close_data_view":
        removeQueryResults(tab, packet.data);
        break;
    }
  }

  function runQueryTab(tab: ChenQueryConsoleTab, selectedSql = "") {
    if (tab.state.loading || tab.state.inQuery) return;
    const sql = selectedSql || tab.statement;
    if (!sql.trim()) return;
    dismissQueryMessage(tab);

    if (sql.length <= SQL_CHUNK_SIZE) {
      sendConsoleAction(tab, "query_console_action", { action: "run_sql", data: sql });
      return;
    }

    const total = Math.ceil(sql.length / SQL_CHUNK_SIZE);
    for (let index = 0; index < total; index += 1) {
      sendConsoleAction(tab, "query_console_action", {
        action: "run_sql_chunk",
        data: {
          chunk: sql.slice(index * SQL_CHUNK_SIZE, (index + 1) * SQL_CHUNK_SIZE),
          index,
          total
        }
      });
    }
    sendConsoleAction(tab, "query_console_action", {
      action: "run_sql_complete",
      data: { total }
    });
  }

  function runQueryFile(tab: ChenQueryConsoleTab, path: string) {
    if (tab.state.loading || tab.state.inQuery || !path.trim()) return;
    dismissQueryMessage(tab);
    sendConsoleAction(tab, "query_console_action", {
      action: "run_sql_file",
      data: path
    });
  }

  function changeQueryContext(tab: ChenQueryConsoleTab, context: string) {
    if (
      tab.state.loading
      || tab.state.inQuery
      || tab.state.editorLoading
      || !context.trim()
      || context === tab.state.currentContext
      || !tab.state.contexts?.includes(context)
    ) {
      return;
    }

    sendConsoleAction(tab, "query_console_action", {
      action: "change_current_context",
      data: context
    });
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
    if (tab.kind === "query" && !tab.state.canCancel) return;
    sendConsoleAction(tab, "query_console_action", { action: "cancel" });
  }

  return {
    appendLog,
    cancelQueryLikeTab,
    changeQueryContext,
    closeQueryResult,
    dismissQueryMessage,
    handleQueryConsolePacket,
    removeQueryResult,
    runConsoleTab,
    runQueryFile,
    runQueryTab,
    updateQueryResult
  };
}
