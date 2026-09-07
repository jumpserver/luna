<script setup lang="ts">
import type { AgentToolItem, AiTimelineAction } from "../ai/types";
import type { WorkspaceAssistantChatMessage } from "~/composables/useWorkspaceAssistantSession";
import type { WorkspaceTerminalTask } from "~/composables/useWorkspaceTerminalTasks";
import { workspaceAssistantTerminalTraceTaskId } from "~/composables/useWorkspaceAssistantSession";
import AiMessageItem from "../ai/domains/shared/AiMessageItem.vue";
import AiToolCallItem from "../ai/domains/shared/AiToolCallItem.vue";
import { useAiTimelineScroll } from "../ai/useAiTimelineScroll";
import WorkspaceTerminalTaskCard from "./WorkspaceTerminalTask.vue";

type TimelineEntry =
  | { key: string; kind: "terminal-task"; taskId: string }
  | { key: string; kind: "text"; role: "user" | "assistant"; text: string }
  | { key: string; kind: "tool"; data: Record<string, any> }
  | { key: string; kind: "approval"; data: Record<string, any> }
  | { key: string; kind: "error"; data: Record<string, any> };

const props = defineProps<{
  messages: WorkspaceAssistantChatMessage[];
  terminalTasks: WorkspaceTerminalTask[];
  scopeId: string;
  hasTerminal: boolean;
  running: boolean;
  terminalTargets: Array<{ target_id: string; asset_name: string; account: string; address: string }>;
  assistantName: string;
  approvalProcessing: boolean;
}>();

const emit = defineEmits<{
  terminalAction: [taskId: string, action: AiTimelineAction];
  suggest: [prompt: string];
  decideApproval: [approvalId: string, decision: "approve" | "reject"];
}>();

const { t } = useI18n();
const { tabs } = useWorkspaceTabs();
const messagesElement = useTemplateRef<HTMLElement>("messagesElement");
const contentElement = useTemplateRef<HTMLElement>("contentElement");
useAiTimelineScroll(
  messagesElement,
  contentElement,
  () => props.messages,
  () => props.scopeId,
  () => props.messages.findLast((message) => message.role === "user")?.id
);

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

      if (part.type === "data-terminal-task") {
        result.push({ key, kind: "terminal-task", taskId: String(data.taskId) });
        continue;
      }
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

const taskTraces = computed(() => {
  const traces = new Map<string, AgentToolItem[]>();
  for (const entry of entries.value) {
    if (entry.kind !== "tool") continue;
    const taskId = workspaceAssistantTerminalTraceTaskId(entry.data, props.terminalTasks);
    if (taskId) traces.set(taskId, [...(traces.get(taskId) || []), toolItem(entry)]);
  }
  return traces;
});
const visibleEntries = computed(() =>
  entries.value.filter(
    (entry) => entry.kind !== "tool" || !workspaceAssistantTerminalTraceTaskId(entry.data, props.terminalTasks)
  )
);

function toolItem(entry: Extract<TimelineEntry, { kind: "tool" }>): AgentToolItem {
  return {
    domain: "shared",
    kind: "agent-tool",
    key: entry.key,
    data: {
      ...entry.data,
      id: entry.key,
      toolCallId: String(entry.data.toolCallId || entry.data.id || entry.key),
      sourceDomain: "workspace",
      toolName: String(entry.data.toolName || entry.data.tool_name || ""),
      status: toolStatus(entry.data)
    }
  };
}

function toolStatus(data: Record<string, any>) {
  const status = String(data.status || "running").toLowerCase();
  if (["success", "completed"].includes(status)) return "success";
  if (["cancelled", "canceled", "interrupted"].includes(status)) return "cancelled";
  if (status === "unknown" || status === "timeout") return status;
  if (["error", "failed"].includes(status)) return "error";
  return "running";
}

function approvalId(data: Record<string, any>) {
  return String(data.approvalId || data.id || "");
}

function terminalToolLabel(data: Record<string, any>) {
  const name = String(data.toolName || data.tool_name || data.tool || "");
  return ["list_terminal_targets", "start_terminal_task", "get_terminal_task"].includes(name)
    ? t(`RightPanel.LunaAiTool_${name}`)
    : "";
}

