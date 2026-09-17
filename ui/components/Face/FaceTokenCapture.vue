<script setup lang="ts">
import type { FaceLiveHostMessage, FaceLivePageMode } from "~/types/face";

const props = withDefaults(
  defineProps<{
    compact?: boolean;
    mode: FaceLivePageMode;
    token: string;
    siteUrl?: string;
  }>(),
  {
    compact: false
  }
);

const emit = defineEmits<{
  flowEvent: [message: FaceLiveHostMessage];
}>();

const { t } = useI18n();
let mounted = false;

function publish(message: FaceLiveHostMessage) {
  emit("flowEvent", message);
  window.dispatchEvent(new CustomEvent("jumpserver:facelive", { detail: message }));
  if (window.parent !== window) window.parent.postMessage(message, "*");
}

const capture = useRemoteFaceCapture({
  token: () => props.token,
  mode: () => props.mode,
  siteUrl: () => props.siteUrl || "",
  onEvent: publish
});
const cameraVideo = capture.video;
const cameraOverlay = capture.overlay;

const flow = computed(() => capture.latest.value?.flow || null);
const challenge = computed(() => flow.value?.challenge || null);
const monitor = computed(() => flow.value?.monitor || null);
const cameraItems = computed(() =>
  capture.cameras.value.map((camera) => ({ label: camera.label, value: camera.deviceId }))
);
const title = computed(() => {
  if (props.mode === "monitor" || capture.serverMode.value === "monitor") return t("Face.Remote.MonitorTitle");
  if (capture.serverMode.value === "enroll") return t("Face.Remote.EnrollTitle");
  if (capture.serverMode.value === "auth") return t("Face.Remote.AuthTitle");
  return t("Face.Remote.Title");
});
const stateLabel = computed(() => {
  if (capture.clientState.value === "preparing") return t("Face.Remote.PreparingCamera");
  if (capture.clientState.value === "connecting") return t("Face.Remote.Connecting");
  if (capture.clientState.value === "error" && capture.errorCode.value) {
    return t(`Face.Remote.Error.${capture.errorCode.value}`);
  }
  if (flow.value?.status) return t(`Face.Status.${flow.value.status}`);
  if (capture.clientState.value === "active") return t("Face.Remote.CameraReady");
  return t("Face.Status.idle");
});
const instruction = computed(() => {
  if (capture.clientState.value === "preparing") return t("Face.Remote.AllowCamera");
  if (capture.clientState.value === "connecting") return t("Face.Remote.ConnectingHint");
  if (capture.clientState.value === "error" && !flow.value) {
    return capture.errorMessage.value || t(`Face.Remote.ErrorHint.${capture.errorCode.value || "server_error"}`);
  }
  if (flow.value?.guidance && flow.value.guidance !== "look_straight") {
    return t(`Face.Remote.Guidance.${flow.value.guidance}`);
  }
  if (flow.value?.status === "monitor_away_warning") {
    return t("Face.Remote.AwayWarning", { seconds: monitor.value?.remaining_seconds ?? 0 });
  }
  if (flow.value?.status === "monitor_paused" || monitor.value?.paused) return t("Face.Remote.SessionPaused");
  if (flow.value?.phase === "monitoring") return t("Face.Remote.MonitoringHint");
  if (challenge.value && !challenge.value.passed) {
    if (!challenge.value.calibrated) return t("Face.Remote.LookStraight");
    if (challenge.value.type) return t(`Face.Remote.Challenge.${challenge.value.type}`);
  }
  if (flow.value?.status === "enrolling") {
    return t("Face.Remote.CapturingSamples", {
      accepted: flow.value.accepted_samples,
      required: flow.value.required_samples
    });
  }
  if (flow.value?.status === "auth_success" || flow.value?.status === "enrollment_complete") {
    return t("Face.Remote.Completed");
  }
  if (flow.value?.finished) return flow.value.detail || t("Face.Remote.Failed");
  return t("Face.Remote.LookStraight");
});
const progress = computed(() => {
  if (challenge.value && !challenge.value.passed)
    return Math.round(Math.max(0, Math.min(1, challenge.value.score)) * 100);
  if (flow.value?.mode === "enroll" && flow.value.required_samples) {
    return Math.round((flow.value.accepted_samples / flow.value.required_samples) * 100);
  }
  return flow.value?.finished && !capture.retryable.value ? 100 : 0;
});
const metric = computed(() => {
  if (!flow.value) return "";
  if (flow.value.mode === "enroll") return `${flow.value.accepted_samples}/${flow.value.required_samples}`;
  if (flow.value.phase === "monitoring" && monitor.value) {
    return monitor.value.matched ? t("Face.Remote.Present") : t("Face.Remote.Away");
  }
  return `${(Number(flow.value.similarity || 0) * 100).toFixed(1)}%`;
});
const tone = computed(() => {
  if (capture.clientState.value === "success" || capture.clientState.value === "active") return "success";
  if (capture.clientState.value === "warning") return "warning";
  if (capture.clientState.value === "error") return "error";
  return "neutral";
});
const statusIcon = computed(() => {
  if (tone.value === "success") return "i-lucide-circle-check";
  if (tone.value === "warning") return "i-lucide-triangle-alert";
  if (tone.value === "error") return "i-lucide-circle-x";
  return "i-lucide-loader-circle";
});
const statusIconClass = computed(() => ({
  "text-success": tone.value === "success",
  "text-warning": tone.value === "warning",
  "text-error": tone.value === "error",
  "text-muted": tone.value === "neutral"
}));

