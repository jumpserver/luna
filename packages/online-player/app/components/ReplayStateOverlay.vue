<script setup lang="ts">
const props = defineProps<{
  kind: "converting" | "not-found" | "error" | "blocked";
  message?: string;
}>();

const emit = defineEmits<{
  retry: [];
}>();

const { t } = useI18n();

const title = computed(() => {
  if (props.kind === "converting") return t("Replay.Preparing");
  if (props.kind === "blocked") return t("Replay.DesktopBlocked");
  if (props.kind === "error") return t("Replay.PlayError");
  return t("Replay.NotFound");
});

const description = computed(() => {
  if (props.message) return props.message;
  if (props.kind === "converting") return t("Replay.PreparingHint");
  if (props.kind === "blocked") return t("Replay.DesktopBlockedHint");
  if (props.kind === "error") return t("Replay.PlayErrorHint");
  return t("Replay.NotFoundHint");
});
</script>

<template>
  <div
    class="absolute inset-0 z-20 flex items-center justify-center bg-[var(--replay-stage)]"
    data-replay-overlay
    :data-kind="kind"
  >
    <div class="flex w-full max-w-[400px] flex-col items-center px-8 py-10 text-center">
      <UIcon
        v-if="kind === 'converting'"
        name="i-lucide-loader-circle"
        class="mb-5 size-11 animate-spin text-primary"
      />
      <UIcon v-else-if="kind === 'blocked'" name="i-lucide-monitor-off" class="mb-5 size-12 text-warning" />
      <UIcon v-else name="i-lucide-circle-x" class="mb-5 size-12 text-error" />
      <h2 class="text-[15px] font-semibold text-[var(--replay-fg)]">{{ title }}</h2>
      <p class="mt-2 text-[12.5px] leading-6 text-[var(--replay-muted)]">{{ description }}</p>
      <div v-if="kind === 'error' || kind === 'not-found'" class="mt-6">
        <UButton
          color="primary"
          size="sm"
          icon="i-lucide-refresh-cw"
          :label="t('Replay.Reload')"
          @click="emit('retry')"
        />
      </div>
    </div>
  </div>
</template>
