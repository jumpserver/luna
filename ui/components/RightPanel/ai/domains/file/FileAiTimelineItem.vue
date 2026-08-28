<script setup lang="ts">
import type { AiTimelineAction, FileAiEventData, FileApprovalItem, FileViewItem } from "../../types";
import type { WorkspaceAiSession } from "~/composables/useWorkspaceAiSessions";
import { isKokoFileWorkspaceAiSession } from "~/composables/useWorkspaceAiSessions";
import { aiRiskColor, formatAiDuration } from "../../presentation";

const props = defineProps<{
  item: FileViewItem;
  session: WorkspaceAiSession;
  assistantName: string;
}>();

const emit = defineEmits<{
  action: [action: AiTimelineAction];
}>();

const { t } = useI18n();

interface FileDirectoryEntry {
  name: string;
  path: string;
  size: string;
  perm: string;
  isDir: boolean;
}

interface FileDirectoryDetails {
  path: string;
  entries: FileDirectoryEntry[];
  truncated: boolean;
}

const directoryDetails = computed<FileDirectoryDetails | null>(() => {
  if (props.item.kind !== "file-result") return null;
  const details = props.item.data.details;
  if (!details || typeof details !== "object" || !("entries" in details) || !Array.isArray(details.entries)) {
    return null;
  }
  const entries = details.entries.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const value = entry as Record<string, unknown>;
    return [
      {
        name: String(value.name || ""),
        path: String(value.path || ""),
        size: String(value.size || ""),
        perm: String(value.perm || ""),
        isDir: Boolean(value.isDir)
      }
    ];
  });
  const value = details as Record<string, unknown>;
  return {
    path: String(value.path || props.item.data.path || ""),
    entries: entries.slice(0, 50),
    truncated: Boolean(value.truncated) || entries.length > 50
  };
});

