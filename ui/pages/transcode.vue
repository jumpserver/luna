<script setup lang="ts">
import type { FilenameStyle, OutputResolution, TranscodePower, TranscodeTaskStatus } from "~/store/modules/transcode";
import { storeToRefs } from "pinia";
import { desktopDialog, desktopInvoke, desktopOpener } from "~/shared/desktop/bridge";
import { useTranscodeStore } from "~/store/modules/transcode";

definePageMeta({
  layout: "default"
});

const { t } = useI18n();
const toast = useToast();
const { addErrorToast } = useErrorToast();
const { isWindows } = usePlatform();
const { openSettings: openApplicationSettings } = useSettingsWindow();
const ffmpegInstalled = ref<boolean | null>(null);
const optionsOpen = ref(false);

const refreshFfmpegStatus = async () => {
  if (!isDesktopRuntime()) return;
  const status = await desktopInvoke<{ installed: boolean }>("get_ffmpeg_plugin_status");
  ffmpegInstalled.value = status.installed;
};

onMounted(refreshFfmpegStatus);

const store = useTranscodeStore();
const {
  archivePaths,
  outputDir,
  filenameStyle,
  outputResolution,
  transcodePower,
  isTranscoding,
  taskItems,
  processingCount,
  completedCount,
  canStart,
  outputDirAuthorized
} = storeToRefs(store);

const toPickedPaths = (value: string | string[] | null) => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return t("Transcode.UnknownError");
};

const openOutputFile = async (output: string) => {
  if (!output) return;
  try {
    await desktopOpener.openPath(output);
  } catch (error) {
    addErrorToast({
      title: t("Transcode.OpenFailed"),
      description: getErrorMessage(error),
      icon: "line-md:close-circle",
      progress: true,
      duration: 3000
    });
  }
};

const openOutputDir = async () => {
  if (!outputDir.value) return;
  try {
    await desktopOpener.openPath(outputDir.value);
  } catch (error) {
    addErrorToast({
      title: t("Transcode.OpenFailed"),
      description: getErrorMessage(error),
      icon: "line-md:close-circle",
      progress: true,
      duration: 3000
    });
  }
};

const statusLabelMap: Record<TranscodeTaskStatus, string> = {
  pending: "Transcode.StatusPending",
  queued: "Transcode.StatusQueued",
  processing: "Transcode.StatusProcessing",
  success: "Transcode.StatusSuccess",
  error: "Transcode.StatusFailed"
};

const statusColorMap: Record<TranscodeTaskStatus, "neutral" | "primary" | "success" | "error" | "warning"> = {
  pending: "neutral",
  queued: "warning",
  processing: "primary",
  success: "success",
  error: "error"
};

const getStatusLabel = (status: TranscodeTaskStatus) => t(statusLabelMap[status]);
const getStatusColor = (status: TranscodeTaskStatus): "neutral" | "primary" | "success" | "error" | "warning" =>
  statusColorMap[status];

const formatDuration = (seconds?: number | null): string => {
  if (seconds == null || seconds <= 0) return "";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
};

const pickArchives = async (append = false) => {
  try {
    const selected = await desktopDialog.open({
      multiple: true,
      filters: [{ name: t("Transcode.ReplayArchiveFile"), extensions: ["tar"] }]
    });
    const nextPaths = toPickedPaths(selected);
    if (!nextPaths.length) return;
    if (append) store.appendArchives(nextPaths);
    else store.setArchives(nextPaths);
  } catch (error) {
    addErrorToast({
      title: t("Transcode.SelectArchivesFailed"),
      description: getErrorMessage(error),
      icon: "line-md:close-circle",
      progress: true,
      duration: 4000
    });
  }
};

const pickArchivesSmart = async () => {
  if (isTranscoding.value) return;
  await pickArchives(taskItems.value.length > 0);
};

const pickOutputDir = async (): Promise<boolean> => {
  try {
    const selected = await desktopDialog.open({ directory: true, multiple: false });
    if (typeof selected !== "string") return false;
    store.setOutputDir(selected);
    return true;
  } catch (error) {
    addErrorToast({
      title: t("Transcode.SelectOutputDirFailed"),
      description: getErrorMessage(error),
      icon: "line-md:close-circle",
      progress: true,
      duration: 4000
    });
    return false;
  }
};

