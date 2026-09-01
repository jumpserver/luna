import type { TerminalAiEventData } from "#koko/composables/terminal/useTerminalAiSessions";
import type { AiViewItemBuildOptions } from "./domains/viewItems";
import type { AgentToolItem, AgentToolStatus, AiTimelineDomain, ViewItem } from "./types";
import { createAiViewItemBuilders } from "./domains/registry";

const agentToolStatuses = new Set<AgentToolStatus>(["running", "success", "error", "cancelled"]);
const agentToolDomains = new Set<Exclude<AiTimelineDomain, "shared">>(["terminal", "sql", "file", "script"]);

function agentToolStatus(value: unknown): AgentToolStatus {
  const status = String(value || "running") as AgentToolStatus;
  return agentToolStatuses.has(status) ? status : "error";
}

function agentToolDomain(value: unknown): Exclude<AiTimelineDomain, "shared"> | null {
  const domain = String(value || "") as Exclude<AiTimelineDomain, "shared">;
  return agentToolDomains.has(domain) ? domain : null;
}

export function buildAiPanelViewItems(options: AiViewItemBuildOptions): ViewItem[] {
  const items: ViewItem[] = [];
  const context = { items, options };
  const builders = createAiViewItemBuilders();
  const agentTools = new Map<string, AgentToolItem>();

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

      if (part.type === "data-agent-tool" && "data" in part) {
        const data = part.data as TerminalAiEventData;
        const sourceDomain = agentToolDomain(data.domain || message.metadata?.domain);
        const id = String(data.toolCallId || data.id || "");
        if (!sourceDomain || !id) return;
        const mapKey = `${sourceDomain}:${id}`;
        const existing = agentTools.get(mapKey);
        if (existing) {
          existing.data = {
            ...existing.data,
            id,
            toolCallId: id,
            sourceDomain,
            toolName: String(data.toolName || existing.data.toolName || ""),
            status: agentToolStatus(data.status || existing.data.status),
            ...(Number.isFinite(Number(data.durationMs)) ? { durationMs: Number(data.durationMs) } : {})
          };
          return;
        }
        const item: AgentToolItem = {
          domain: "shared",
          kind: "agent-tool",
          key: `${mapKey}-agent-tool`,
          data: {
            id,
            toolCallId: id,
            sourceDomain,
            toolName: String(data.toolName || ""),
            status: agentToolStatus(data.status),
            ...(Number.isFinite(Number(data.durationMs)) ? { durationMs: Number(data.durationMs) } : {})
          }
        };
        agentTools.set(mapKey, item);
        items.push(item);
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
    items.push({
      domain: "sql",
      kind: "metadata-approval",
      key: `metadata-approval-${approval.approvalId}`,
      approval,
      terminal: options.terminalMetadataApproval
    });
  }

  return items;
}