function valueText(value: unknown) {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function actionTitle(data: FileAiEventData) {
  return String(data.tool || data.operation || data.action || t("RightPanel.FileAIFileAction"));
}

function actionPath(data: FileAiEventData) {
  if (data.destinationPath) return `${data.path || ""} → ${data.destinationPath}`;
  if (data.targetPath) return `${data.sourcePath || data.path || ""} → ${data.targetPath}`;
  return String(data.path || data.sourcePath || "");
}

function statusColor(value: unknown): "neutral" | "info" | "warning" | "success" | "error" {
  const status = String(value || "").toLowerCase();
  if (["success", "completed", "succeeded"].includes(status)) return "success";
  if (["error", "failed", "rejected"].includes(status)) return "error";
  if (["awaiting_approval", "pending", "proposed"].includes(status)) return "warning";
  if (["running", "in_progress", "executing", "analyzing", "tool_running"].includes(status)) return "info";
  return "neutral";
}

function statusLabel(value: unknown) {
  const status = String(value || "");
  const keys: Record<string, string> = {
    proposed: "RightPanel.FileAIStateProposed",
    awaiting_approval: "RightPanel.FileAIStateAwaitingApproval",
    running: "RightPanel.FileAIStateRunning",
    in_progress: "RightPanel.FileAIStateRunning",
    completed: "RightPanel.FileAIStateCompleted",
    success: "RightPanel.FileAIStateCompleted",
    failed: "RightPanel.FileAIStateFailed",
    error: "RightPanel.FileAIStateFailed",
    rejected: "RightPanel.FileAIStateRejected",
    pending: "RightPanel.FileAIStatePending",
    analyzing: "RightPanel.FileAIStateAnalyzing",
    tool_running: "RightPanel.FileAIStateReading",
    executing: "RightPanel.FileAIStateExecuting",
    idle: "RightPanel.FileAIStateReady"
  };
  return keys[status] ? t(keys[status]) : status;
}

function isApprovalPending(item: FileApprovalItem) {
  if (!isKokoFileWorkspaceAiSession(props.session)) return false;
  return props.session.pendingApprovals.has(String(item.data.id || item.data.approvalId || ""));
}

function isApprovalResolving(item: FileApprovalItem) {
  if (!isKokoFileWorkspaceAiSession(props.session)) return false;
  return props.session.resolvingApprovals.has(String(item.data.id || item.data.approvalId || ""));
}

function resolveApproval(item: FileApprovalItem, decision: "approve" | "reject") {
  const approvalId = String(item.data.id || item.data.approvalId || "");
  const digest = String(item.data.digest || "");
  if (!approvalId || !digest) return;
  emit("action", { domain: "file", type: "resolve-file-approval", approvalId, digest, decision });
}
</script>

<template>
  <section v-if="item.kind === 'file-analysis'" class="space-y-2 rounded-xl border border-default bg-elevated/60 p-2.5">
    <header class="flex items-center gap-2">
      <UIcon name="i-lucide-folder-search-2" class="size-4 text-primary" />
      <span class="text-xs font-semibold text-highlighted">{{ t("RightPanel.FileAIDirectoryAnalysis") }}</span>
      <UBadge v-if="item.data.tools?.length" color="neutral" variant="subtle" size="xs" class="ml-auto">
        {{ t("RightPanel.FileAIToolCount", { count: item.data.tools.length }) }}
      </UBadge>
    </header>
    <p v-if="item.data.summary || item.data.description" class="whitespace-pre-wrap text-[11px] text-muted">
      {{ item.data.summary || item.data.description }}
    </p>
    <div v-if="item.data.tools?.length" class="flex flex-wrap gap-1">
      <UBadge v-for="tool in item.data.tools" :key="tool" color="neutral" variant="soft" size="xs">
        {{ tool }}
      </UBadge>
    </div>
    <div v-if="item.data.maxDirectoryEntries || item.data.maxTextBytes" class="flex gap-3 text-[10px] text-muted">
      <span v-if="item.data.maxDirectoryEntries">
        {{ t("RightPanel.FileAIDirectoryLimit", { count: item.data.maxDirectoryEntries }) }}
      </span>
      <span v-if="item.data.maxTextBytes">
        {{ t("RightPanel.FileAITextLimit", { count: item.data.maxTextBytes }) }}
      </span>
    </div>
  </section>

  <section
    v-else-if="item.kind === 'file-plan'"
    class="overflow-hidden rounded-xl border border-default bg-elevated/60"
  >
    <header class="flex items-center gap-2 border-b border-default px-2.5 py-2">
      <UIcon name="i-lucide-list-todo" class="size-4 text-primary" />
      <span class="min-w-0 flex-1 truncate text-xs font-semibold text-highlighted">
        {{ item.data.summary || t("RightPanel.FileAIPlan") }}
      </span>
      <UBadge v-if="item.data.round" color="neutral" variant="subtle" size="xs">
        {{ item.data.round }}/{{ item.data.maxRounds || item.data.round }}
      </UBadge>
    </header>
    <ol v-if="item.data.steps?.length" class="divide-y divide-default">
      <li v-for="(step, index) in item.data.steps" :key="step.id || index" class="flex gap-2 px-2.5 py-2">
        <span class="grid size-5 shrink-0 place-items-center rounded-full bg-accented text-[10px] font-medium">
          {{ index + 1 }}
        </span>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5">
            <span class="truncate text-[11px] font-medium text-highlighted">{{ step.title }}</span>
            <UBadge :color="statusColor(step.status)" variant="subtle" size="xs" class="ml-auto">
              {{ statusLabel(step.status) }}
            </UBadge>
          </div>
          <p v-if="step.objective" class="mt-0.5 text-[10px] text-muted">{{ step.objective }}</p>
        </div>
      </li>
    </ol>
  </section>

  <div
    v-else-if="item.kind === 'file-progress'"
    class="flex items-center gap-2 rounded-lg border border-default bg-elevated/40 px-2.5 py-2 text-[11px] text-muted"
  >
    <UIcon name="i-lucide-loader-circle" class="size-3.5 shrink-0 animate-spin text-primary" />
    <span class="min-w-0 flex-1">{{ item.data.text || item.data.summary }}</span>
    <UBadge v-if="item.data.state" :color="statusColor(item.data.state)" variant="subtle" size="xs">
      {{ statusLabel(item.data.state) }}
    </UBadge>
  </div>

  <section
    v-else-if="item.kind === 'file-action'"
    class="space-y-2 rounded-xl border border-default bg-elevated/60 p-2.5"
  >
    <header class="flex items-center gap-2">
      <UIcon name="i-lucide-file-cog" class="size-4 text-primary" />
      <span class="font-mono text-xs font-semibold text-highlighted">{{ actionTitle(item.data) }}</span>
      <UBadge
        v-if="item.data.state || item.data.status"
        :color="statusColor(item.data.state || item.data.status)"
        variant="subtle"
        size="xs"
        class="ml-auto"
      >
        {{ statusLabel(item.data.state || item.data.status) }}
      </UBadge>
      <UBadge
        v-if="Number(item.data.riskLevel) > 0"
        :color="aiRiskColor(Number(item.data.riskLevel))"
        variant="subtle"
        size="xs"
      >
        {{ t("RightPanel.AIRisk", { level: item.data.riskLevel }) }}
      </UBadge>
    </header>
    <p v-if="actionPath(item.data)" class="break-all font-mono text-[10px] text-highlighted">
      {{ actionPath(item.data) }}
    </p>
    <p v-if="item.data.rationale || item.data.riskReason" class="text-[11px] text-muted">
      {{ item.data.rationale || item.data.riskReason }}
    </p>
  </section>

  <section
    v-else-if="item.kind === 'file-diff'"
    class="overflow-hidden rounded-xl border border-default bg-elevated/60"
  >
    <header class="flex items-center gap-2 border-b border-default px-2.5 py-2">
      <UIcon name="i-lucide-file-diff" class="size-4 text-primary" />
      <span class="min-w-0 flex-1 truncate text-xs font-semibold text-highlighted">
        {{ item.data.path || t("RightPanel.FileAIDiff") }}
      </span>
      <UBadge v-if="item.data.truncated" color="warning" variant="subtle" size="xs">
        {{ t("RightPanel.FileAITruncated") }}
      </UBadge>
    </header>
    <div class="grid min-h-0 gap-px bg-[var(--app-border)] sm:grid-cols-2">
      <div class="min-w-0 bg-default">
        <div class="border-b border-default bg-error/10 px-2 py-1 text-[10px] font-medium text-error">
          {{ t("RightPanel.FileAIBefore") }}
        </div>
        <pre
          class="max-h-72 overflow-auto whitespace-pre-wrap break-words p-2 font-mono text-[10px]"
        ><code>{{ item.data.before || "" }}</code></pre>
      </div>
      <div class="min-w-0 bg-default">
        <div class="border-b border-default bg-success/10 px-2 py-1 text-[10px] font-medium text-success">
          {{ t("RightPanel.FileAIAfter") }}
        </div>
        <pre
          class="max-h-72 overflow-auto whitespace-pre-wrap break-words p-2 font-mono text-[10px]"
        ><code>{{ item.data.after || "" }}</code></pre>
      </div>
    </div>
  </section>

  <section
    v-else-if="item.kind === 'file-approval'"
    class="overflow-hidden rounded-xl border border-warning/50 bg-warning/5"
  >
    <header class="flex items-center gap-2 border-b border-warning/30 px-2.5 py-2">
      <UIcon name="i-lucide-shield-alert" class="size-4 text-warning" />
      <span class="text-xs font-semibold text-highlighted">{{ t("RightPanel.FileAIApprovalTitle") }}</span>
      <UBadge
        v-if="Number(item.data.riskLevel) > 0"
        :color="aiRiskColor(Number(item.data.riskLevel))"
        variant="subtle"
        size="xs"
        class="ml-auto"
      >
        {{ t("RightPanel.AIRisk", { level: item.data.riskLevel }) }}
      </UBadge>
    </header>
    <div class="space-y-1.5 px-2.5 py-2 text-[11px]">
      <div class="flex items-center gap-2">
        <span class="font-mono font-medium text-highlighted">{{ actionTitle(item.data) }}</span>
        <span v-if="item.data.expiresInSeconds" class="ml-auto text-[10px] text-muted">
          {{ t("RightPanel.FileAIApprovalExpires", { count: item.data.expiresInSeconds }) }}
        </span>
      </div>
      <p v-if="actionPath(item.data)" class="break-all font-mono text-[10px] text-highlighted">
        {{ actionPath(item.data) }}
      </p>
      <p v-if="item.data.summary || item.data.riskReason" class="text-muted">
        {{ item.data.summary || item.data.riskReason }}
      </p>
    </div>
    <div v-if="isApprovalPending(item)" class="flex justify-end gap-1.5 border-t border-warning/30 p-2">
      <UButton
        size="xs"
        color="neutral"
        variant="soft"
        :label="t('RightPanel.AIReject')"
        :disabled="isApprovalResolving(item)"
        @click="resolveApproval(item, 'reject')"
      />
      <UButton
        size="xs"
        color="warning"
        icon="i-lucide-check"
        :label="t('RightPanel.AIApprove')"
        :loading="isApprovalResolving(item)"
        @click="resolveApproval(item, 'approve')"
      />
    </div>
    <div v-else class="border-t border-warning/30 px-2.5 py-2 text-right text-[10px] text-muted">
      {{ t("RightPanel.FileAIApprovalResolved") }}
    </div>
  </section>

  <section v-else class="space-y-2 rounded-xl border border-default bg-elevated/60 p-2.5">
    <header class="flex items-center gap-2">
      <UIcon
        :name="item.data.outcome === 'success' ? 'i-lucide-circle-check' : 'i-lucide-circle-x'"
        class="size-4"
        :class="item.data.outcome === 'success' ? 'text-success' : 'text-error'"
      />
      <span class="text-xs font-semibold text-highlighted">
        {{ directoryDetails ? t("RightPanel.FileAIDirectoryAnalysis") : t("RightPanel.FileAIResult") }}
      </span>
      <UBadge :color="statusColor(item.data.outcome)" variant="subtle" size="xs" class="ml-auto">
        {{ statusLabel(item.data.outcome) }}
      </UBadge>
      <span v-if="Number(item.data.durationMs) > 0" class="font-mono text-[10px] text-muted">
        {{ formatAiDuration(Number(item.data.durationMs)) }}
      </span>
    </header>
    <p v-if="item.data.path" class="break-all font-mono text-[10px] text-highlighted">{{ item.data.path }}</p>
    <p
      v-if="item.data.summary || item.data.error || item.data.message"
      class="whitespace-pre-wrap text-[11px] text-muted"
    >
      {{ item.data.error || item.data.message || item.data.summary }}
    </p>
    <div v-if="directoryDetails" class="overflow-hidden rounded-lg border border-default">
      <div class="flex items-center gap-2 border-b border-default bg-muted/30 px-2 py-1.5 text-[10px] text-muted">
        <span class="min-w-0 flex-1 truncate font-mono" :title="directoryDetails.path">
          {{ directoryDetails.path }}
        </span>
        <span>{{ t("RightPanel.FileAIEntryCount", { count: directoryDetails.entries.length }) }}</span>
      </div>
      <ul class="max-h-56 divide-y divide-default overflow-y-auto">
        <li
          v-for="entry in directoryDetails.entries"
          :key="entry.path || entry.name"
          class="flex items-center gap-2 px-2 py-1.5 text-[10px]"
        >
          <UIcon :name="entry.isDir ? 'i-lucide-folder' : 'i-lucide-file'" class="size-3.5 shrink-0 text-muted" />
          <span class="min-w-0 flex-1 truncate font-mono text-highlighted" :title="entry.path || entry.name">
            {{ entry.name }}
          </span>
          <span v-if="entry.perm" class="shrink-0 font-mono text-muted">{{ entry.perm }}</span>
          <span v-if="entry.size && !entry.isDir" class="shrink-0 font-mono text-muted">{{ entry.size }}</span>
        </li>
      </ul>
      <div v-if="directoryDetails.truncated" class="border-t border-default px-2 py-1.5 text-[10px] text-warning">
        {{ t("RightPanel.FileAITruncated") }}
      </div>
    </div>
    <pre
      v-else-if="item.data.result || item.data.details"
      class="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-2 font-mono text-[10px] text-muted"
    ><code>{{ valueText(item.data.result || item.data.details) }}</code></pre>
  </section>
</template>
