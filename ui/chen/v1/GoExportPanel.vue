<script setup lang="ts">
import type { ChenGoApi, GoExport, GoExportFormat, GoSession } from "./api";
import type { QueryWorkspaceTab } from "./workspace";
import { useIntervalFn } from "@vueuse/core";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { chenErrorText } from "~/chen/utils/errorMessages";
import { workspaceButtonClass } from "~/shared/theme/workspaceButton";
import { editDirty } from "./dataEditing";
import { downloadGoExportFile } from "./exportDownload";
import { exportActive, exportNeedsSync } from "./workspace";
const props = defineProps<{
  query: QueryWorkspaceTab;
  session: GoSession;
  api: ChenGoApi;
  ready: boolean;
  iconOnly?: boolean;
}>();
const emit = defineEmits<{
  start: [
    mode: "cached" | "query",
    format: GoExportFormat,
    snapshot: { sql: string; resultId: string; version: number; rows?: number }
  ];
  sync: [id: string];
  cancel: [id: string];
  remove: [id: string];
}>();
const { t } = useI18n();
const open = ref(false);
const mode = ref<"cached" | "query">("cached");
const format = ref<GoExportFormat>("csv");
const snapshot = ref({ sql: "", resultId: "", version: 0, rows: 0, truncated: false });
const downloading = ref<string | null>(null);
const submittedFull = ref(false);
const notice = ref("");
const failure = ref("");
const jobs = computed(() => props.query.exportJobs);
const closed = computed(() => props.session.state === "closed");
const unavailableMessage = computed(() =>
  props.session.state !== "ready" || props.query.console?.state !== "ready"
    ? t("Chen.GoV1ExportUnavailable")
    : editDirty(props.query.edit) || props.query.edit.busy
      ? t("Chen.GoWriteExportPending")
      : ""
);
const canStart = computed(
  () =>
    props.ready &&
    props.session.permissions.can_download &&
    !props.query.busy &&
    !props.query.exportBusy &&
    !props.query.pending &&
    (mode.value === "cached"
      ? !!snapshot.value.resultId
      : (!props.query.browseObject || props.query.rows?.browse?.supported) &&
        !!snapshot.value.sql &&
        !["queued", "running", "waiting_review", "cancel_requested"].includes(props.query.execution?.status || ""))
);
function cancelSupported(job: GoExport) {
  return (
    job.mode === "cached" ||
    job.status === "queued" ||
    job.status === "waiting_review" ||
    props.session.can_cancel !== false
  );
}
function show() {
  if (!props.session.permissions.can_download || (!props.ready && !jobs.value.length)) return;
  snapshot.value = {
    sql: props.query.rows?.browse?.supported ? props.query.rows.browse.full_sql : props.query.resultSql,
    resultId: props.query.resultId,
    version: props.query.resultExecution?.id === props.query.execution?.id ? props.query.executionVersion : 0,
    rows:
      (props.query.loadingSettings.mode === "continuous"
        ? props.query.rows?.rows.length
        : props.query.rows?.total_rows) || 0,
    truncated: !!props.query.rows?.truncated
  };
  submittedFull.value = false;
  mode.value = "cached";
  notice.value = "";
  failure.value = "";
  open.value = true;
  if (props.ready) jobs.value.filter(exportNeedsSync).forEach((job) => emit("sync", job.id));
}
function start() {
  if (!canStart.value) return;
  notice.value = "";
  failure.value = "";
  submittedFull.value = mode.value === "query";
  emit("start", mode.value, format.value, { ...snapshot.value });
}
// Confirmation, review and submission errors use the query's existing controls.
watch(
  () =>
    props.query.error ||
    props.query.execution?.confirmation ||
    ["failed", "waiting_review", "unknown"].includes(props.query.execution?.status || ""),
  (needsAttention) => {
    if (submittedFull.value && needsAttention) open.value = false;
  }
);
async function download(job: GoExport) {
  if (!job.ready || job.status !== "succeeded" || downloading.value || !props.ready) return;
  const retained = () => jobs.value.some((item) => item.id === job.id);
  downloading.value = job.id;
  notice.value = "";
  failure.value = "";
  try {
    const result = await downloadGoExportFile(props.api, job, () => {
      if (!props.ready || !props.session.permissions.can_download || !retained())
        throw new Error(unavailableMessage.value || t("Chen.GoV1SessionClosed"));
    });
    if (!retained()) return;
    notice.value = t(
      result === "saved"
        ? "Chen.ExportDownloaded"
        : result === "cancelled"
          ? "Chen.ExportCanceled"
          : "Chen.GoV1ExportDownloadStarted"
    );
  } catch (cause) {
    if (retained()) failure.value = chenErrorText(cause, t);
  } finally {
    downloading.value = null;
  }
}
function size(bytes: number) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KiB` : `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}
// Recover missed SSE updates while viewing a job; the event stream remains the normal progress path.
useIntervalFn(() => {
  if (open.value && props.ready) {
    for (const job of jobs.value) {
      if (exportNeedsSync(job)) emit("sync", job.id);
    }
  }
}, 3000);
</script>

