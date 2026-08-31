import type { TerminalAiEventData } from "#koko/composables/terminal/useTerminalAiSessions";
import type { AiViewItemBuildOptions } from "./domains/viewItems";
import type { ViewItem } from "./types";
import { createAiViewItemBuilders } from "./domains/registry";

export function buildAiPanelViewItems(options: AiViewItemBuildOptions): ViewItem[] {
  const items: ViewItem[] = [];
  const context = { items, options };
  const builders = createAiViewItemBuilders();

  for (const message of options.messages) {
    message.parts.forEach((part, partIndex) => {
      if (part.type === "text") {
        items.push({
          domain: "shared",
          kind: "text",
          key: `${message.id}-text-${partIndex}`,
          role: message.role,
          text: part.text || "",
          ...(Number.isFinite(Number(message.metadata?.modelDurationMs))
            ? { modelDurationMs: Number(message.metadata?.modelDurationMs) }
            : {})
        });
        return;
      }

      const builder = builders.find(({ supports }) => supports(part.type, message));
      if (!builder) return;
      builder.append(context, {
        message,
        partIndex,
        partType: part.type,
        data: "data" in part ? (part.data as TerminalAiEventData) : {}
      });
    });
  }

  const approval = options.metadataApproval;
  if (approval) {
    const anchorIndex = items.findLastIndex((item) => item.kind === "text" && item.role === "user");
    const insertAt = anchorIndex >= 0 ? anchorIndex + 1 : items.length;
    items.splice(insertAt, 0, {
      domain: "sql",
      kind: "metadata-approval",
      key: `metadata-approval-${approval.approvalId}`,
      approval,
      terminal: options.terminalMetadataApproval
    });
  }

  return items;
}
