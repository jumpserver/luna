import type { UIMessageChunk } from "ai";
import { isRecord } from "./types";

const AGENT_RUN_TERMINAL_EVENTS = new Set(["run.completed", "run.failed", "run.cancelled", "run.interrupted"]);

interface AgentChatMessageLike {
  metadata?: unknown;
  parts: Array<{ type: string }>;
}

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

export function agentEventLifecycle(value: unknown) {
  const eventType = String(value || "");
  return {
    eventType,
    messageCompleted: eventType === "message.completed",
    runFinished: AGENT_RUN_TERMINAL_EVENTS.has(eventType)
  };
}

export function agentChatEventLifecycle(message: Pick<AgentChatMessageLike, "metadata">) {
  const metadata = isRecord(message.metadata) ? message.metadata : {};
  const lifecycle = agentEventLifecycle(metadata.agentEventType);
  return {
    ...lifecycle,
    completedSnapshot: lifecycle.messageCompleted && metadata.agentCompletedSnapshot === true
  };
}

export function agentChatStreamMessage<T extends AgentChatMessageLike>(
  message: T,
  includePart: (part: T["parts"][number]) => boolean = () => true
) {
  const lifecycle = agentChatEventLifecycle(message);
  const parts = message.parts.filter(
    (part) => (!lifecycle.messageCompleted || lifecycle.completedSnapshot || part.type !== "text") && includePart(part)
  );
  return parts.length ? ({ ...message, parts } as T) : null;
}
