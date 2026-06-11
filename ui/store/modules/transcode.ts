import type { UnlistenFn } from "@tauri-apps/api/event";

export type TranscodeTaskStatus = "pending" | "queued" | "processing" | "success" | "error";
export type FilenameStyle = "original" | "friendly" | "friendly_uuid";
export type OutputResolution = "original" | "p1080" | "p720" | "p360";

export interface ReplayMetadata {
  id: string
  user: string
  asset: string
  account: string
  login_from: string
  remote_addr: string
  protocol: string
  date_start: string
  date_end: string
  org_id: string
  user_id: string
  asset_id: string
  account_id: string
  recording_type: string
  files: unknown[]
}

export interface TranscodeProgressPayload {
  file: string
  index: number
  total: number
  progress: number
  message: string
  success?: boolean | null
  output?: string | null
  metadata?: ReplayMetadata | null
  duration?: number | null
}

export interface TranscodeResult {
  id: string
  input: string
  output: string
  success: boolean
  error?: string
  metadata?: ReplayMetadata | null
}

export interface TranscodeTaskItem {
  index: number
  path: string
  displayName: string
  progress: number
  message: string
  status: TranscodeTaskStatus
  output: string
  error: string
  metadata: ReplayMetadata | null
  duration?: number | null
}

let listenerRegistered = false;

