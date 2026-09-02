import type { AiViewItemBuilderFactory } from "../viewItems";

function isScriptMessage(message: { metadata?: unknown }) {
  const metadata = message.metadata;
  return Boolean(metadata && typeof metadata === "object" && "domain" in metadata && metadata.domain === "script");
}

export const createScriptViewItemBuilder: AiViewItemBuilderFactory = () => ({
  domain: "script",
  supports: (partType, message) => partType === "data-progress" && isScriptMessage(message),
  append(context, input) {
    const toolName = String(input.data.tool_name || input.data.name || "");
    const toolCallId = String(input.data.toolCallId || input.data.tool_call_id || "");
    if (toolName !== "propose_script" || !toolCallId) return;
    if (context.items.some((item) => item.domain === "script" && item.key === toolCallId)) return;
    context.items.push({
      domain: "script",
      kind: "script-proposal",
      key: toolCallId,
      toolCallId,
      data: input.data
    });
  }
});
