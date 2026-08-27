import type {
  FileActionItem,
  FileAiEventData,
  FileApprovalItem,
  FileDiffItem,
  FilePlanItem,
  FileProgressItem,
  FileResultItem
} from "../../types";
import type { AiViewItemBuilderFactory } from "../viewItems";

const filePartTypes = new Set([
  "data-capability",
  "data-directory-analysis",
  "data-plan",
  "data-progress",
  "data-file-action",
  "data-file-diff",
  "data-file-approval",
  "data-file-result"
]);
const fileSpecificPartTypes = new Set([
  "data-directory-analysis",
  "data-file-action",
  "data-file-diff",
  "data-file-approval",
  "data-file-result"
]);

function isFileMessage(message: { metadata?: unknown }) {
  const metadata = message.metadata;
  return Boolean(metadata && typeof metadata === "object" && "domain" in metadata && metadata.domain === "file");
}

function mergeItem<T extends { data: FileAiEventData }>(item: T, data: FileAiEventData) {
  item.data = { ...item.data, ...data };
}

export const createFileViewItemBuilder: AiViewItemBuilderFactory = () => {
  const plans = new Map<string, FilePlanItem>();
  const progressItems = new Map<string, FileProgressItem>();
  const actions = new Map<string, FileActionItem>();
  const diffs = new Map<string, FileDiffItem>();
  const approvals = new Map<string, FileApprovalItem>();
  const results = new Map<string, FileResultItem>();

  return {
    domain: "file",
    supports: (partType, message) =>
      filePartTypes.has(partType) && (fileSpecificPartTypes.has(partType) || isFileMessage(message)),
    append(context, input) {
      const { message, partIndex, partType } = input;
      const data = input.data as FileAiEventData;
      const fallbackKey = `${message.id}-${partIndex}`;

      if (partType === "data-capability" || partType === "data-directory-analysis") {
        context.items.push({
          domain: "file",
          kind: "file-analysis",
          key: `${fallbackKey}-file-analysis`,
          data
        });
        return;
      }

      if (partType === "data-plan") {
        const id = String(data.id || data.planId || fallbackKey);
        const existing = plans.get(id);
        if (existing) {
          mergeItem(existing, data);
          return;
        }
        const item: FilePlanItem = {
          domain: "file",
          kind: "file-plan",
          key: `${id}-file-plan`,
          data
        };
        plans.set(id, item);
        context.items.push(item);
        return;
      }

      if (partType === "data-progress") {
        const id = String(data.planId || message.id);
        const existing = progressItems.get(id);
        if (existing) {
          mergeItem(existing, data);
          return;
        }
        const item: FileProgressItem = {
          domain: "file",
          kind: "file-progress",
          key: `${id}-file-progress`,
          data
        };
        progressItems.set(id, item);
        context.items.push(item);
        return;
      }

      if (partType === "data-file-action") {
        const id = String(data.actionId || data.id || fallbackKey);
        const result = results.get(id);
        if (result) {
          result.data = { ...data, ...result.data };
          return;
        }
        const existing = actions.get(id);
        if (existing) {
          mergeItem(existing, data);
          return;
        }
        const item: FileActionItem = {
          domain: "file",
          kind: "file-action",
          key: `${id}-file-action`,
          data
        };
        actions.set(id, item);
        context.items.push(item);
        return;
      }

      if (partType === "data-file-diff") {
        const id = String(data.actionId || data.id || fallbackKey);
        const existing = diffs.get(id);
        if (existing) {
          mergeItem(existing, data);
          return;
        }
        const item: FileDiffItem = {
          domain: "file",
          kind: "file-diff",
          key: `${id}-file-diff`,
          data
        };
        diffs.set(id, item);
        context.items.push(item);
        return;
      }

      if (partType === "data-file-approval") {
        const id = String(data.approvalId || data.id || fallbackKey);
        const existing = approvals.get(id);
        if (existing) {
          mergeItem(existing, data);
          return;
        }
        const item: FileApprovalItem = {
          domain: "file",
          kind: "file-approval",
          key: `${id}-file-approval`,
          data
        };
        approvals.set(id, item);
        context.items.push(item);
        return;
      }

      const id = String(data.actionId || data.id || fallbackKey);
      const resultData = data;
      const action = actions.get(id);
      const mergedResultData = action ? { ...action.data, ...resultData } : resultData;
      const existing = results.get(id);
      if (existing) {
        if (resultData.outcome === "success") {
          existing.data.error = undefined;
          existing.data.message = undefined;
        }
        mergeItem(existing, mergedResultData);
        return;
      }
      const item: FileResultItem = {
        domain: "file",
        kind: "file-result",
        key: `${id}-file-result`,
        data: mergedResultData
      };
      if (action) {
        const actionIndex = context.items.indexOf(action);
        if (actionIndex >= 0) context.items.splice(actionIndex, 1);
        actions.delete(id);
      }
      results.set(id, item);
      context.items.push(item);
    }
  };
};