<template>
  <UButton
    icon="i-lucide-download"
    :label="iconOnly ? undefined : t('Chen.ExportData')"
    :aria-label="t('Chen.ExportData')"
    size="xs"
    color="neutral"
    variant="ghost"
    :class="workspaceButtonClass"
    :disabled="!session.permissions.can_download || (!ready && !jobs.length)"
    :title="!ready ? unavailableMessage : t('Chen.ExportData')"
    @click="show"
  />
  <UModal v-model:open="open" :title="t('Chen.ExportData')" :ui="{ content: 'sm:max-w-2xl' }">
    <template #body>
      <div class="space-y-4 text-sm" data-chen-export-panel>
        <p v-if="!ready" class="text-warning">{{ unavailableMessage }}</p>
        <template v-if="ready && (snapshot.resultId || snapshot.sql)">
          <div class="flex flex-wrap gap-2">
            <UButton
              :label="
                t(
                  query.loadingSettings.mode === 'continuous'
                    ? 'Chen.GoBrowseExportLoaded'
                    : query.rows?.browse?.supported || query.rows?.query_page?.mode === 'database'
                      ? 'Chen.GoBrowseExportPage'
                      : 'Chen.GoV1ExportCached'
                )
              "
              :aria-pressed="mode === 'cached'"
              :variant="mode === 'cached' ? 'soft' : 'ghost'"
              color="neutral"
              @click="mode = 'cached'"
            />
            <UButton
              :label="
                t(
                  query.rows?.query_page?.mode === 'database'
                    ? 'Chen.GoQueryPageExportFull'
                    : query.browseObject
                      ? 'Chen.GoBrowseExportFull'
                      : 'Chen.GoV1ExportFull'
                )
              "
              :aria-pressed="mode === 'query'"
              :variant="mode === 'query' ? 'soft' : 'ghost'"
              color="neutral"
              :disabled="!!query.pendingCachedExport || (!!query.browseObject && !query.rows?.browse?.supported)"
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
            <p class="text-warning">
              {{ t(query.browseObject ? "Chen.GoBrowseExportConfirm" : "Chen.GoV1ExportFullConfirm") }}
            </p>
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
          <details class="text-xs text-muted">
            <summary class="w-fit cursor-pointer">{{ t("Common.More") }}</summary>
            <div class="mt-2 space-y-2">
              <p v-if="format === 'csv'">{{ t("Chen.GoV1ExportCsvFormat") }}</p>
              <p v-if="format === 'xlsx'">{{ t("Chen.GoV1ExportXlsxLimits") }}</p>
              <p v-if="format === 'xlsx'">{{ t("Chen.GoV1ExportXlsxPrecision") }}</p>
            </div>
          </details>
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
        <div v-for="job in jobs" :key="job.id" class="space-y-2 rounded border border-default p-3" aria-live="polite">
          <div class="flex items-center gap-2">
            <UIcon
              :name="
                exportActive(job) ? 'i-lucide-loader-circle' : job.ready ? 'i-lucide-file-check' : 'i-lucide-file-x'
              "
              :class="{ 'animate-spin': exportActive(job) }"
            />
            <strong>
              {{ job.format.toUpperCase() }} ·
              {{ t(job.mode === "query" ? "Chen.GoV1ExportFull" : "Chen.GoV1ExportCached") }}
            </strong>
            <span class="ml-auto">
              {{ t(job.status === "expired" ? "Chen.GoV1ExportExpired" : `Chen.GoV1Status_${job.status}`) }}
            </span>
          </div>
          <p v-if="job.filename" class="break-all text-muted">{{ job.filename }}</p>
          <p>{{ t("Chen.GoV1ExportProgress", { rows: job.rows.toLocaleString(), size: size(job.bytes) }) }}</p>
          <p v-if="job.limits.max_duration_seconds" class="text-xs text-muted">
            {{ t("Chen.GoV1ExportDuration", { seconds: job.limits.max_duration_seconds }) }}
          </p>
          <p v-if="job.truncated" class="text-warning">{{ t("Chen.GoV1ExportIncomplete") }}</p>
          <p v-if="job.error" class="whitespace-pre-wrap break-words text-error">
            {{ chenErrorText(job.error, t) }}
          </p>
          <p v-if="job.expires_at" class="text-xs text-muted">
            {{ t("Chen.GoV1ExportExpires", { time: new Date(job.expires_at).toLocaleString() }) }}
          </p>
          <div class="flex gap-2">
            <UButton
              v-if="exportActive(job) && !closed"
              :label="t('Common.Cancel')"
              color="neutral"
              variant="soft"
              :disabled="!ready || !cancelSupported(job) || job.status === 'cancel_requested'"
              :title="!cancelSupported(job) ? t('Chen.GoV1CancelUnsupported') : undefined"
              @click="emit('cancel', job.id)"
            />
            <UButton
              v-if="job.ready && job.status === 'succeeded'"
              icon="i-lucide-download"
              :label="t('Chen.GoV1ExportDownload')"
              :disabled="!ready || !!downloading"
              :loading="downloading === job.id"
              @click="download(job)"
            />
            <UButton
              v-if="!exportActive(job) || closed"
              :label="t(closed ? 'Chen.GoV1ExportClear' : 'Chen.GoV1ExportRelease')"
              color="neutral"
              variant="ghost"
              :disabled="query.exportBusy"
              @click="emit('remove', job.id)"
            />
          </div>
        </div>
        <p v-if="notice" class="text-muted">{{ notice }}</p>
        <p v-if="failure" class="text-error">{{ failure }}</p>
      </div>
    </template>
  </UModal>
</template>