export const useTranscodeStore = defineStore(
  "transcode",
  () => {
    const { t } = useI18n();
    const toast = useToast();

    const archivePaths = ref<string[]>([]);
    const outputDir = ref("");
    const filenameStyle = ref<FilenameStyle>("original");
    const outputResolution = ref<OutputResolution>("original");
    const isTranscoding = ref(false);
    const taskItems = ref<TranscodeTaskItem[]>([]);
    const pendingPaths = ref<string[]>([]);
    const currentBatchOffset = ref(0);
    const unlistenProgress = ref<UnlistenFn | null>(null);

    const queuedCount = computed(
      () => taskItems.value.filter((item) => item.status === "queued").length
    );
    const totalProgress = computed(() => {
      const active = taskItems.value.filter((item) => item.status !== "queued");
      if (!active.length) return 0;
      const sum = active.reduce((acc, item) => acc + (item.progress || 0), 0);
      return Math.round(sum / active.length);
    });
    const successCount = computed(
      () => taskItems.value.filter((item) => item.status === "success").length
    );
    const failedCount = computed(
      () => taskItems.value.filter((item) => item.status === "error").length
    );
    const processingCount = computed(
      () => taskItems.value.filter((item) => item.status === "processing").length
    );
    const completedCount = computed(() => successCount.value + failedCount.value);
    const canStart = computed(
      () =>
        taskItems.value.some((item) => item.status === "pending") &&
        !isTranscoding.value
    );

    const getDisplayName = (path: string) => path.split(/[\\/]/).pop() || path;

    const buildTaskItem = (
      path: string,
      index: number,
      previous?: TranscodeTaskItem
    ): TranscodeTaskItem => ({
      index,
      path,
      displayName: getDisplayName(path),
      progress: previous?.progress ?? 0,
      message: previous?.message ?? t("Transcode.Waiting"),
      status: previous?.status ?? "pending",
      output: previous?.output ?? "",
      error: previous?.error ?? "",
      metadata: previous?.metadata ?? null
    });

    const buildQueuedTask = (path: string, index: number): TranscodeTaskItem => ({
      index,
      path,
      displayName: getDisplayName(path),
      progress: 0,
      message: t("Transcode.StatusQueued"),
      status: "queued",
      output: "",
      error: "",
      metadata: null
    });

    const rebuildTaskItems = (paths: string[]) => {
      const previous = new Map(taskItems.value.map((item) => [item.path, item]));
      taskItems.value = paths.map((path, index) =>
        buildTaskItem(path, index, previous.get(path))
      );
    };

    const patchTaskItem = (index: number, patch: Partial<TranscodeTaskItem>) => {
      const current = taskItems.value[index];
      if (!current) return;
      taskItems.value[index] = { ...current, ...patch };
    };

    const markTaskCompleted = (
      index: number,
      success: boolean,
      output: string,
      message: string,
      metadata: ReplayMetadata | null,
      duration?: number | null
    ) => {
      const current = taskItems.value[index];
      if (!current) return;
      if (current.status === "success" || current.status === "error") return;
      taskItems.value[index] = {
        ...current,
        progress: 100,
        status: success ? "success" : "error",
        output: output || current.output,
        message,
        error: success ? "" : message,
        metadata: metadata ?? current.metadata,
        duration: duration ?? null
      };
    };

    const setArchives = (paths: string[]) => {
      if (isTranscoding.value) return;
      archivePaths.value = paths;
      rebuildTaskItems(paths);
    };

    const appendArchives = (newPaths: string[]) => {
      if (isTranscoding.value) {
        const current = new Set([...archivePaths.value, ...pendingPaths.value]);
        const next = newPaths.filter((p) => !current.has(p));
        if (!next.length) return;
        pendingPaths.value = [...pendingPaths.value, ...next];
        const base = taskItems.value.length;
        const queuedItems = next.map((path, i) => buildQueuedTask(path, base + i));
        taskItems.value = [...taskItems.value, ...queuedItems];
        console.info(
          "[transcode] append (queued): added=%d pending=%d taskItems=%d",
          next.length,
          pendingPaths.value.length,
          taskItems.value.length
        );
        return;
      }
      const existingPaths = taskItems.value.map((item) => item.path);
      const next = Array.from(new Set([...existingPaths, ...newPaths]));
      archivePaths.value = next;
      rebuildTaskItems(next);
    };

    const removeArchive = (path: string) => {
      const queuedIndex = pendingPaths.value.indexOf(path);
      if (queuedIndex !== -1) {
        pendingPaths.value = pendingPaths.value.filter((p) => p !== path);
        taskItems.value = taskItems.value.filter((item) => item.path !== path);
        return;
      }
      const task = taskItems.value.find((item) => item.path === path);
      if (task?.status === "processing") return;
      archivePaths.value = archivePaths.value.filter((p) => p !== path);
      rebuildTaskItems(archivePaths.value);
    };

    const clearArchives = () => {
      if (isTranscoding.value) return;
      archivePaths.value = [];
      taskItems.value = [];
      pendingPaths.value = [];
    };

    const flushQueue = () => {
      if (!pendingPaths.value.length) return false;
      const paths = [...pendingPaths.value];
      const queuedSet = new Set(paths);
      const completed = taskItems.value.filter(
        (item) => !queuedSet.has(item.path) && (item.status === "success" || item.status === "error")
      );
      pendingPaths.value = [];
      archivePaths.value = paths;
      taskItems.value = [
        ...completed,
        ...paths.map((path, index) => buildTaskItem(path, completed.length + index))
      ];
      console.info(
        "[transcode] flushQueue: nextBatch=%d completed=%d taskItems=%d",
        paths.length,
        completed.length,
        taskItems.value.length
      );
      return true;
    };

    const tryAdvanceQueue = (reason: string): boolean => {
      const stats = taskItems.value.reduce(
        (acc, item) => {
          acc[item.status] = (acc[item.status] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );
      console.info(
        "[transcode] tryAdvanceQueue(%s): pending=%d queued=%d processing=%d success=%d error=%d queueLen=%d",
        reason,
        stats.pending ?? 0,
        stats.queued ?? 0,
        stats.processing ?? 0,
        stats.success ?? 0,
        stats.error ?? 0,
        pendingPaths.value.length
      );

      const inFlight = (stats.pending ?? 0) + (stats.processing ?? 0);
      if (inFlight > 0) {
        console.warn(
          "[transcode] batch still has in-flight items; chain will NOT advance. pending=%d processing=%d",
          stats.pending ?? 0,
          stats.processing ?? 0
        );
        return false;
      }

      const queuedItems = taskItems.value.filter((item) => item.status === "queued");
      if (!queuedItems.length) {
        console.info("[transcode] no queued items to promote");
        return false;
      }

      const completed = taskItems.value.filter(
        (item) => item.status === "success" || item.status === "error"
      );
      archivePaths.value = queuedItems.map((item) => item.path);
      const promoted = queuedItems.map((item, index) =>
        buildTaskItem(item.path, completed.length + index)
      );
      taskItems.value = [...completed, ...promoted];
      currentBatchOffset.value = completed.length;
      console.info(
        "[transcode] promoted %d queued item(s) to pending; completed=%d offset=%d",
        promoted.length,
        completed.length,
        currentBatchOffset.value
      );
      return true;
    };

    const setOutputDir = (dir: string) => {
      outputDir.value = dir;
    };

    const setFilenameStyle = (style: FilenameStyle) => {
      filenameStyle.value = style;
    };

    const setOutputResolution = (resolution: OutputResolution) => {
      outputResolution.value = resolution;
    };

    const findTaskIndexByFile = (file: string): number => {
      if (!file) return -1;
      return taskItems.value.findIndex(
        (item) => item.displayName === file || item.path === file || item.path.endsWith(`/${file}`) || item.path.endsWith(`\\${file}`)
      );
    };

    const handleProgressEvent = (payload: TranscodeProgressPayload) => {
      let targetIndex = -1;

      if (typeof payload.index === "number") {
        const global = currentBatchOffset.value + payload.index;
        const candidate = taskItems.value[global];
        if (
          candidate &&
          candidate.status !== "success" &&
          candidate.status !== "error"
        ) {
          targetIndex = global;
        }
      }

      if (targetIndex === -1) {
        targetIndex = taskItems.value.findIndex((item) => {
          if (item.status === "success" || item.status === "error") return false;
          const base = item.path.split(/[\\/]/).pop() || "";
          return (
            item.displayName === payload.file ||
            item.path === payload.file ||
            item.path.endsWith(`/${payload.file}`) ||
            item.path.endsWith(`\\${payload.file}`) ||
            base === payload.file ||
            base === `${payload.file}.tar`
          );
        });
      }

      if (targetIndex === -1) return;

      const successFlag = payload.success;
      const outputValue = payload.output || "";
      const incomingMetadata = payload.metadata ?? null;
      const incomingDuration = payload.duration ?? null;

      if (successFlag === true || successFlag === false) {
        const message = successFlag
          ? t("Transcode.Completed")
          : payload.message || t("Transcode.StatusFailed");
        markTaskCompleted(targetIndex, successFlag, outputValue, message, incomingMetadata, incomingDuration);
        return;
      }

      patchTaskItem(targetIndex, {
        progress: Math.max(0, Math.min(100, payload.progress)),
        message: payload.message,
        status: "processing",
        ...(incomingMetadata ? { metadata: incomingMetadata } : {})
      });
    };

    const findTaskIndexForResult = (result: TranscodeResult): number => {
      if (result.input) {
        const byInput = taskItems.value.findIndex(
          (item) =>
            item.path === result.input &&
            item.status !== "success" &&
            item.status !== "error"
        );
        if (byInput !== -1) return byInput;
      }

      const byPath = taskItems.value.findIndex(
        (item) =>
          item.status !== "success" &&
          item.status !== "error" &&
          (item.path === result.id ||
            item.displayName === result.id ||
            item.path.endsWith(`/${result.id}`) ||
            item.path.endsWith(`\\${result.id}`))
      );
      if (byPath !== -1) return byPath;

      if (result.metadata?.id) {
        const sessionId = result.metadata.id;
        return taskItems.value.findIndex((item) => {
          if (item.status === "success" || item.status === "error") return false;
          const base = item.path.split(/[\\/]/).pop() || "";
          return (
            item.path === sessionId ||
            base === sessionId ||
            base === `${sessionId}.tar`
          );
        });
      }
      return -1;
    };

    const applyBatchResults = (results: TranscodeResult[]) => {
      let matched = 0;
      let unmatched = 0;
      results.forEach((result) => {
        const targetIndex = findTaskIndexForResult(result);
        if (targetIndex === -1) {
          unmatched += 1;
          console.warn(
            "[transcode] applyBatchResults: no task matched id=%s input=%s",
            result.id,
            result.input
          );
          return;
        }
        matched += 1;
        markTaskCompleted(
          targetIndex,
          result.success,
          result.output,
          result.success
            ? t("Transcode.Completed")
            : result.error || t("Transcode.StatusFailed"),
          result.metadata ?? null
        );
      });
      console.info(
        "[transcode] applyBatchResults: matched=%d unmatched=%d total=%d",
        matched,
        unmatched,
        results.length
      );
    };

    const markAllPendingAsError = (message: string) => {
      taskItems.value.forEach((item, index) => {
        if (item.status === "success" || item.status === "error") return;
        taskItems.value[index] = {
          ...item,
          status: "error",
          error: message,
          message
        };
      });
      pendingPaths.value = [];
    };

    watch(
      () => completedCount.value,
      (completed) => {
        const total = taskItems.value.length;
        if (total === 0) return;
        if (completed < total) return;
        if (!isTranscoding.value) return;
        if (pendingPaths.value.length > 0) return;
        const failed = failedCount.value;
        const succeeded = successCount.value;
        toast.add({
          title: failed > 0 ? t("Transcode.CompletedWithErrors") : t("Transcode.CompletedAll"),
          description:
            failed > 0
              ? t("Transcode.CompletedSummaryWithErrors", {
                  success: succeeded,
                  failed
                })
              : t("Transcode.CompletedSummary", { count: succeeded }),
          color: failed > 0 ? "error" : "primary",
          icon: failed > 0 ? "line-md:close-circle" : "line-md:check-all",
          progress: failed > 0,
          duration: 4000
        });
      }
    );

    const registerProgressListener = async () => {
      if (listenerRegistered) return;
      listenerRegistered = true;
      unlistenProgress.value = await useTauriEventListen(
        "transcode-progress",
        (event) => {
          handleProgressEvent(event.payload as TranscodeProgressPayload);
        }
      );
    };

    void registerProgressListener();

    const startTranscode = async (options?: { chained?: boolean }) => {
      if (!options?.chained) {
        const pendingItems = taskItems.value.filter(
          (item) => item.status === "pending"
        );
        if (!pendingItems.length) {
          console.warn(
            "[transcode] startTranscode: no pending tasks, skipping"
          );
          return;
        }
      }

      if (!outputDir.value) {
        toast.add({
          title: t("Transcode.SelectOutputDirFirst"),
          color: "error",
          icon: "line-md:close-circle",
          progress: true,
          duration: 3000
        });
        return;
      }

      isTranscoding.value = true;
      if (!options?.chained) {
        const pendingItems = taskItems.value.filter(
          (item) => item.status === "pending"
        );
        archivePaths.value = pendingItems.map((item) => item.path);
        // Offset = number of completed tasks before the first pending task
        const firstPendingIndex = taskItems.value.findIndex(
          (item) => item.status === "pending"
        );
        currentBatchOffset.value = firstPendingIndex >= 0 ? firstPendingIndex : 0;
      }

      if (!archivePaths.value.length) {
        console.warn(
          "[transcode] startTranscode: archivePaths empty after filter, skipping"
        );
        isTranscoding.value = false;
        return;
      }

      console.info(
        "[transcode] startTranscode: batch=%d chained=%s offset=%d",
        archivePaths.value.length,
        String(!!options?.chained),
        currentBatchOffset.value
      );

      try {
        try {
          const results = (await useTauriCoreInvoke("transcode_replays", {
            tarPaths: archivePaths.value,
            outputDir: outputDir.value,
            filenameStyle: filenameStyle.value,
            outputResolution: outputResolution.value
          })) as TranscodeResult[];

          console.info(
            "[transcode] batch returned: results=%d",
            results.length
          );
          applyBatchResults(results);
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : typeof error === "string"
                ? error
                : t("Transcode.UnknownError");

          markAllPendingAsError(message);

          toast.add({
            title: t("Transcode.StartFailed"),
            description: message,
            color: "error",
            icon: "line-md:close-circle",
            progress: true,
            duration: 4000
          });
        }

        const chained = tryAdvanceQueue("post-batch");
        if (!chained) {
          console.info("[transcode] queue empty; ending chain");
          return;
        }

        // Hand off to the next batch. The finally block runs on the current
        // invocation regardless, so isTranscoding stays true throughout the
        // chain.
        console.info("[transcode] chaining into next batch");
        await startTranscode({ chained: true });
      } finally {
        isTranscoding.value = false;
      }
    };

    return {
      archivePaths,
      outputDir,
      filenameStyle,
      outputResolution,
      isTranscoding,
      taskItems,
      pendingPaths,
      totalProgress,
      successCount,
      failedCount,
      processingCount,
      queuedCount,
      completedCount,
      canStart,
      setArchives,
      appendArchives,
      removeArchive,
      clearArchives,
      setOutputDir,
      setFilenameStyle,
      setOutputResolution,
      applyBatchResults,
      markAllPendingAsError,
      startTranscode
    };
  }
);
