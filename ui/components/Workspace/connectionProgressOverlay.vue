<script setup lang="ts">
import type { WorkspaceConnectionProgressStage } from "~/composables/useWorkspaceTabs";
import { isFaceLiveHostMessage } from "~/utils/faceLive";

const props = defineProps<{ error?: string; paneId?: string; stage: WorkspaceConnectionProgressStage }>();
const emit = defineEmits<{ cancel: []; edit: []; reconnect: [] }>();

const { t } = useI18n();
const { close, failFace, findScopeGroup, markFacePageReady, retryFace, submit } = useAclDialog();
const group = computed(() => findScopeGroup(props.paneId));
const { description, isReview } = useAclDialogPresentation(group);
const item = computed(() => group.value?.items[0]);
const waitingFace = computed(() => ["acl_face_verify", "acl_face_online"].includes(group.value?.code || ""));
const waiting = computed(() => {
  const current = item.value;
  if (!current || current.settled) return false;
  if (isReview.value) return ["ready", "submitting", "pending"].includes(current.status);
  if (waitingFace.value) return ["ready", "submitting", "verifying"].includes(current.status);
  return false;
});
const stageIndex = computed(() => ({ token: 0, session: 1, connected: 2 })[props.stage]);
const shownIndex = ref(0);
const overlayError = computed(() =>
  waiting.value ? undefined : props.error || (group.value ? description.value : undefined)
);
const failed = computed(() => Boolean(overlayError.value));
const detailReason = computed(() => {
  const detail = item.value?.detail;
  if (!detail) return "";
  return detail.startsWith("AclDialog.") ? t(detail) : detail;
});
const copy = computed(() => overlayError.value || (waiting.value ? description.value : "") || detailReason.value);
const showFaceStart = computed(
  () => waiting.value && waitingFace.value && ["ready", "failed"].includes(item.value?.status || "")
);
const faceFrame = ref<HTMLIFrameElement | null>(null);
const stageLabel = computed(() =>
  t(["ConnectionSetup.CreateToken", "ConnectionSetup.OpenSession", "ConnectionSetup.Connected"][stageIndex.value]!)
);

function iconColor(index: number) {
  if (failed.value && (index === 0 || stageIndex.value === index)) return "error";
  if (waiting.value && index === 0) return "warning";
  return index <= shownIndex.value ? "primary" : "neutral";
}

const settleStep3 = ref(false);
const playId = ref(0);
const wipeOn = ref(false);
const lateOn = ref(false);
let lateTimer: ReturnType<typeof setTimeout> | undefined;

function replayWipe() {
  playId.value++;
  wipeOn.value = false;
  lateOn.value = false;
  if (lateTimer) clearTimeout(lateTimer);
  requestAnimationFrame(() => {
    wipeOn.value = shownIndex.value >= 1 || failed.value;
  });
  if (failed.value || shownIndex.value >= 2) {
    lateTimer = setTimeout(() => {
      lateOn.value = true;
    }, 760);
  }
}

function ringClass(index: number) {
  if (failed.value && (index === 0 || stageIndex.value === index)) return "is-failed";
  if (failed.value && index === 2 && lateOn.value) return "is-failed";
  if (waiting.value && index === 0) return "is-wait";
  if (index < stageIndex.value) return "is-done";
  if (index === 2 && settleStep3.value) return "is-done";
  return "is-spin";
}

watch([stageIndex, failed, waiting], ([value, isFailed]) => {
  shownIndex.value = value;
  if (value >= 1 || isFailed) {
    requestAnimationFrame(() => {
      wipeOn.value = true;
    });
  }
  if (value === 2 && !isFailed && !waiting.value) {
    settleStep3.value = false;
    requestAnimationFrame(() => {
      settleStep3.value = true;
    });
    return;
  }
  settleStep3.value = false;
});
watch(failed, (isFailed, wasFailed) => {
  if (isFailed !== wasFailed) replayWipe();
});
watch(
  () => [group.value?.id, group.value?.code, group.value?.submitted],
  () => {
    const current = group.value;
    if (current?.code === "acl_review" && !current.submitted) void submit(current);
  },
  { immediate: true }
);
onMounted(() => {
  requestAnimationFrame(() => {
    shownIndex.value = stageIndex.value;
    replayWipe();
  });
  window.addEventListener("message", handleFaceMessage);
});
onBeforeUnmount(() => {
  if (lateTimer) clearTimeout(lateTimer);
  window.removeEventListener("message", handleFaceMessage);
});