const filenameStyleItems = computed(() => [
  { label: t("Transcode.FilenameOriginal"), value: "original" as FilenameStyle },
  { label: t("Transcode.FilenameFriendly"), value: "friendly" as FilenameStyle },
  { label: t("Transcode.FilenameFriendlyUuid"), value: "friendly_uuid" as FilenameStyle }
]);

const selectedFilenameStyle = computed<FilenameStyle>({
  get: () => filenameStyle.value,
  set: (val: FilenameStyle) => store.setFilenameStyle(val)
});

const outputResolutionItems = computed(() => [
  { label: t("Transcode.ResolutionOriginal"), value: "original" as OutputResolution },
  { label: t("Transcode.Resolution1080p"), value: "p1080" as OutputResolution },
  { label: t("Transcode.Resolution720p"), value: "p720" as OutputResolution },
  { label: t("Transcode.Resolution360p"), value: "p360" as OutputResolution }
]);

const selectedOutputResolution = computed<OutputResolution>({
  get: () => outputResolution.value,
  set: (val: OutputResolution) => store.setOutputResolution(val)
});

const transcodePowerItems = computed(() => {
  if (isWindows.value) return [{ label: t("Transcode.PowerAuto"), value: "auto" as TranscodePower }];
  return [
    { label: t("Transcode.PowerFull"), value: "full" as TranscodePower },
    { label: t("Transcode.PowerFast"), value: "fast" as TranscodePower },
    { label: t("Transcode.PowerMedium"), value: "medium" as TranscodePower },
    { label: t("Transcode.PowerLow"), value: "low" as TranscodePower }
  ];
});

const selectedTranscodePower = computed<TranscodePower>({
  get: () => transcodePower.value,
  set: (val: TranscodePower) => store.setTranscodePower(val)
});

const selectedOptionLabels = computed(() => {
  const findLabel = <T extends string>(items: Array<{ label: string; value: T }>, value: T) =>
    items.find((item) => item.value === value)?.label || "";
  return [
    findLabel(outputResolutionItems.value, outputResolution.value),
    findLabel(filenameStyleItems.value, filenameStyle.value),
    findLabel(transcodePowerItems.value, transcodePower.value)
  ]
    .filter(Boolean)
    .join(" · ");
});

watch(
  isWindows,
  (win) => {
    if (win) store.setTranscodePower("auto");
  },
  { immediate: true }
);

const beginTranscode = () => {
  store.startTranscode();
  toast.add({
    title: t("Transcode.Title"),
    description: t("Transcode.TranscodeStarted"),
    color: "primary",
    icon: "i-lucide-info",
    duration: 5000
  });
};

const handleStartTranscode = async () => {
  await refreshFfmpegStatus();
  if (!ffmpegInstalled.value) {
    await openApplicationSettings("/setting/general");
    return;
  }
  if ((!outputDir.value || !outputDirAuthorized.value) && !(await pickOutputDir())) return;
  beginTranscode();
};

const taskSummary = computed(() => {
  if (isTranscoding.value)
    return t("Transcode.InProgress", { processing: processingCount.value, total: taskItems.value.length });
  if (completedCount.value)
    return t("Transcode.CompletedCount", { completed: completedCount.value, total: taskItems.value.length });
  if (taskItems.value.length) return t("Transcode.SelectedArchives", { count: taskItems.value.length });
  return "";
});

const startLabel = computed(() =>
  outputDir.value ? t("Transcode.Start") : `${t("Transcode.SelectOutputDir")} · ${t("Transcode.Start")}`
);
</script>

