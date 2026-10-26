import type { ChenSqlEditorContext, ChenSqlProposal } from "~/chen/composables/useChenSqlAiSessions";

export interface GoSqlEditorSnapshot {
  documentSql: string;
  selectedSql: string;
  selectionFrom: number;
  selectionTo: number;
  revision: number;
}

export function prepareGoSqlProposal(proposal: ChenSqlProposal, context: ChenSqlEditorContext | null) {
  const sql = String(proposal.sql || "").trim();
  const base = proposal.base;
  if (
    !sql ||
    sql.length > 128 * 1024 ||
    !base ||
    !context ||
    base.paneId !== context.paneId ||
    base.nodeKey !== context.nodeKey ||
    base.tabId !== context.tabId ||
    base.workspaceTabId !== context.workspaceTabId ||
    base.workspaceTabKind !== context.workspaceTabKind ||
    base.currentContext !== context.currentContext ||
    base.revision !== context.revision ||
    base.database !== context.database ||
    base.schema !== context.schema
  )
    return null;
  if (base.target === "new_query") return { sql, target: base.target };
  if (base.target === "document")
    return context.documentSql === proposal.originalSql ? { sql, target: base.target } : null;
  const from = base.selectionFrom;
  const to = base.selectionTo;
  if (
    base.target !== "selection" ||
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to <= from ||
    to > context.documentSql.length ||
    context.documentSql.slice(from, to) !== proposal.originalSql
  )
    return null;
  return { sql: context.documentSql.slice(0, from) + sql + context.documentSql.slice(to), target: base.target };
}
