<script setup lang="ts">
withDefaults(
  defineProps<{
    icon?: string;
    loading?: boolean;
    title?: string;
    message: string;
    actionLabel?: string;
  }>(),
  {
    icon: undefined,
    loading: false,
    title: undefined,
    actionLabel: undefined
  }
);

defineEmits<{
  action: [];
}>();
</script>

<template>
  <div
    class="relative grid h-full min-h-64 place-items-center overflow-hidden bg-[var(--workspace-surface-background)] px-6 text-sm"
  >
    <div
      :role="actionLabel ? 'alert' : 'status'"
      aria-live="polite"
      class="relative flex w-full max-w-sm flex-col items-center px-8 py-7 text-center"
    >
      <div
        class="relative mb-4 grid size-14 place-items-center rounded-2xl bg-[var(--workspace-surface-sub-header)] text-[var(--app-text-primary)]"
      >
        <span v-if="loading" aria-hidden="true" class="state-pulse absolute inset-0 rounded-2xl" />
        <UIcon
          :name="icon || (loading ? 'i-lucide-database' : 'i-lucide-database-zap')"
          class="relative size-6"
          :class="loading ? 'text-primary' : ''"
        />
        <span
          v-if="loading"
          aria-hidden="true"
          class="absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full border-2 border-[var(--workspace-surface-background)] bg-primary text-inverted"
        >
          <UIcon name="i-lucide-loader-circle" class="state-spinner size-3 animate-spin" />
        </span>
      </div>

      <h2 v-if="title" class="text-sm font-medium text-[var(--app-text-primary)]">
        {{ title }}
      </h2>
      <p class="mt-1 max-w-xs text-xs leading-5 text-[var(--app-text-muted)]">
        {{ message }}
      </p>

      <div
        v-if="loading"
        aria-hidden="true"
        class="mt-5 h-1 w-40 overflow-hidden rounded-full bg-[var(--app-state-hover-strong)]"
      >
        <span class="state-progress block h-full w-1/2 rounded-full bg-primary" />
      </div>

      <UButton
        v-if="actionLabel"
        class="mt-5"
        size="sm"
        variant="soft"
        icon="i-lucide-rotate-cw"
        @click="$emit('action')"
      >
        {{ actionLabel }}
      </UButton>
    </div>
  </div>
</template>

<style scoped>
.state-pulse {
  border: 1px solid color-mix(in srgb, var(--theme-accent) 32%, transparent);
  animation: state-pulse 1.8s ease-out infinite;
}

.state-progress {
  animation: state-progress 1.35s ease-in-out infinite;
}

@keyframes state-pulse {
  0% {
    opacity: 0.8;
    transform: scale(0.96);
  }
  75%,
  100% {
    opacity: 0;
    transform: scale(1.32);
  }
}

@keyframes state-progress {
  from {
    transform: translateX(-105%);
  }
  to {
    transform: translateX(205%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .state-pulse,
  .state-progress,
  .state-spinner {
    animation: none;
  }

  .state-progress {
    transform: translateX(50%);
  }
}
</style>
