<script setup lang="ts">
import type { ChenConsoleState, ChenDataViewAction } from "~/chen/types";

import { getChenDataViewToolbarState } from "~/chen/composables/useChenDataView";

const props = withDefaults(defineProps<{
  state: ChenConsoleState
  pinnable?: boolean
}>(), {
  pinnable: false
});

const emit = defineEmits<{
  action: [action: ChenDataViewAction, data?: number]
}>();

const limitOptions = [50, 100, 200, 500];
const controls = computed(() => getChenDataViewToolbarState(props.state));

function changeLimit(value: string | number) {
  const limit = Number(value);
  if (!limitOptions.includes(limit)) return;
  emit("action", "change_limit", limit);
}
</script>

<template>
  <div class="flex items-center gap-1">
    <template v-if="controls.paged">
      <UButton
        size="xs"
        icon="i-lucide-chevrons-left"
        color="neutral"
        variant="ghost"
        aria-label="First page"
        title="First page"
        :disabled="controls.disableFirst"
        @click="emit('action', 'first_page')"
      />
      <UButton
        size="xs"
        icon="i-lucide-chevron-left"
        color="neutral"
        variant="ghost"
        aria-label="Previous page"
        title="Previous page"
        :disabled="controls.disablePrevious"
        @click="emit('action', 'prev_page')"
      />
      <USelect
        class="w-20"
        size="xs"
        :model-value="controls.limit"
        :items="limitOptions"
        :disabled="controls.loading"
        aria-label="Rows per page"
        @update:model-value="changeLimit"
      />
      <span class="whitespace-nowrap px-1 text-xs text-muted">
        {{ controls.page }} / {{ controls.lastPage }} · {{ controls.total }} rows
      </span>
      <UButton
        size="xs"
        icon="i-lucide-chevron-right"
        color="neutral"
        variant="ghost"
        aria-label="Next page"
        title="Next page"
        :disabled="controls.disableNext"
        @click="emit('action', 'next_page')"
      />
      <UButton
        size="xs"
        icon="i-lucide-chevrons-right"
        color="neutral"
        variant="ghost"
        aria-label="Last page"
        title="Last page"
        :disabled="controls.disableLast"
        @click="emit('action', 'last_page')"
      />
    </template>
    <span v-else class="whitespace-nowrap px-1 text-xs text-muted">
      {{ controls.total }} rows
    </span>

    <UButton
      size="xs"
      icon="i-lucide-refresh-cw"
      color="neutral"
      variant="ghost"
      aria-label="Refresh data"
      title="Refresh data"
      :loading="controls.loading"
      :disabled="controls.loading"
      @click="emit('action', 'refresh')"
    />
    <UButton
      v-if="pinnable"
      size="xs"
      icon="i-lucide-pin"
      :color="controls.pinned ? 'primary' : 'neutral'"
      :variant="controls.pinned ? 'soft' : 'ghost'"
      :aria-pressed="controls.pinned"
      :aria-label="controls.pinned ? 'Unpin result' : 'Pin result'"
      :title="controls.pinned ? 'Unpin result' : 'Pin result'"
      :disabled="controls.loading"
      @click="emit('action', 'toggle_pinned')"
    />
  </div>
</template>
