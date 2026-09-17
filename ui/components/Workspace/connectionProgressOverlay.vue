<script setup lang="ts">
import type { WorkspaceConnectionProgressStage } from "~/composables/useWorkspaceTabs";

const props = defineProps<{ stage: WorkspaceConnectionProgressStage }>();

const { t } = useI18n();
const stageIndex = computed(() => ({ token: 0, session: 1, connected: 2 })[props.stage]);
const shownIndex = ref(0);
const stageLabel = computed(() =>
  t(["ConnectionSetup.CreateToken", "ConnectionSetup.OpenSession", "ConnectionSetup.Connected"][stageIndex.value]!)
);

function iconColor(index: number) {
  return index <= shownIndex.value ? "primary" : "neutral";
}

watch(stageIndex, (value) => {
  shownIndex.value = value;
});
onMounted(() => {
  requestAnimationFrame(() => {
    shownIndex.value = stageIndex.value;
  });
});
</script>

<template>
  <div
    role="status"
    aria-live="polite"
    class="absolute inset-0 z-20 grid place-items-center bg-[color-mix(in_srgb,var(--workspace-surface-background)_80%,transparent)] p-6 backdrop-blur-sm"
  >
    <div class="flex w-full max-w-lg items-center gap-5" aria-hidden="true">
      <span class="relative shrink-0">
        <span
          v-if="stageIndex === 0"
          class="absolute -inset-1 rounded-full border-2 border-[color-mix(in_srgb,var(--theme-accent)_22%,transparent)] border-t-[var(--theme-accent)] animate-spin"
        />
        <UButton
          as="span"
          icon="i-lucide-square-terminal"
          variant="soft"
          square
          size="lg"
          :color="iconColor(0)"
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
        <span
          v-if="stageIndex === 2"
          class="absolute -inset-1 rounded-full border-2 border-[color-mix(in_srgb,var(--theme-accent)_22%,transparent)] border-t-[var(--theme-accent)] animate-spin"
        />
        <UButton
          as="span"
          icon="i-lucide-server"
          variant="soft"
          square
          size="lg"
          :color="iconColor(2)"
          class="pointer-events-none !rounded-full"
        />
      </span>
    </div>
    <span class="sr-only">{{ stageLabel }}</span>
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
</style>
