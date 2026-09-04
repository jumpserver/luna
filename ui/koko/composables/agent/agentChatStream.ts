import type { UIMessageChunk } from "ai";

export interface AgentChatTextStream {
  controller: Pick<ReadableStreamDefaultController<UIMessageChunk>, "enqueue">;
  openTextIds: Set<string>;
}

export function agentChatTextId(response: AgentChatTextStream, messageId: string, partIndex: number) {
  return response.openTextIds.values().next().value || `${messageId}-${partIndex}`;
}

export function closeAgentChatText(response: AgentChatTextStream) {
  for (const id of response.openTextIds) response.controller.enqueue({ type: "text-end", id });
  response.openTextIds.clear();
}
