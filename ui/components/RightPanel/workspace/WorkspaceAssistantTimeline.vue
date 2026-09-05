<script setup lang="ts">
import type { WorkspaceAssistantChatMessage } from "~/composables/useWorkspaceAssistantSession";
import { renderAiMarkdown } from "../ai/presentation";

type TimelineEntry =
  | { key: string; kind: "text"; role: "user" | "assistant"; text: string }
  | { key: string; kind: "tool"; data: Record<string, any> }
  | { key: string; kind: "approval"; data: Record<string, any> }
  | { key: string; kind: "error"; data: Record<string, any> };

const props = defineProps<{
  messages: WorkspaceAssistantChatMessage[];
  assistantName: string;
  approvalProcessing: boolean;
}>();

const emit = defineEmits<{
  decideApproval: [approvalId: string, decision: "approve" | "reject"];
}>();

const { t } = useI18n();
const messagesElement = useTemplateRef<HTMLElement>("messagesElement");

function recordData(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

const entries = computed<TimelineEntry[]>(() => {
  const result: TimelineEntry[] = [];
  const toolIndexes = new Map<string, number>();
  const approvalIndexes = new Map<string, number>();

  for (const message of props.messages) {
    for (const [partIndex, part] of message.parts.entries()) {
      const key = `${message.id}-${partIndex}`;
      if (part.type === "text" && part.text.trim()) {
        result.push({
          key,
          kind: "text",
          role: message.role === "user" ? "user" : "assistant",
          text: part.text
        });
        continue;
      }
      if (!("data" in part)) continue;
      const data = recordData(part.data);

      if (part.type === "data-agent-tool") {
        const toolCallId = String(data.toolCallId || data.id || key);
        const existingIndex = toolIndexes.get(toolCallId);
        if (existingIndex === undefined) {
          toolIndexes.set(toolCallId, result.length);
          result.push({ key: `tool-${toolCallId}`, kind: "tool", data: { ...data } });
        } else {
          const existing = result[existingIndex];
          if (existing?.kind === "tool") result[existingIndex] = { ...existing, data: { ...existing.data, ...data } };
        }
        continue;
      }

      if (part.type === "data-approval") {
        const approvalId = String(data.approvalId || data.id || key);
        const existingIndex = approvalIndexes.get(approvalId);
        if (existingIndex === undefined) {
          approvalIndexes.set(approvalId, result.length);
          result.push({ key: `approval-${approvalId}`, kind: "approval", data: { ...data } });
        } else {
          const existing = result[existingIndex];
          if (existing?.kind === "approval") {
            result[existingIndex] = { ...existing, data: { ...existing.data, ...data } };
          }
        }
        continue;
      }

      if (part.type === "data-error") result.push({ key: `error-${key}`, kind: "error", data });
    }
  }

  return result;
});

function toolStatus(data: Record<string, any>) {
  const status = String(data.status || "running").toLowerCase();
  if (["success", "completed"].includes(status)) return "success";
  if (["cancelled", "canceled", "interrupted"].includes(status)) return "cancelled";
  if (["error", "failed", "timeout"].includes(status)) return "error";
  return "running";
}

function toolStatusLabel(data: Record<string, any>) {
  const status = toolStatus(data);
  if (status === "success") return t("RightPanel.AIStatusCompleted");
  if (status === "cancelled") return t("RightPanel.AIStatusCancelled");
  if (status === "error") return t("RightPanel.AIStatusFailed");
  return t("RightPanel.AIStatusRunning");
}

function toolIcon(data: Record<string, any>) {
  const status = toolStatus(data);
  if (status === "success") return "i-lucide-circle-check";
  if (status === "cancelled") return "i-lucide-circle-slash";
  if (status === "error") return "i-lucide-circle-alert";
  return "i-lucide-loader-circle";
}

function approvalId(data: Record<string, any>) {
  return String(data.approvalId || data.id || "");
}

function approvalTarget(data: Record<string, any>) {
  const args = recordData(data.arguments);
  const asset = String(args.asset_name || args.asset_id || "");
  const protocol = String(args.protocol || "");
  return [asset, protocol].filter(Boolean).join(" · ");
}

function approvalStateLabel(data: Record<string, any>) {
  if (!data.resolved) return "";
  if (data.state === "approved") return t("RightPanel.AIStatusApproved");
  if (data.state === "cancelled") return t("RightPanel.AIStatusCancelled");
  return t("RightPanel.AIStatusRejected");
}

function scrollToBottom() {
  void nextTick(() => {
    if (messagesElement.value) messagesElement.value.scrollTop = messagesElement.value.scrollHeight;
  });
}

watch(
  () =>
    entries.value
      .map((entry) => `${entry.key}:${entry.kind}:${JSON.stringify("data" in entry ? entry.data : entry.text)}`)
      .join("|"),
  scrollToBottom,
  { flush: "post" }
);
</script>

<template>
  <main ref="messagesElement" class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
    <UEmpty
      v-if="entries.length === 0"
      icon="i-lucide-monitor-cog"
      size="sm"
      variant="naked"
      :title="t('RightPanel.WorkspaceAssistantEmptyTitle')"
      :description="t('RightPanel.WorkspaceAssistantEmptyDescription')"
    />

    <template v-for="entry in entries" :key="entry.key">
      <article v-if="entry.kind === 'text'" class="flex gap-2" :class="entry.role === 'user' ? 'flex-row-reverse' : ''">
        <span class="grid size-6 shrink-0 place-items-center rounded-md border border-default bg-elevated text-primary">
          <UIcon :name="entry.role === 'user' ? 'i-lucide-user-round' : 'i-lucide-sparkles'" class="size-3.5" />
        </span>
        <div class="min-w-0 max-w-[88%]" :class="entry.role === 'user' ? 'text-right' : ''">
          <div class="text-[10px] text-muted">
            {{ entry.role === "user" ? t("RightPanel.AIYou") : assistantName }}
          </div>
          <div
            class="workspace-assistant-markdown mt-1 rounded-xl border border-default px-2.5 py-2 text-left text-xs"
            :class="entry.role === 'user' ? 'rounded-tr-sm bg-primary/10' : 'rounded-tl-sm bg-elevated'"
            v-html="renderAiMarkdown(entry.text)"
          />
        </div>
      </article>

      <section
        v-else-if="entry.kind === 'tool'"
        class="rounded-xl border border-default bg-elevated/40 px-2.5 py-2 text-[11px]"
      >
        <div class="flex min-w-0 items-center gap-1.5">
          <UIcon
            :name="toolIcon(entry.data)"
            class="size-3.5 shrink-0"
            :class="toolStatus(entry.data) === 'running' ? 'animate-spin text-primary' : ''"
          />
          <span class="shrink-0 font-medium text-highlighted">{{ t("RightPanel.AIToolCall") }}</span>
          <code class="min-w-0 truncate font-mono text-[10px] text-muted">
            {{ entry.data.toolName || entry.data.tool_name }}
          </code>
          <span class="ml-auto shrink-0 text-[10px] text-muted">{{ toolStatusLabel(entry.data) }}</span>
        </div>
      </section>

      <UAlert
        v-else-if="entry.kind === 'approval'"
        icon="i-lucide-shield-alert"
        :color="entry.data.resolved ? 'neutral' : 'warning'"
        variant="subtle"
        :title="t('RightPanel.WorkspaceAssistantApprovalTitle')"
      >
        <template #description>
          <div class="mt-2 space-y-2 text-xs">
            <p>{{ t("RightPanel.WorkspaceAssistantApprovalDescription") }}</p>
            <div v-if="approvalTarget(entry.data)" class="rounded-md border border-default bg-default/40 px-2 py-1.5">
              {{ approvalTarget(entry.data) }}
            </div>
            <p v-if="entry.data.resolved" class="text-muted">{{ approvalStateLabel(entry.data) }}</p>
            <div v-else class="flex justify-end gap-2">
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                :disabled="approvalProcessing"
                @click="emit('decideApproval', approvalId(entry.data), 'reject')"
              >
                {{ t("RightPanel.AIReject") }}
              </UButton>
              <UButton
                size="xs"
                color="warning"
                :loading="approvalProcessing"
                @click="emit('decideApproval', approvalId(entry.data), 'approve')"
              >
                {{ t("RightPanel.AIApprove") }}
              </UButton>
            </div>
          </div>
        </template>
      </UAlert>

      <UAlert
        v-else-if="entry.kind === 'error'"
        icon="i-lucide-circle-alert"
        color="error"
        variant="subtle"
        :title="String(entry.data.message || entry.data.code || t('RightPanel.AIFailed'))"
      />
    </template>
  </main>
</template>

<style scoped>
.workspace-assistant-markdown {
  overflow-wrap: anywhere;
  line-height: 1.6;
}

.workspace-assistant-markdown :deep(> :first-child) {
  margin-top: 0;
}

.workspace-assistant-markdown :deep(> :last-child) {
  margin-bottom: 0;
}

.workspace-assistant-markdown :deep(p) {
  margin: 0 0 0.4rem;
}

.workspace-assistant-markdown :deep(ul),
.workspace-assistant-markdown :deep(ol) {
  margin: 0.3rem 0;
  padding-left: 1.2rem;
}

.workspace-assistant-markdown :deep(code) {
  padding: 0.05rem 0.25rem;
  border-radius: 0.25rem;
  color: var(--ui-color-primary-500);
  background: var(--app-card-bg-soft);
  font-family: var(--font-mono);
  font-size: 0.92em;
}
</style>
