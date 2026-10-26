<script setup lang="ts">
import type { ChenGoApi, GoExportFormat, GoSession } from "./api";
import type { QueryWorkspaceTab } from "./workspace";
import { useIntervalFn } from "@vueuse/core";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { editDirty } from "./dataEditing";
import { downloadGoExport } from "./exportDownload";
import { exportActive } from "./workspace";
const props = defineProps<{ query: QueryWorkspaceTab; session: GoSession; api: ChenGoApi; ready: boolean }>();
const emit = defineEmits<{
  start: [
    mode: "cached" | "query",
    format: GoExportFormat,
    snapshot: { sql: string; resultId: string; version: number }
  ];
  sync: [];
  cancel: [];
  remove: [];
}>();
const { t } = useI18n();
const open = ref(false);
const mode = ref<"cached" | "query">("cached");
const format = ref<GoExportFormat>("csv");
const snapshot = ref({ sql: "", resultId: "", version: 0, rows: 0, truncated: false });
const downloading = ref(false);
const notice = ref("");
const failure = ref("");
const job = computed(() => props.query.exportJob);
const closed = computed(() => props.session.state === "closed");
const unavailableMessage = computed(() =>
  props.session.state !== "ready" || props.query.console?.state !== "ready"
    ? t("Chen.GoV1ExportUnavailable")
    : editDirty(props.query.edit) || props.query.edit.busy
      ? t("Chen.GoWriteExportPending")
      : ""
);
watch(
  () => [job.value?.id, mode.value],
  () => {
    notice.value = "";
    failure.value = "";
  }
);
const active = computed(() => exportActive(job.value));
const canStart = computed(
  () =>
    props.ready &&
    props.session.permissions.can_download &&
    !props.query.busy &&
    !props.query.exportBusy &&
    !props.query.pending &&
    !active.value &&
    (mode.value === "cached"
      ? !!snapshot.value.resultId
      : !!snapshot.value.sql &&
        !["queued", "running", "waiting_review", "cancel_requested"].includes(props.query.execution?.status || ""))
);
const cancelSupported = computed(
  () => job.value?.mode === "cached" || job.value?.status === "waiting_review" || props.session.can_cancel !== false
);
function show() {
  if (!props.session.permissions.can_download || (!props.ready && !job.value)) return;
  snapshot.value = {
    sql: props.query.resultSql,
    resultId: props.query.resultId,
    version: props.query.resultExecution?.id === props.query.execution?.id ? props.query.executionVersion : 0,
    rows: props.query.rows?.total_rows || 0,
    truncated: !!props.query.rows?.truncated
  };
  mode.value = "cached";
  notice.value = "";
  failure.value = "";
  open.value = true;
  if (job.value && props.ready) emit("sync");
}
function start() {
  if (!canStart.value) return;
  emit("start", mode.value, format.value, { ...snapshot.value });
  // Command confirmation/review remains in the query's standard control banner.
  if (mode.value === "query") open.value = false;
}
async function download() {
  if (!job.value?.ready || job.value.status !== "succeeded" || downloading.value || !props.ready) return;
  const id = job.value.id;
  const fileName = `chen-${id.replace(/[^\w-]/g, "_")}.${job.value.format}`;
  downloading.value = true;
  notice.value = "";
  failure.value = "";
  try {
    const result = await downloadGoExport(async () => {
      if (!props.ready || job.value?.id !== id)
        throw new Error(unavailableMessage.value || t("Chen.GoV1SessionClosed"));
      const ticket = await props.api.exportDownloadTicket(id);
      if (!props.ready || job.value?.id !== id)
        throw new Error(unavailableMessage.value || t("Chen.GoV1SessionClosed"));
      return ticket;
    }, fileName);
    if (job.value?.id !== id) return;
    notice.value = t(
      result === "saved"
        ? "Chen.ExportDownloaded"
        : result === "cancelled"
          ? "Chen.ExportCanceled"
          : "Chen.GoV1ExportDownloadStarted"
    );
  } catch (cause) {
    if (job.value?.id === id) failure.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    downloading.value = false;
  }
}
function size(bytes: number) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KiB` : `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}
// Recover missed SSE updates while viewing a job; the event stream remains the normal progress path.
useIntervalFn(() => {
  if (open.value && active.value && props.ready) emit("sync");
}, 3000);
</script>

