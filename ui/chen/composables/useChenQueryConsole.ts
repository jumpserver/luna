import type {
  ChenConsoleTimelineEntry,
  ChenCreateTableWorkspaceTab,
  ChenPacket,
  ChenPromptConsoleTab,
  ChenQueryConsoleTab,
  ChenQueryLikeWorkspaceTab,
  ChenQueryResultTab,
  ChenTableStructureWorkspaceTab,
  ChenWorkspaceTab
} from "~/chen/types";

import { mergeChenDataViewTiming, startChenDataViewTiming } from "~/chen/composables/useChenDataView";
import { newChenWorkspaceId } from "~/chen/composables/useChenWorkspaceTabs";
import {
  acceptChenDataViewResponse,
  createChenDataViewEditState,
  finishChenDataViewRequestWithoutData
} from "~/chen/utils/dataViewEditing";

const SQL_CHUNK_SIZE = 4096;
const MAX_CONSOLE_TIMELINE_ENTRIES = 200;

export function chenQueryResultLabel(result: ChenQueryResultTab, index: number) {
  const metaTable = typeof result.meta.table === "string" ? result.meta.table.trim() : "";
  if (metaTable) return metaTable;

  const sourceTables = new Set<string>();
  for (const field of result.data?.fields || []) {
    const table = String(field.sourceTable || field.table || "").trim();
    if (table) sourceTables.add(table);
  }

  if (sourceTables.size === 1) return [...sourceTables][0];
  if (sourceTables.size > 1) {
    const [first] = sourceTables;
    return `${first} +${sourceTables.size - 1}`;
  }
  return `Result ${index + 1}`;
}

