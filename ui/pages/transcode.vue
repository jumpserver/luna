<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useTranscodeStore } from "~/store/modules/transcode";
import type { FilenameStyle, OutputResolution } from "~/store/modules/transcode";

definePageMeta({
  layout: "default"
});

const { t } = useI18n();
const toast = useToast();

const store = useTranscodeStore();
const {
  archivePaths,
  outputDir,
  filenameStyle,
  outputResolution,
  isTranscoding,
  taskItems,
  totalProgress,
  successCount,
  failedCount,
  processingCount,
  completedCount,
  queuedCount,
  canStart
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
    await useTauriOpenerOpenPath(output);
  } catch (error) {
    toast.add({
      title: t("Transcode.OpenFailed"),
      description: getErrorMessage(error),
      color: "error",
      icon: "line-md:close-circle",
      progress: true,
      duration: 3000
    });
  }
};

const statusLabelMap: Record<string, string> = {
  pending: "Transcode.StatusPending",
  queued: "Transcode.StatusQueued",
  processing: "Transcode.StatusProcessing",
  success: "Transcode.StatusSuccess",
  error: "Transcode.StatusFailed"
};

const statusColorMap: Record<string, "neutral" | "primary" | "success" | "error" | "warning"> = {
  pending: "neutral",
  queued: "warning",
  processing: "primary",
  success: "success",
  error: "error"
};

const getStatusLabel = (status: string) => t(statusLabelMap[status]);
const getStatusColor = (status: string): "neutral" | "primary" | "success" | "error" | "warning" =>
  statusColorMap[status];

const formatDuration = (seconds?: number | null): string => {
  if (seconds == null || seconds <= 0) return "";
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
};

const hasTasks = computed(() => taskItems.value.length > 0);
const hasActiveTasks = computed(() => processingCount.value > 0 || completedCount.value > 0);
const hasPendingOrActiveTasks = computed(() =>
  taskItems.value.some((item) => item.status === "pending" || item.status === "processing" || item.status === "queued")
);

const pickArchivesSmart = async () => {
  const append = hasPendingOrActiveTasks.value;
  if (!append && taskItems.value.length > 0) {
    store.clearArchives();
  }
  await pickArchives(append);
};

const pickArchives = async (append = false) => {
  try {
    const selected = (await useTauriDialogOpen({
      multiple: true,
      filters: [{ name: "Replay Archive", extensions: ["tar"] }]
    })) as string | string[] | null;
    const nextPaths = toPickedPaths(selected);

    if (!nextPaths.length) return;

    if (append) {
      store.appendArchives(nextPaths);
    } else {
      store.setArchives(nextPaths);
    }
  } catch (error) {
    toast.add({
      title: t("Transcode.SelectArchivesFailed"),
      description: getErrorMessage(error),
      color: "error",
      icon: "line-md:close-circle",
      progress: true,
      duration: 4000
    });
  }
};

const pickOutputDir = async () => {
  try {
    const selected = (await useTauriDialogOpen({
      directory: true,
      multiple: false
    })) as string | null;

    if (selected) {
      store.setOutputDir(selected);
    }
  } catch (error) {
    toast.add({
      title: t("Transcode.SelectOutputDirFailed"),
      description: getErrorMessage(error),
      color: "error",
      icon: "line-md:close-circle",
      progress: true,
      duration: 4000
    });
  }
};

const settingsOpen = ref(false);
const confirmOpen = ref(false);

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

const openSettings = () => {
  settingsOpen.value = true;
};

const handleStartTranscode = () => {
  if (!outputDir.value) {
    confirmOpen.value = true;
    return;
  }
  store.startTranscode();
};

const confirmAndOpenSettings = () => {
  confirmOpen.value = false;
  settingsOpen.value = true;
};

const settingsError = ref("");

const handleSettingsConfirm = () => {
  if (!outputDir.value) {
    settingsError.value = t("Transcode.OutputDirRequired");
    return;
  }
  settingsError.value = "";
  settingsOpen.value = false;
};

watch(outputDir, () => {
  settingsError.value = "";
});
</script>