<template>
  <UButton
    icon="i-lucide-download"
    :label="job ? t('Chen.GoV1ExportTask') : t('Chen.ExportData')"
    size="xs"
    color="neutral"
    variant="ghost"
    :disabled="!session.permissions.can_download || (!ready && !job)"
    :title="!ready ? unavailableMessage : undefined"
    @click="show"
  />
  <UModal v-model:open="open" :title="t('Chen.ExportData')" :ui="{ content: 'sm:max-w-2xl' }">
    <template #body>
      <div class="space-y-4 text-sm" data-chen-export-panel>
        <p v-if="!ready" class="text-warning">{{ unavailableMessage }}</p>
        <div v-if="job" class="space-y-2 rounded border border-default p-3" aria-live="polite">
          <div class="flex items-center gap-2">
            <UIcon
              :name="active ? 'i-lucide-loader-circle' : job.ready ? 'i-lucide-file-check' : 'i-lucide-file-x'"
              :class="{ 'animate-spin': active }"
            />
            <strong>
              {{ job.format.toUpperCase() }} ·
              {{ t(job.mode === "query" ? "Chen.GoV1ExportFull" : "Chen.GoV1ExportCached") }}
            </strong>
            <span class="ml-auto">
              {{ t(job.status === "expired" ? "Chen.GoV1ExportExpired" : `Chen.GoV1Status_${job.status}`) }}
            </span>
          </div>
          <p>{{ t("Chen.GoV1ExportProgress", { rows: job.rows.toLocaleString(), size: size(job.bytes) }) }}</p>
          <p v-if="job.limits.max_duration_seconds" class="text-xs text-muted">
            {{ t("Chen.GoV1ExportDuration", { seconds: job.limits.max_duration_seconds }) }}
          </p>
          <p v-if="job.truncated" class="text-warning">{{ t("Chen.GoV1ExportIncomplete") }}</p>
          <p v-if="job.error" class="whitespace-pre-wrap break-words text-error">
            {{ job.error.message }} ({{ job.error.code }})
          </p>
          <p v-if="job.expires_at" class="text-xs text-muted">
            {{ t("Chen.GoV1ExportExpires", { time: new Date(job.expires_at).toLocaleString() }) }}
          </p>
          <div class="flex gap-2">
            <UButton
              v-if="active && !closed"
              :label="t('Common.Cancel')"
              color="neutral"
              variant="soft"
              :disabled="!ready || !cancelSupported || job.status === 'cancel_requested'"
              :title="!cancelSupported ? t('Chen.GoV1CancelUnsupported') : undefined"
              @click="emit('cancel')"
            />
            <UButton
              v-if="job.ready && job.status === 'succeeded'"
              icon="i-lucide-download"
              :label="t('Chen.GoV1ExportDownload')"
              :disabled="!ready || downloading"
              :loading="downloading"
              @click="download"
            />
            <UButton
              v-if="!active || closed"
              :label="t(closed ? 'Chen.GoV1ExportClear' : 'Chen.GoV1ExportRelease')"
              color="neutral"
              variant="ghost"
              :disabled="query.exportBusy"
              @click="emit('remove')"
            />
          </div>
        </div>
        <template v-if="ready && !active && !job">
          <div class="flex flex-wrap gap-2">
            <UButton
              :label="t('Chen.GoV1ExportCached')"
              :aria-pressed="mode === 'cached'"
              :variant="mode === 'cached' ? 'soft' : 'ghost'"
              color="neutral"
              @click="mode = 'cached'"
            />
            <UButton
              :label="t('Chen.GoV1ExportFull')"
              :aria-pressed="mode === 'query'"
              :variant="mode === 'query' ? 'soft' : 'ghost'"
              color="neutral"
              :disabled="!!query.pendingCachedExport"
              @click="mode = 'query'"
            />
          </div>
          <p v-if="mode === 'cached'" class="text-muted">
            {{ t("Chen.GoV1ExportCachedRows", { rows: snapshot.rows.toLocaleString() }) }}
          </p>
          <p v-if="mode === 'cached' && snapshot.truncated" class="text-warning">
            {{ t("Chen.GoV1ExportIncomplete") }}
          </p>
          <template v-if="mode === 'query'">
            <p class="text-warning">{{ t("Chen.GoV1ExportFullConfirm") }}</p>
            <pre
              class="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded border border-default bg-elevated p-3 text-xs"
              :class="{ 'select-none': !session.permissions.can_copy }"
              >{{ snapshot.sql }}</pre>
          </template>
          <div class="flex items-center gap-2" role="group" :aria-label="t('Chen.GoV1ExportFormat')">
            <span>{{ t("Chen.GoV1ExportFormat") }}</span>
            <UButton
              v-for="item in ['csv', 'xlsx'] as const"
              :key="item"
              :label="item.toUpperCase()"
              :aria-pressed="format === item"
              color="neutral"
              :variant="format === item ? 'soft' : 'ghost'"
              @click="format = item"
            />
          </div>
          <p class="text-xs text-muted">{{ t("Chen.GoV1ExportLimits") }}</p>
          <p v-if="format === 'csv'" class="text-xs text-muted">{{ t("Chen.GoV1ExportCsvCells") }}</p>
          <p v-if="format === 'csv'" class="text-xs text-muted">{{ t("Chen.GoV1ExportCsvFormat") }}</p>
          <p v-if="format === 'xlsx'" class="text-xs text-muted">{{ t("Chen.GoV1ExportXlsxLimits") }}</p>
          <p v-if="format === 'xlsx'" class="text-xs text-muted">{{ t("Chen.GoV1ExportXlsxPrecision") }}</p>
          <p v-if="query.pendingCachedExport" class="text-warning">{{ t("Chen.GoV1SubmissionUnknown") }}</p>
          <UButton
            :label="
              t(
                query.pendingCachedExport
                  ? 'Chen.GoV1RecoverSubmission'
                  : mode === 'query'
                    ? 'Chen.GoV1ExportConfirmFull'
                    : 'Chen.GoV1ExportCreate'
              )
            "
            :disabled="!canStart"
            :loading="query.exportBusy"
            @click="start"
          />
        </template>
        <p v-if="notice" class="text-muted">{{ notice }}</p>
        <p v-if="failure" class="text-error">{{ failure }}</p>
      </div>
    </template>
  </UModal>
</template>