function keyIsTerminalTarget(id: string) {
  const target = props.terminalTargets.find((item) => item.target_id === id);
  return target ? `${target.asset_name} · ${target.account} (${target.address})` : "";
}

function approvalTarget(data: Record<string, any>) {
  const args = recordData(data.arguments);
  const allowed = [
    "asset_name",
    "asset_id",
    "protocol",
    "account_id",
    "connect_method",
    "target",
    "id",
    "ids",
    "tab_id",
    "pane_id",
    "target_pane_id",
    "action",
    "direction",
    "placement",
    "mode",
    "favorite",
    "section",
    "visible",
    "target_id",
    "prompt"
  ];
  const describe = (value: unknown) => {
    const id = String(value);
    if (keyIsTerminalTarget(id)) return keyIsTerminalTarget(id)!;
    const tab = tabs.value.find((item) => item.id === id);
    if (tab) return `${tab.title || tab.assetName} (${id})`;
    const pane = tabs.value.flatMap((item) => item.panes).find((item) => item.id === id);
    return pane ? `${pane.assetName} · ${pane.account} (${id})` : id;
  };
  return allowed
    .filter((key) => args[key] !== undefined)
    .map((key) => {
      const label =
        key === "target_id" ? t("RightPanel.LunaAiTarget") : key === "prompt" ? t("RightPanel.LunaAiTask") : key;
      return `${label}: ${Array.isArray(args[key]) ? args[key].map(describe).join(", ") : describe(args[key])}`;
    })
    .join("\n");
}

function approvalStateLabel(data: Record<string, any>) {
  if (!data.resolved) return "";
  if (data.state === "approved") return t("RightPanel.AIStatusApproved");
  if (data.state === "cancelled") return t("RightPanel.AIStatusCancelled");
  return t("RightPanel.AIStatusRejected");
}
</script>

<template>
  <main ref="messagesElement" class="min-h-0 flex-1 overflow-y-auto p-3">
    <div ref="contentElement" class="space-y-3">
      <UEmpty
        v-if="entries.length === 0"
        icon="i-lucide-monitor-cog"
        size="sm"
        variant="naked"
        :title="t('RightPanel.LunaAiEmptyTitle')"
        :description="t(hasTerminal ? 'RightPanel.LunaAiTerminalEmpty' : 'RightPanel.LunaAiWorkspaceEmpty')"
      />

      <div v-if="entries.length === 0" class="flex flex-wrap justify-center gap-2">
        <UButton
          v-for="key in hasTerminal
            ? ['LunaAiSuggestDisk', 'LunaAiSuggestError', 'LunaAiSuggestSearch']
            : ['LunaAiSuggestSearch', 'LunaAiSuggestSessions']"
          :key="key"
          color="neutral"
          variant="soft"
          size="xs"
          :label="t(`RightPanel.${key}`)"
          @click="emit('suggest', t(`RightPanel.${key}`))"
        />
      </div>
      <template v-for="entry in visibleEntries" :key="entry.key">
        <AiMessageItem
          v-if="entry.kind === 'text'"
          :item="{ domain: 'shared', kind: 'text', key: entry.key, role: entry.role, text: entry.text }"
          :assistant-name="assistantName"
        />
        <template v-else-if="entry.kind === 'terminal-task'">
          <WorkspaceTerminalTaskCard
            v-for="task in terminalTasks.filter((item) => item.id === entry.taskId)"
            :key="task.id"
            :task="task"
            :operations="taskTraces.get(task.id)"
            @action="emit('terminalAction', task.id, $event)"
          />
        </template>

        <AiToolCallItem
          v-else-if="entry.kind === 'tool'"
          :label="terminalToolLabel(entry.data)"
          :item="toolItem(entry)"
        />

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
              <p class="font-medium">
                {{ terminalToolLabel(entry.data) || entry.data.toolName || entry.data.tool_name || entry.data.tool }}
              </p>
              <div
                v-if="approvalTarget(entry.data)"
                class="whitespace-pre-wrap break-all rounded-md border border-default bg-default/40 px-2 py-1.5"
              >
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
      <div v-if="running" role="status" class="flex items-center gap-2 text-xs text-muted">
        <UIcon name="i-lucide-loader-circle" class="size-3.5 animate-spin" />
        {{ t("RightPanel.AIResponding") }}
      </div>
    </div>
  </main>
</template>