<template>
  <div class="h-full overflow-auto p-4">
    <div class="flex h-full flex-col gap-4">
      <UCard class="flex-1 min-h-0 flex flex-col" :ui="{ body: 'flex-1 min-h-0 overflow-hidden flex flex-col' }">
        <template #header>
          <div class="flex flex-col gap-3">
            <div class="flex items-center gap-3">
              <UIcon name="lucide:clapperboard" class="text-primary h-5 w-5 shrink-0" />
              <p class="text-base font-medium flex-1 min-w-0">
                {{ t("Transcode.Title") }}
              </p>

              <UTooltip :text="t('Transcode.Settings')">
                <UButton
                  icon="i-lucide-settings"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  @click="openSettings"
                />
              </UTooltip>

              <UButton v-if="isTranscoding" icon="i-lucide-loader" color="primary" variant="solid" size="sm" disabled>
                {{ t("Transcode.Running") }}
              </UButton>
              <UButton
                v-else
                icon="i-lucide-play"
                color="primary"
                variant="solid"
                size="sm"
                :disabled="!canStart"
                @click="handleStartTranscode"
              >
                {{ t("Transcode.Start") }}
              </UButton>
            </div>

            <p class="text-sm text-gray-500 dark:text-gray-400">
              {{ t("Transcode.Description") }}
            </p>

            <div v-if="hasActiveTasks || hasTasks" class="flex flex-wrap items-center gap-2">
              <UBadge v-if="hasActiveTasks" color="primary" variant="soft">
                {{ t("Transcode.TotalProgress", { progress: totalProgress }) }}
              </UBadge>

              <UBadge v-if="processingCount > 0" color="primary" variant="soft">
                {{ t("Transcode.InProgress", { processing: processingCount, total: taskItems.length }) }}
              </UBadge>

              <UBadge v-else-if="completedCount > 0" :color="failedCount > 0 ? 'error' : 'success'" variant="soft">
                {{ t("Transcode.CompletedCount", { completed: completedCount, total: taskItems.length }) }}
              </UBadge>

              <UBadge v-if="queuedCount > 0" color="warning" variant="soft">
                {{ t("Transcode.QueuedCount", { count: queuedCount }) }}
              </UBadge>

              <UBadge v-if="successCount > 0" color="success" variant="soft">
                {{ t("Transcode.SuccessCount", { count: successCount }) }}
              </UBadge>

              <UBadge v-if="failedCount > 0" color="error" variant="soft">
                {{ t("Transcode.FailedCount", { count: failedCount }) }}
              </UBadge>

              <UBadge v-if="!hasActiveTasks && hasTasks" color="neutral" variant="soft">
                {{ t("Transcode.NotStarted") }}
              </UBadge>
            </div>
          </div>
        </template>

        <div class="flex items-center justify-between mb-2">
          <UButton icon="i-lucide-plus" color="neutral" variant="ghost" size="xs" @click="pickArchivesSmart">
            {{ t("Transcode.SelectArchives") }}
          </UButton>
          <UButton
            icon="i-lucide-trash-2"
            color="neutral"
            variant="ghost"
            size="xs"
            :disabled="isTranscoding || !archivePaths.length"
            @click="store.clearArchives()"
          >
            {{ t("Transcode.ClearArchives") }}
          </UButton>
        </div>

        <div v-if="taskItems.length" class="flex-1 min-h-0 space-y-2 overflow-y-auto pr-1">
          <div
            v-for="item in taskItems"
            :key="`${item.path}-${item.index}`"
            class="rounded-lg border border-gray-200 px-3.5 py-3 dark:border-white/10"
          >
            <div class="flex items-start gap-3">
              <div
                class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                :class="
                  item.status === 'success'
                    ? 'bg-green-500/10 text-green-500'
                    : item.status === 'error'
                      ? 'bg-red-500/10 text-red-500'
                      : item.status === 'processing'
                        ? 'bg-primary/10 text-primary'
                        : 'bg-gray-500/10 text-gray-400'
                "
              >
                <UIcon
                  :name="
                    item.status === 'success'
                      ? 'lucide:check-circle'
                      : item.status === 'error'
                        ? 'lucide:x-circle'
                        : 'lucide:archive'
                  "
                  class="h-4 w-4"
                />
              </div>

              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <div class="flex items-center gap-1.5 flex-1 min-w-0">
                    <p class="truncate text-sm font-medium">
                      {{ item.displayName }}
                    </p>
                    <TranscodeMetaPopover v-if="item.metadata" :metadata="item.metadata" />
                  </div>

                  <div class="flex items-center gap-1.5 shrink-0">
                    <UBadge :color="getStatusColor(item.status)" variant="soft" size="sm">
                      {{ getStatusLabel(item.status) }}
                    </UBadge>

                    <UBadge
                      v-if="item.status === 'success' && item.duration != null"
                      color="neutral"
                      variant="soft"
                      size="sm"
                    >
                      耗时 {{ formatDuration(item.duration) }}
                    </UBadge>

                    <UButton
                      v-if="item.status !== 'processing'"
                      icon="i-lucide-x"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      @click="store.removeArchive(item.path)"
                    />
                  </div>
                </div>

                <p v-if="item.metadata" class="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
                  {{ item.metadata.user }} - {{ item.metadata.asset }} - {{ item.metadata.account }}
                </p>

                <div v-if="item.status === 'processing'" class="mt-2 flex flex-col items-center">
                  <div class="flex items-center gap-2 w-2/3">
                    <UProgress :value="Math.round(item.progress * 100) / 100" size="sm" class="flex-1" />
                    <span class="text-xs font-medium text-gray-500 dark:text-gray-400 w-12 text-right tabular-nums">
                      {{ Math.round(item.progress * 100) / 100 }}%
                    </span>
                  </div>
                </div>

                <div
                  v-if="item.output"
                  class="mt-2 flex items-center gap-2 rounded-md bg-gray-50 px-2.5 py-1.5 text-xs dark:bg-white/5"
                >
                  <span class="shrink-0 font-medium text-gray-500 dark:text-gray-400">
                    {{ t("Transcode.OutputFile") }}
                  </span>
                  <UTooltip :text="t('Transcode.OpenFile')">
                    <button
                      type="button"
                      class="flex min-w-0 items-center gap-1 text-left text-primary hover:underline focus:outline-none"
                      @click="openOutputFile(item.output)"
                    >
                      <UIcon name="lucide:play-circle" class="h-3.5 w-3.5 shrink-0" />
                      <span class="truncate">{{ item.output }}</span>
                    </button>
                  </UTooltip>
                </div>

                <div
                  v-if="item.error"
                  class="mt-2 rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-300"
                >
                  <span class="font-medium">{{ t("Transcode.ErrorDetail") }}</span>
                  <span class="ml-1 break-all">{{ item.error }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          v-else
          class="flex flex-1 items-center justify-center rounded-lg border border-dashed border-gray-200 text-sm text-gray-500 dark:border-white/10 dark:text-gray-400"
        >
          {{ t("Transcode.EmptyArchives") }}
        </div>
      </UCard>
    </div>

    <UModal v-model:open="settingsOpen" :title="t('Transcode.Settings')" :ui="{ footer: 'justify-end' }">
      <template #body>
        <div class="flex flex-col gap-4 p-2">
          <div>
            <label class="text-sm font-medium">{{ t("Transcode.OutputDirectory") }}</label>
            <div class="mt-2">
              <UInput v-model="outputDir" :placeholder="t('Transcode.OutputDirPlaceholder')" size="md" class="w-full" :disabled="isTranscoding">
                <template #trailing>
                  <UButton
                    color="neutral"
                    variant="link"
                    size="sm"
                    icon="i-lucide-folder"
                    :disabled="isTranscoding"
                    @click="pickOutputDir"
                  />
                </template>
              </UInput>
              <p v-if="settingsError" class="mt-1 text-xs text-red-500">
                {{ settingsError }}
              </p>
            </div>
          </div>

          <div>
            <label class="text-sm font-medium">{{ t("Transcode.FilenameStyle") }}</label>
            <USelect
              v-model="selectedFilenameStyle"
              :items="filenameStyleItems"
              value-key="value"
              class="mt-2 w-full"
              :disabled="isTranscoding"
            />
          </div>

          <div>
            <label class="text-sm font-medium">{{ t("Transcode.OutputResolution") }}</label>
            <USelect
              v-model="selectedOutputResolution"
              :items="outputResolutionItems"
              value-key="value"
              class="mt-2 w-full"
              :disabled="isTranscoding"
            />
          </div>
        </div>
      </template>

      <template #footer>
        <UButton color="primary" variant="solid" @click="handleSettingsConfirm">
          {{ t("Transcode.Confirm") }}
        </UButton>
      </template>
    </UModal>

    <UModal v-model:open="confirmOpen" :title="t('Transcode.Prompt')" :ui="{ footer: 'justify-end' }">
      <template #body>
        <p class="text-sm text-gray-500 dark:text-gray-400 p-2">
          {{ t("Transcode.SelectOutputDirFirst") }}
        </p>
      </template>

      <template #footer>
        <UButton color="neutral" variant="ghost" @click="confirmOpen = false">
          {{ t("Transcode.Cancel") }}
        </UButton>
        <UButton color="primary" variant="solid" @click="confirmAndOpenSettings">
          {{ t("Transcode.Confirm") }}
        </UButton>
      </template>
    </UModal>
  </div>
</template>
