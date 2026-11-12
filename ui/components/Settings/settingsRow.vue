<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string;
    description?: string;
    help?: string;
    fluid?: boolean;
  }>(),
  {
    fluid: false
  }
);
</script>

<template>
  <div class="px-4 py-3">
    <div
      class="flex justify-between max-sm:flex-col max-sm:items-stretch max-sm:gap-2.5"
      :class="fluid ? 'flex-wrap items-start gap-x-6 gap-y-2.5' : 'items-center gap-6'"
    >
      <div :class="fluid ? 'min-w-48 flex-1 basis-48' : 'min-w-0'">
        <p class="text-sm font-medium text-highlighted">
          {{ title }}
          <UTooltip v-if="help" :text="help" :ui="{ content: 'h-auto max-w-sm whitespace-pre-line' }">
            <UButton
              icon="i-lucide-circle-help"
              color="neutral"
              variant="link"
              size="xs"
              :aria-label="help"
              class="ml-1 inline-flex p-0 align-middle"
            />
          </UTooltip>
        </p>
      </div>
      <div class="flex items-center max-sm:w-full" :class="fluid ? 'min-w-56 flex-1 basis-56 justify-end' : 'shrink-0'">
        <slot />
      </div>
    </div>
    <p v-if="description" class="mt-0.5 max-w-[70%] text-xs leading-5 text-muted">{{ description }}</p>
  </div>
</template>