export function useChenQueryConsole(
  sendConsoleAction: (
    tab: ChenQueryLikeWorkspaceTab | ChenCreateTableWorkspaceTab | ChenTableStructureWorkspaceTab,
    type: string,
    data?: any
  ) => boolean | void,
  options: {
    onLog?: (tab: ChenWorkspaceTab, line: unknown, content: string) => void;
  } = {}
) {
  const queryExecutions = new WeakMap<
    ChenQueryConsoleTab,
    { submittedSql: string; currentSql: string; statementResultsStarted: boolean }
  >();

  function activeConsoleEntry(tab: ChenPromptConsoleTab) {
    return tab.timelineEntries.find((entry) => entry.id === tab.activeTimelineEntryId) || null;
  }

  function appendConsoleStatus(tab: ChenPromptConsoleTab, content: string, level?: number) {
    const entry = activeConsoleEntry(tab);
    if (!entry) return;

    if (/^execute(?: raw)? sql\s*:/i.test(content)) return;
    if (/^cancel query\s*:/i.test(content)) {
      if (!entry.logs.includes("Query cancelled.")) entry.logs.push("Query cancelled.");
      entry.status = "cancelled";
      return;
    }
    if (!entry.logs.includes(content)) entry.logs.push(content);
    if (level === 0) entry.status = "error";
  }

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

  function appendLog(tab: ChenWorkspaceTab, line: unknown) {
    const content = formatLogEntry(line);
    if (!content) return;
    tab.logs.push(content);
    if (tab.logs.length > 400) {
      tab.logs.splice(0, tab.logs.length - 400);
    }
    options.onLog?.(tab, line, content);
    if (tab.kind === "console") {
      const level = line && typeof line === "object" && "level" in line ? Number(line.level) : undefined;
      appendConsoleStatus(tab, content, level);
    } else if (tab.kind === "query") {
      handleQueryExecutionLog(tab, line, content);
    }
  }

  function handleQueryExecutionLog(tab: ChenQueryConsoleTab, line: unknown, content: string) {
    const execution = queryExecutions.get(tab) || {
      submittedSql: tab.statement,
      currentSql: "",
      statementResultsStarted: false
    };
    queryExecutions.set(tab, execution);

    const executionPrefix = content.match(/^execute sql\s*:/i)?.[0];
    const executedSql = executionPrefix ? content.slice(executionPrefix.length).trim() : "";
    if (executedSql) {
      execution.currentSql = executedSql;
      return;
    }

    const level = line && typeof line === "object" && "level" in line ? Number(line.level) : undefined;
    const affected = content.match(/^(-?\d+)\s+rows?\s+affected\s+in\s+(\d+)\s+ms$/i);
    if (level !== 3 || !affected) return;

    if (!execution.statementResultsStarted) {
      tab.resultTabs = tab.resultTabs.filter((result) => result.state.pinned);
      execution.statementResultsStarted = true;
    }

    const title = execution.currentSql || execution.submittedSql || "Statement result";
    const id = newChenWorkspaceId("result");
    tab.resultTabs.push({
      id,
      title,
      meta: { id, title, synthetic: true },
      data: { fields: [], data: [] },
      state: { durationMs: Number(affected[2]) },
      editState: createChenDataViewEditState(),
      affectedRows: Number(affected[1])
    });
    tab.activeResultTabId = id;
    execution.currentSql = "";
  }

  function failConsoleExecution(tab: ChenWorkspaceTab, message: string) {
    appendLog(tab, { level: 0, message });
    if (tab.kind !== "console") return;
    const entry = activeConsoleEntry(tab);
    if (!entry) return;
    entry.status = "error";
    entry.completedAt = Date.now();
    tab.activeTimelineEntryId = "";
  }

  function updateQueryResult(tab: ChenQueryConsoleTab, meta: { title: string; [key: string]: any }, data?: any) {
    let resultTab = meta.id
      ? tab.resultTabs.find((item) => item.id === meta.id)
      : tab.resultTabs.find((item) => item.title === meta.title);
    if (!resultTab) {
      resultTab = {
        id: meta.id || newChenWorkspaceId("result"),
        title: meta.title,
        meta,
        data: data ?? null,
        state: Number.isFinite(Number(tab.state.requestStartedAt))
          ? { requestStartedAt: Number(tab.state.requestStartedAt) }
          : Number.isFinite(Number(tab.state.durationMs))
            ? { durationMs: Number(tab.state.durationMs) }
            : {},
        editState: createChenDataViewEditState()
      };
      tab.resultTabs.push(resultTab);
    } else {
      resultTab.meta = { ...resultTab.meta, ...meta };
    }

    if (data !== undefined && acceptChenDataViewResponse(resultTab.editState)) {
      resultTab.data = data;
    }
    tab.activeResultTabId = resultTab.id;
  }

  function removeQueryResult(tab: ChenQueryConsoleTab, reference: string, preservePinned = false) {
    tab.resultTabs = tab.resultTabs.filter(
      (item) => (preservePinned && item.state.pinned === true) || (item.id !== reference && item.title !== reference)
    );
    if (!tab.resultTabs.some((item) => item.id === tab.activeResultTabId)) {
      tab.activeResultTabId = tab.resultTabs.at(-1)?.id || "";
    }
  }

  function removeQueryResults(tab: ChenQueryConsoleTab, data: unknown) {
    if (typeof data === "string") {
      removeQueryResult(tab, data, true);
      return;
    }
    if (Array.isArray(data)) {
      data.forEach((reference) => {
        if (typeof reference === "string") removeQueryResult(tab, reference, true);
      });
      return;
    }
    if (data && typeof data === "object" && "sql" in data && typeof data.sql === "string") {
      removeQueryResult(tab, data.sql, true);
    }
  }

  function closeQueryResult(tab: ChenQueryConsoleTab, reference: string) {
    const result = tab.resultTabs.find((item) => item.id === reference || item.title === reference);
    removeQueryResult(tab, reference);
    if (result?.meta.synthetic === true) return;
    sendConsoleAction(tab, "close_data_view", reference);
  }

  function dismissQueryMessage(tab: ChenQueryLikeWorkspaceTab) {
    tab.message = null;
  }

  function handleQueryConsolePacket(tab: ChenQueryLikeWorkspaceTab, packet: ChenPacket) {
    switch (packet.type) {
      case "init":
        tab.title = packet.data?.title || tab.title;
        tab.serverConsoleId = String(packet.data?.consoleId || "");
        break;
      case "log":
        appendLog(tab, packet.data);
        break;
      case "message":
        tab.message = typeof packet.data === "string" ? { type: "info", message: packet.data } : packet.data || null;
        if (tab.kind !== "console") appendLog(tab, packet.data);
        break;
      case "sql_error":
        if ((tab.kind === "query" || tab.kind === "console") && packet.data && typeof packet.data === "object") {
          const message = String(packet.data.message || "SQL execution failed");
          tab.lastSqlError = {
            ...packet.data,
            message
          };
          if (tab.kind === "console") {
            const entry = activeConsoleEntry(tab);
            if (entry) entry.status = "error";
          } else {
            appendLog(tab, { ...packet.data, level: 0, message });
          }
        }
        break;
      case "update_state": {
        const resultTab =
          tab.kind === "query"
            ? packet.data?.id
              ? tab.resultTabs.find((item) => item.id === packet.data.id)
              : packet.data?.title && packet.data.title !== tab.title
                ? tab.resultTabs.find((item) => item.title === packet.data.title)
                : null
            : null;
        if (resultTab) {
          resultTab.state = mergeChenDataViewTiming(resultTab.state, packet.data);
          if (packet.data?.loading === false) finishChenDataViewRequestWithoutData(resultTab.editState);
        } else {
          tab.state = mergeChenDataViewTiming(tab.state, packet.data || {});
          if (tab.kind === "query" && packet.data?.loading === false && Number.isFinite(Number(tab.state.durationMs))) {
            for (const result of tab.resultTabs) {
              if (Number.isFinite(Number(result.state.durationMs))) continue;
              result.state = { ...result.state, durationMs: Number(tab.state.durationMs) };
              delete result.state.requestStartedAt;
            }
          }
          if (tab.kind === "console" && packet.data?.inQuery === false) {
            const entry = activeConsoleEntry(tab);
            if (entry) {
              const executionStatus = packet.data.executionStatus;
              if (entry.status === "cancelling" || executionStatus === "cancelled") entry.status = "cancelled";
              else if (executionStatus === "error") entry.status = "error";
              else if (entry.status === "running") entry.status = "success";
              entry.completedAt = Date.now();
              tab.activeTimelineEntryId = "";
            }
          }
        }
        break;
      }
      case "new_data_view":
        if (tab.kind === "query" && packet.data?.title) updateQueryResult(tab, packet.data);
        break;
      case "update_data_view":
        if (tab.kind === "query" && packet.data?.title) {
          updateQueryResult(tab, { id: packet.data.id, title: packet.data.title }, packet.data.data);
        }
        break;
      case "close_data_view":
        if (tab.kind === "query") removeQueryResults(tab, packet.data);
        break;
      case "console_result":
        if (tab.kind === "console" && packet.data?.data) {
          let entry = activeConsoleEntry(tab);
          if (!entry) {
            entry = {
              id: newChenWorkspaceId("execution"),
              sql: packet.data.title || "Query",
              status: "running",
              startedAt: Date.now(),
              logs: [],
              results: []
            };
            tab.timelineEntries.push(entry);
            tab.activeTimelineEntryId = entry.id;
          }
          const resultId = packet.data.id || newChenWorkspaceId("result");
          const existingResult = entry.results.find((result) => result.id === resultId);
          if (existingResult) {
            existingResult.data = packet.data.data;
            existingResult.state = { ...existingResult.state, ...packet.data.state };
          } else {
            entry.results.push({
              id: resultId,
              data: packet.data.data,
              state: packet.data.state || {}
            });
          }
        }
        break;
    }
  }

  function sendSql(
    tab: ChenQueryLikeWorkspaceTab | ChenCreateTableWorkspaceTab | ChenTableStructureWorkspaceTab,
    sql: string
  ) {
    if (sql.length <= SQL_CHUNK_SIZE) {
      return sendConsoleAction(tab, "query_console_action", { action: "run_sql", data: sql }) !== false;
    }

    const total = Math.ceil(sql.length / SQL_CHUNK_SIZE);
    for (let index = 0; index < total; index += 1) {
      if (
        sendConsoleAction(tab, "query_console_action", {
          action: "run_sql_chunk",
          data: {
            chunk: sql.slice(index * SQL_CHUNK_SIZE, (index + 1) * SQL_CHUNK_SIZE),
            index,
            total
          }
        }) === false
      ) {
        return false;
      }
    }
    return (
      sendConsoleAction(tab, "query_console_action", {
        action: "run_sql_complete",
        data: { total }
      }) !== false
    );
  }

  function runQueryTab(tab: ChenQueryConsoleTab, selectedSql = "") {
    if (tab.state.loading || tab.state.inQuery) return;
    const sql = selectedSql || tab.statement;
    if (!sql.trim()) return;
    dismissQueryMessage(tab);
    tab.lastSqlError = null;
    startChenDataViewTiming(tab.state);
    queryExecutions.set(tab, { submittedSql: sql, currentSql: "", statementResultsStarted: false });

    sendSql(tab, sql);
  }

  function runQueryFile(tab: ChenQueryConsoleTab, path: string) {
    if (tab.state.loading || tab.state.inQuery || !path.trim()) return;
    dismissQueryMessage(tab);
    queryExecutions.set(tab, { submittedSql: "", currentSql: "", statementResultsStarted: false });
    sendConsoleAction(tab, "query_console_action", {
      action: "run_sql_file",
      data: path
    });
  }

  function changeQueryContext(tab: ChenQueryConsoleTab, context: string) {
    if (
      tab.state.loading ||
      tab.state.inQuery ||
      tab.state.editorLoading ||
      !context.trim() ||
      context === tab.state.currentContext ||
      !tab.state.contexts?.includes(context)
    ) {
      return;
    }

    sendConsoleAction(tab, "query_console_action", {
      action: "change_current_context",
      data: context
    });
  }

  function runConsoleTab(tab: ChenPromptConsoleTab) {
    if (activeConsoleEntry(tab)) return;
    const sql = tab.pendingSql.trim();
    if (!sql) return;
    tab.lastSqlError = null;
    tab.historyEntries.push({
      id: newChenWorkspaceId("history"),
      sql
    });
    if (tab.historyEntries.length > 200) {
      tab.historyEntries.splice(0, tab.historyEntries.length - 200);
    }
    const entry: ChenConsoleTimelineEntry = {
      id: newChenWorkspaceId("execution"),
      sql,
      status: "running",
      startedAt: Date.now(),
      logs: [],
      results: []
    };
    tab.timelineEntries.push(entry);
    if (tab.timelineEntries.length > MAX_CONSOLE_TIMELINE_ENTRIES) {
      tab.timelineEntries.splice(0, tab.timelineEntries.length - MAX_CONSOLE_TIMELINE_ENTRIES);
    }
    tab.activeTimelineEntryId = entry.id;
    if (!sendSql(tab, sql)) {
      entry.status = "error";
      entry.completedAt = Date.now();
      const message = tab.connectionError || "Console websocket is not connected";
      if (!entry.logs.includes(message)) entry.logs.push(message);
      tab.activeTimelineEntryId = "";
    }
    tab.pendingSql = "";
  }

  function clearConsoleTranscript(tab: ChenPromptConsoleTab) {
    if (activeConsoleEntry(tab)) return;
    tab.timelineEntries = [];
  }

  function cancelQueryLikeTab(tab: ChenQueryLikeWorkspaceTab) {
    if (tab.kind === "query" && !tab.state.canCancel) return;
    if (tab.kind === "console") {
      const entry = activeConsoleEntry(tab);
      if (!entry) return;
      entry.status = "cancelling";
    }
    sendConsoleAction(tab, "query_console_action", { action: "cancel" });
  }

  return {
    appendLog,
    cancelQueryLikeTab,
    changeQueryContext,
    clearConsoleTranscript,
    closeQueryResult,
    dismissQueryMessage,
    failConsoleExecution,
    handleQueryConsolePacket,
    removeQueryResult,
    runConsoleTab,
    runQueryFile,
    runQueryTab,
    sendSql,
    updateQueryResult
  };
}