function handleFaceMessage(event: MessageEvent) {
  const current = group.value;
  if (!current || !isFaceLiveHostMessage(event.data) || !faceFrame.value) return;
  if (event.source !== faceFrame.value.contentWindow) return;
  const expectedOrigin = current.faceUrl ? new URL(current.faceUrl).origin : "";
  if (!expectedOrigin || event.origin !== expectedOrigin) return;
  if (event.data.event === "page_ready") markFacePageReady(current);
  if (event.data.event === "client_error") {
    failFace(current, String(event.data.message || "AclDialog.FacePageUnavailable"));
  }
  if (event.data.event === "retry_requested") void retryFace(current);
}

async function startFace() {
  const current = group.value;
  if (!current) return;
  if (item.value?.status === "failed") await retryFace(current);
  else await submit(current);
}

async function cancelWait() {
  if (group.value) await close(group.value);
  emit("cancel");
}

async function editConnection() {
  if (group.value) await close(group.value);
  emit("edit");
}

async function reconnect() {
  replayWipe();
  if (group.value) await close(group.value);
  emit("reconnect");
}
</script>

<template>
  <div
    :role="failed ? 'alert' : 'status'"
    aria-live="polite"
    class="absolute inset-0 z-20 grid place-items-center bg-[color-mix(in_srgb,var(--workspace-surface-background)_80%,transparent)] p-6 backdrop-blur-sm"
  >
    <div class="relative w-full max-w-lg">
      <div class="flex w-full items-center gap-5" aria-hidden="true">
        <span class="relative shrink-0">
          <svg class="step-ring" :class="ringClass(0)" viewBox="0 0 52 52" aria-hidden="true">
            <circle cx="26" cy="26" r="24" pathLength="100" />
          </svg>
          <UButton
            as="span"
            :icon="failed ? 'i-lucide-circle-alert' : 'i-lucide-square-terminal'"
            variant="soft"
            square
            size="lg"
            :color="iconColor(0)"
            class="pointer-events-none !rounded-full"
          />
        </span>
        <span class="progress-line" :class="{ 'is-error': failed }">
          <span class="progress-line-fill" :class="{ 'is-on': shownIndex >= 1 || failed }" />
        </span>
        <span class="progress-label shrink-0 text-3xl font-semibold tracking-[0.08em]">
          JumpServer
          <span
            :key="playId"
            class="progress-label-wipe"
            :class="{ 'is-on': wipeOn && (shownIndex >= 1 || failed), 'is-error': failed }"
            aria-hidden="true"
          >
            JumpServer
          </span>
        </span>
        <span class="progress-line" :class="{ 'is-error': failed && lateOn }">
          <span
            class="progress-line-fill progress-line-fill--late"
            :class="{ 'is-on': shownIndex >= 2 || (failed && lateOn) }"
          />
        </span>
        <span class="relative shrink-0">
          <svg
            v-if="stageIndex === 2 || lateOn"
            class="step-ring"
            :class="ringClass(2)"
            viewBox="0 0 52 52"
            aria-hidden="true"
          >
            <circle cx="26" cy="26" r="24" pathLength="100" />
          </svg>
          <UButton
            as="span"
            :icon="failed && lateOn ? 'i-lucide-circle-x' : 'i-lucide-server'"
            variant="soft"
            square
            size="lg"
            :color="failed && lateOn ? 'error' : iconColor(2)"
            class="pointer-events-none !rounded-full"
          />
        </span>
      </div>
      <div class="absolute inset-x-0 top-full mt-4 flex flex-col items-center gap-4">
        <p v-if="copy" :key="`copy-${playId}`" class="error-copy max-w-lg text-center text-sm text-default">
          {{ copy }}
        </p>
        <p
          v-if="detailReason && detailReason !== copy"
          :key="`detail-${playId}`"
          class="error-copy max-w-lg text-center text-xs text-muted"
        >
          {{ detailReason }}
        </p>
        <p v-if="waiting && item?.assignees" class="error-copy text-center text-xs text-muted">
          {{ t("AclDialog.Assignees", { value: item.assignees }) }}
        </p>
        <iframe
          v-if="group?.faceUrl"
          ref="faceFrame"
          :src="group.faceUrl"
          allow="camera"
          class="error-copy h-80 w-full max-w-lg rounded-lg border-0 bg-default"
          sandbox="allow-scripts allow-same-origin"
          @error="group && failFace(group, 'AclDialog.FacePageUnavailable')"
        />
        <div v-if="waiting || failed" class="error-copy flex flex-wrap justify-center gap-2">
          <UButton v-if="waiting" color="neutral" variant="soft" @click="cancelWait">
            {{ t("Common.Cancel") }}
          </UButton>
          <UButton v-else-if="stageIndex === 0" color="neutral" variant="soft" @click="editConnection">
            {{ t("ConnectionSetup.BackToForm") }}
          </UButton>
          <UButton v-if="showFaceStart" color="primary" variant="soft" @click="startFace">
            {{ t("ConnectionSetup.StartFaceVerify") }}
          </UButton>
          <UButton v-else-if="failed" color="warning" variant="soft" @click="reconnect">
            {{ t("WorkspacePane.Reconnect") }}
          </UButton>
        </div>
        <span v-else class="sr-only">{{ stageLabel }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.progress-line {
  position: relative;
  height: 2px;
  min-width: 1.5rem;
  flex: 1;
  overflow: hidden;
  border-radius: 999px;
  background: var(--app-border);
}

.progress-line-fill {
  position: absolute;
  inset: 0;
  transform: scaleX(0);
  transform-origin: left center;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--theme-accent) 25%, transparent),
    var(--theme-accent) 55%,
    color-mix(in srgb, var(--theme-accent) 0%, transparent)
  );
  transition: transform 420ms cubic-bezier(0.22, 1, 0.36, 1);
}