function requestRetry() {
  publish({
    source: "jumpserver-facelive",
    event: "retry_requested",
    mode: props.mode,
    ...(flow.value ? { flow: flow.value } : {})
  });
  if (props.mode === "monitor" || window.parent === window) void capture.start();
}

onMounted(() => {
  mounted = true;
  publish({ source: "jumpserver-facelive", event: "page_ready", mode: props.mode });
  void capture.start();
});

watch(
  () => [props.token, props.mode] as const,
  ([token, mode], previous) => {
    if (mounted && previous && (token !== previous[0] || mode !== previous[1])) void capture.start();
  }
);
</script>

<template>
  <section class="face-token-capture" :class="{ 'face-token-capture--compact': compact }">
    <header class="face-token-capture__header">
      <div class="flex min-w-0 items-center gap-2">
        <UIcon :name="statusIcon" class="size-4 shrink-0" :class="statusIconClass" />
        <div class="min-w-0">
          <h1 class="truncate text-sm font-semibold text-highlighted">{{ title }}</h1>
          <p class="truncate text-xs text-muted">{{ stateLabel }}</p>
        </div>
      </div>
      <USelect
        v-if="cameraItems.length"
        v-model="capture.selectedDeviceId.value"
        :items="cameraItems"
        value-key="value"
        label-key="label"
        size="sm"
        class="w-48 max-w-[48%]"
        :aria-label="t('Face.SelectCamera')"
        :disabled="capture.starting.value"
        @update:model-value="capture.switchCamera"
      />
    </header>

    <div class="face-token-capture__stage" :class="`face-token-capture__stage--${tone}`">
      <video ref="cameraVideo" autoplay muted playsinline />
      <canvas ref="cameraOverlay" />
      <div class="face-token-capture__guide" aria-hidden="true" />
      <div class="face-token-capture__message">{{ instruction }}</div>
    </div>

    <footer class="face-token-capture__footer">
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between gap-3 text-xs">
            <span class="truncate font-medium text-highlighted">{{ stateLabel }}</span>
            <span v-if="metric" class="shrink-0 tabular-nums text-muted">{{ metric }}</span>
          </div>
          <div class="mt-2 h-1 overflow-hidden rounded bg-elevated">
            <div class="h-full bg-primary transition-[width] duration-200" :style="{ width: `${progress}%` }" />
          </div>
          <p v-if="capture.errorMessage.value && flow" class="mt-1 line-clamp-2 text-xs text-error">
            {{ capture.errorMessage.value }}
          </p>
        </div>
      </div>
      <UButton
        v-if="capture.retryable.value"
        icon="i-lucide-refresh-cw"
        size="sm"
        :label="t('Face.Remote.Retry')"
        @click="requestRetry"
      />
    </footer>
  </section>
</template>

<style scoped>
.face-token-capture {
  display: grid;
  grid-template-rows: auto minmax(260px, 1fr) auto;
  gap: 10px;
  width: 100%;
  min-height: 100%;
  padding: 12px;
  color: var(--app-fg);
  background: var(--app-bg);
}

.face-token-capture__header,
.face-token-capture__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.face-token-capture__stage {
  position: relative;
  min-height: 260px;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: #1a211e;
}

.face-token-capture__stage--warning {
  border-color: var(--ui-warning);
}

.face-token-capture__stage--error {
  border-color: var(--ui-error);
}

.face-token-capture__stage video,
.face-token-capture__stage canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: scaleX(-1);
}

.face-token-capture__stage canvas {
  pointer-events: none;
}

.face-token-capture__guide {
  position: absolute;
  top: 48%;
  left: 50%;
  width: min(46%, 230px);
  aspect-ratio: 0.78;
  border: 2px solid rgb(255 255 255 / 78%);
  border-radius: 48%;
  box-shadow: 0 0 0 999px rgb(0 0 0 / 16%);
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.face-token-capture__message {
  position: absolute;
  right: 12px;
  bottom: 12px;
  left: 12px;
  min-height: 40px;
  padding: 10px 12px;
  border-radius: 6px;
  color: white;
  font-size: 13px;
  line-height: 1.45;
  text-align: center;
  background: rgb(15 20 18 / 84%);
}

.face-token-capture--compact {
  grid-template-rows: auto 210px auto;
  padding: 10px;
}

.face-token-capture--compact .face-token-capture__stage {
  min-height: 210px;
}

@media (max-width: 560px) {
  .face-token-capture {
    grid-template-rows: auto minmax(240px, 1fr) auto;
    padding: 8px;
  }

  .face-token-capture__header {
    align-items: flex-start;
  }
}
</style>
