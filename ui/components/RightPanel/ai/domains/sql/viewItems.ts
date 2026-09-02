import type { SqlThoughtItem } from "../../types";
import type { AiViewItemBuilderFactory } from "../viewItems";
import type { ChenSqlAiTiming, ChenSqlProposal } from "~/chen/composables/useChenSqlAiSessions";

const sqlPartTypes = new Set([
  "data-thought-summary",
  "data-sql-analysis",
  "data-sql-proposal",
  "data-agent-timing",
  "data-schema-result"
]);

export const createSqlViewItemBuilder: AiViewItemBuilderFactory = () => {
  const thoughts = new Map<string, SqlThoughtItem>();

  return {
    domain: "sql",
    supports: (partType) => sqlPartTypes.has(partType),
    append(context, input) {
      const { data, message, partIndex, partType } = input;
      if (partType === "data-thought-summary") {
        const summary = String(data.text || "").trim();
        if (!summary) return;
        const key = `${message.id}-sql-thought`;
        let thought = thoughts.get(key);
        if (!thought) {
          thought = { domain: "sql", kind: "sql-thought", key, summaries: [] };
          thoughts.set(key, thought);
          context.items.push(thought);
        }
        if (!thought.summaries.includes(summary)) thought.summaries.push(summary);
        return;
      }
      if (partType === "data-sql-analysis") {
        context.items.push({
          domain: "sql",
          kind: "sql-analysis",
          key: `${message.id}-sql-analysis-${partIndex}`,
          data
        });
        return;
      }
      if (partType === "data-sql-proposal") {
        context.items.push({
          domain: "sql",
          kind: "sql-proposal",
          key: `${message.id}-sql-proposal-${partIndex}`,
          toolCallId: String(data.toolCallId || ""),
          data: data as ChenSqlProposal
        });
        return;
      }
      if (partType === "data-agent-timing") {
        context.items.push({
          domain: "sql",
          kind: "sql-timing",
          key: `${message.id}-sql-timing-${partIndex}`,
          data: data as ChenSqlAiTiming
        });
        return;
      }
      context.items.push({
        domain: "sql",
        kind: "schema-result",
        key: `${message.id}-schema-result-${partIndex}`,
        data
      });
    }
  };
};
