<script setup lang="ts">
import type { WorkspaceConnectionProgressStage } from "~/composables/useWorkspaceTabs";

const props = defineProps<{ error?: string; stage: WorkspaceConnectionProgressStage }>();
const emit = defineEmits<{ edit: []; reconnect: [] }>();

const { t } = useI18n();
const stageIndex = computed(() => ({ token: 0, session: 1, connected: 2 })[props.stage]);
const shownIndex = ref(0);
const failed = computed(() => Boolean(props.error));
const stageLabel = computed(() =>
  t(["ConnectionSetup.CreateToken", "ConnectionSetup.OpenSession", "ConnectionSetup.Connected"][stageIndex.value]!)
);

function iconColor(index: number) {
  return index <= shownIndex.value ? "primary" : "neutral";
}

const settleStep3 = ref(false);

function ringClass(index: number) {
  if (failed.value && stageIndex.value === index) return "is-failed";
  if (index < stageIndex.value) return "is-done";
  if (index === 2 && settleStep3.value) return "is-done";
  return "is-spin";
}

watch([stageIndex, failed], ([value, isFailed]) => {
  shownIndex.value = value;
  if (value === 2 && !isFailed) {
    settleStep3.value = false;
    requestAnimationFrame(() => {
      settleStep3.value = true;
    });
    return;
  }
  settleStep3.value = false;
});
onMounted(() => {
  requestAnimationFrame(() => {
    shownIndex.value = stageIndex.value;
  });
});
</script>

<template>
  <div
    :role="failed ? 'alert' : 'status'"
    aria-live="polite"
    class="absolute inset-0 z-20 grid place-items-center bg-[color-mix(in_srgb,var(--workspace-surface-background)_80%,transparent)] p-6 backdrop-blur-sm"
  >
    <div class="flex w-full max-w-lg flex-col items-center gap-4">
      <div class="flex w-full items-center gap-5" aria-hidden="true">
        <span class="relative shrink-0">
          <svg class="step-ring" :class="ringClass(0)" viewBox="0 0 52 52" aria-hidden="true">
            <circle cx="26" cy="26" r="24" pathLength="100" />
          </svg>
          <UButton
            as="span"
            :icon="failed && stageIndex === 0 ? 'i-lucide-circle-alert' : 'i-lucide-square-terminal'"
            variant="soft"
            square
            size="lg"
            :color="failed && stageIndex === 0 ? 'error' : iconColor(0)"
            class="pointer-events-none !rounded-full"
          />
        </span>
        <span class="progress-line">
          <span class="progress-line-fill" :class="{ 'is-on': shownIndex >= 1 }" />
        </span>
        <span
          class="progress-label shrink-0 text-3xl font-semibold tracking-[0.08em]"
          :class="{ 'is-on': shownIndex >= 1 }"
        >
          JumpServer
        </span>
        <span class="progress-line">
          <span class="progress-line-fill progress-line-fill--late" :class="{ 'is-on': shownIndex >= 2 }" />
        </span>
        <span class="relative shrink-0">
          <svg v-if="stageIndex === 2" class="step-ring" :class="ringClass(2)" viewBox="0 0 52 52" aria-hidden="true">
            <circle cx="26" cy="26" r="24" pathLength="100" />
          </svg>
          <span class="relative block">
            <UButton
              as="span"
              icon="i-lucide-server"
              variant="soft"
              square
              size="lg"
              :color="iconColor(2)"
              class="pointer-events-none !rounded-full transition-opacity duration-500"
              :class="failed ? 'opacity-0' : 'opacity-100'"
            />
            <UButton
              as="span"
              icon="i-lucide-circle-alert"
              variant="soft"
              square
              size="lg"
              color="error"
              class="pointer-events-none absolute inset-0 !rounded-full transition-opacity duration-500"
              :class="failed ? 'opacity-100' : 'opacity-0'"
            />
          </span>
        </span>
      </div>
      <p v-if="error" class="error-copy max-w-lg text-center text-sm text-default">{{ error }}</p>
      <div v-if="failed" class="error-copy flex flex-wrap justify-center gap-2">
        <UButton v-if="stageIndex === 0" color="neutral" variant="soft" @click="emit('edit')">
          {{ t("ConnectionSetup.BackToForm") }}
        </UButton>
        <UButton color="warning" variant="soft" @click="emit('reconnect')">
          {{ t("WorkspacePane.Reconnect") }}
        </UButton>
      </div>
      <span v-else class="sr-only">{{ stageLabel }}</span>
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
  transition: transform 700ms cubic-bezier(0.22, 1, 0.36, 1);
}

.progress-line-fill--late {
  transition-delay: 280ms;
}

.progress-line-fill.is-on {
  transform: scaleX(1);
}

.progress-label {
  color: var(--app-muted);
  transition:
    color 520ms ease,
    filter 520ms ease;
  transition-delay: 180ms;
}

.progress-label.is-on {
  color: var(--theme-accent);
  filter: drop-shadow(0 0 12px color-mix(in srgb, var(--theme-accent) 50%, transparent));
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
    stroke 480ms ease,
    stroke-dasharray 520ms cubic-bezier(0.22, 1, 0.36, 1);
}

.step-ring.is-spin circle {
  animation: server-spin 0.8s linear infinite;
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
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
</style>