<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--app-surface-canvas)]">
    <div class="flex shrink-0 flex-col gap-3 px-4 pt-4">
      <UAlert
        v-if="ffmpegInstalled === false"
        color="warning"
        variant="soft"
        icon="i-lucide-package-plus"
        :title="t('Transcode.FfmpegRequired')"
        :description="t('Transcode.FfmpegRequiredDescription')"
        :actions="[
          {
            label: t('Transcode.OpenPluginSettings'),
            color: 'warning',
            variant: 'soft',
            onClick: () => openApplicationSettings('/setting/general')
          }
        ]"
      />

      <div class="flex min-h-8 items-center justify-between gap-3">
        <div class="flex min-w-0 items-center gap-1">
          <UButton
            icon="i-lucide-plus"
            color="neutral"
            variant="ghost"
            size="sm"
            :disabled="isTranscoding"
            @click="pickArchivesSmart"
          >
            {{ t("Transcode.SelectArchives") }}
          </UButton>
          <UButton
            icon="i-lucide-trash-2"
            color="neutral"
            variant="ghost"
            size="sm"
            :disabled="isTranscoding || !archivePaths.length"
            @click="store.clearArchives()"
          >
            {{ t("Transcode.ClearArchives") }}
          </UButton>
        </div>

        <span v-if="taskSummary" class="truncate text-xs tabular-nums text-[var(--app-muted)]">
          {{ taskSummary }}
        </span>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-hidden px-4 pb-3 pt-1">
      <div v-if="taskItems.length" class="h-full space-y-2 overflow-y-auto pr-1">
        <article
          v-for="item in taskItems"
          :key="`${item.path}-${item.index}`"
          class="grid grid-cols-[2rem_minmax(0,1fr)_auto] gap-3 rounded-md border border-[var(--app-border)] bg-[var(--app-surface-card)] px-3 py-2.5"
        >
          <div
            class="mt-0.5 grid size-8 place-items-center rounded-md bg-[var(--app-surface-input)] text-[var(--app-muted)]"
            :class="{
              'bg-success/10 text-success': item.status === 'success',
              'bg-error/10 text-error': item.status === 'error',
              'bg-primary/10 text-primary': item.status === 'processing'
            }"
          >
            <UIcon
              :name="
                item.status === 'success'
                  ? 'i-lucide-check-circle-2'
                  : item.status === 'error'
                    ? 'i-lucide-circle-x'
                    : item.status === 'processing'
                      ? 'i-lucide-loader-circle'
                      : 'i-lucide-file-archive'
              "
              class="size-4"
              :class="item.status === 'processing' ? 'animate-spin' : undefined"
            />
          </div>

          <div class="min-w-0">
            <div class="flex items-center gap-1.5">
              <p class="min-w-0 flex-1 truncate text-sm font-medium text-[var(--app-fg)]">
                {{ item.displayName }}
              </p>
              <TranscodeMetaPopover v-if="item.metadata" :metadata="item.metadata" />
            </div>

            <p v-if="item.metadata" class="mt-0.5 truncate text-xs text-[var(--app-muted)]">
              {{ item.metadata.user }} · {{ item.metadata.asset }} · {{ item.metadata.account }}
            </p>
            <p v-else-if="item.message" class="mt-0.5 truncate text-xs text-[var(--app-muted)]">
              {{ item.message }}
            </p>

            <div v-if="item.status === 'processing'" class="mt-2 flex items-center gap-2">
              <UProgress :value="Math.round(item.progress * 100) / 100" size="sm" class="flex-1" />
              <span class="w-11 text-right text-xs tabular-nums text-[var(--app-muted)]">
                {{ Math.round(item.progress * 100) / 100 }}%
              </span>
            </div>

            <div
              v-if="item.output"
              class="mt-2 flex min-w-0 items-center gap-2 rounded-md bg-[var(--app-surface-input)] px-2.5 py-1.5 text-xs"
            >
              <span class="shrink-0 text-[var(--app-muted)]">{{ t("Transcode.OutputFile") }}</span>
              <button
                type="button"
                class="min-w-0 truncate text-left text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                @click="openOutputFile(item.output)"
              >
                {{ item.output }}
              </button>
            </div>

            <div v-if="item.error" class="mt-2 rounded-md bg-error/10 px-2.5 py-1.5 text-xs text-error">
              <span class="font-medium">{{ t("Transcode.ErrorDetail") }}</span>
              <span class="ml-1 break-all">{{ item.error }}</span>
            </div>
          </div>

          <div class="flex shrink-0 items-center gap-1">
            <UBadge
              v-if="item.status === 'success' && item.duration != null"
              color="neutral"
              variant="subtle"
              size="sm"
            >
              {{ formatDuration(item.duration) }}
            </UBadge>
            <UBadge :color="getStatusColor(item.status)" variant="soft" size="sm">
              {{ getStatusLabel(item.status) }}
            </UBadge>
            <UButton
              v-if="item.status !== 'processing' && !isTranscoding"
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              :aria-label="t('Transcode.ClearArchives')"
              @click="store.removeArchive(item.path)"
            />
          </div>
        </article>
      </div>

      <div
        v-else
        class="flex h-full min-h-40 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-[var(--app-border)] bg-[var(--app-surface-panel)] px-6 text-center"
      >
        <UIcon name="i-lucide-file-archive" class="size-6 text-[var(--app-muted)]" />
        <p class="text-sm font-medium text-[var(--app-fg)]">
          {{ t("Transcode.EmptyArchives") }}
        </p>
        <p class="max-w-md text-xs leading-5 text-[var(--app-muted)]">
          {{ t("Transcode.Description") }}
        </p>
        <UButton icon="i-lucide-plus" color="neutral" variant="ghost" size="sm" @click="pickArchivesSmart">
          {{ t("Transcode.SelectArchives") }}
        </UButton>
      </div>
    </div>

    <footer class="shrink-0 border-t border-[var(--app-border)] bg-[var(--app-surface-footer)] px-4 py-2.5">
      <div class="flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
        <div class="flex min-w-0 flex-1 items-center gap-2">
          <UIcon name="i-lucide-folder-output" class="size-4 shrink-0 text-[var(--app-muted)]" />
          <div class="min-w-0 flex-1">
            <p class="text-xs text-[var(--app-muted)]">{{ t("Transcode.OutputDirectory") }}</p>
            <button
              v-if="!outputDir"
              type="button"
              class="max-w-full truncate text-left text-xs text-warning hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              :disabled="isTranscoding"
              @click="pickOutputDir"
            >
              {{ t("Transcode.OutputDirPlaceholder") }}
            </button>
            <p v-else class="truncate font-mono text-xs text-[var(--app-fg)]" :title="outputDir">
              {{ outputDir }}
            </p>
          </div>
          <UButton
            v-if="outputDir"
            color="neutral"
            variant="ghost"
            size="xs"
            :disabled="isTranscoding"
            @click="pickOutputDir"
          >
            {{ t("Transcode.SelectOutputDir") }}
          </UButton>
          <UButton
            v-if="outputDir"
            icon="i-lucide-folder-open"
            color="neutral"
            variant="ghost"
            size="xs"
            :disabled="isTranscoding"
            :aria-label="t('Transcode.OpenFile')"
            @click="openOutputDir"
          />
        </div>

        <div class="flex shrink-0 items-center gap-2">
          <UPopover v-model:open="optionsOpen" :content="{ align: 'end', side: 'top', sideOffset: 8 }">
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              icon="i-lucide-sliders-horizontal"
              :disabled="isTranscoding"
              :label="t('Transcode.Settings')"
            />

            <template #content>
              <div class="w-72 space-y-3 p-3">
                <UFormField :label="t('Transcode.OutputResolution')">
                  <USelect
                    v-model="selectedOutputResolution"
                    :items="outputResolutionItems"
                    value-key="value"
                    class="w-full"
                  />
                </UFormField>
                <UFormField :label="t('Transcode.FilenameStyle')">
                  <USelect
                    v-model="selectedFilenameStyle"
                    :items="filenameStyleItems"
                    value-key="value"
                    class="w-full"
                  />
                </UFormField>
                <UFormField :label="t('Transcode.TranscodePower')">
                  <USelect
                    v-model="selectedTranscodePower"
                    :items="transcodePowerItems"
                    value-key="value"
                    class="w-full"
                    :disabled="isWindows"
                  />
                </UFormField>
                <p v-if="isWindows" class="text-xs text-[var(--app-muted)]">
                  {{ t("Transcode.PowerAutoHint") }}
                </p>
              </div>
            </template>
          </UPopover>

          <span v-if="selectedOptionLabels" class="whitespace-nowrap text-xs text-[var(--app-muted)]">
            {{ selectedOptionLabels }}
          </span>

          <UButton
            v-if="isTranscoding"
            icon="i-lucide-loader-circle"
            color="primary"
            variant="soft"
            size="sm"
            disabled
            class="cursor-not-allowed"
          >
            {{ t("Transcode.Running") }}
          </UButton>
          <UButton
            v-else
            icon="i-lucide-play"
            color="primary"
            variant="solid"
            size="sm"
            :disabled="!canStart || ffmpegInstalled === false"
            @click="handleStartTranscode"
          >
            {{ startLabel }}
          </UButton>
        </div>
      </div>
    </footer>
  </div>
</template>