.progress-line-fill--late {
  transition-delay: 0ms;
}

.progress-line-fill.is-on {
  transform: scaleX(1);
}

.progress-label {
  position: relative;
  color: var(--app-muted);
}

.progress-label-wipe {
  position: absolute;
  inset: 0;
  color: var(--theme-accent);
  clip-path: inset(0 100% 0 0);
  filter: drop-shadow(0 0 12px color-mix(in srgb, var(--theme-accent) 50%, transparent));
  transition:
    clip-path 420ms cubic-bezier(0.22, 1, 0.36, 1),
    color 420ms ease,
    filter 420ms ease;
  transition-delay: 380ms;
}

.progress-label-wipe.is-on {
  clip-path: inset(0 0 0 0);
}

.progress-label-wipe.is-error {
  color: var(--color-error, #f43f5e);
  filter: drop-shadow(0 0 12px color-mix(in srgb, var(--color-error, #f43f5e) 50%, transparent));
}

.progress-line.is-error {
  background: color-mix(in srgb, var(--color-error, #f43f5e) 28%, transparent);
}

.progress-line.is-error .progress-line-fill {
  background: var(--color-error, #f43f5e);
}

.step-ring {
  position: absolute;
  inset: -0.35rem;
  width: calc(100% + 0.7rem);
  height: calc(100% + 0.7rem);
  overflow: visible;
  pointer-events: none;
  transform: rotate(-90deg);
}

.step-ring circle {
  fill: none;
  stroke: var(--theme-accent);
  stroke-width: 2.25;
  stroke-linecap: round;
  stroke-dasharray: 28 72;
  transform-origin: 26px 26px;
  transition:
    stroke 420ms ease,
    stroke-dasharray 420ms cubic-bezier(0.22, 1, 0.36, 1);
}

.step-ring.is-spin circle {
  animation: server-spin 0.8s linear infinite;
}

.step-ring.is-wait circle {
  animation: server-spin 0.8s linear infinite;
  stroke: var(--color-warning, #f59e0b);
}

.step-ring.is-done circle {
  animation: none;
  stroke-dasharray: 100 0;
}

.step-ring.is-failed circle {
  animation: none;
  stroke: var(--color-error, #f43f5e);
  stroke-dasharray: 100 0;
}

.error-copy {
  animation: error-copy-in 420ms ease both;
}

@keyframes server-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes error-copy-in {
  from {
    opacity: 0;
    clip-path: inset(0 100% 0 0);
  }
  to {
    opacity: 1;
    clip-path: inset(0 0 0 0);
  }
}
</style>
