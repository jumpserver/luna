<script setup lang="ts">
import type { ChenConsoleState, ChenDataViewAction } from "~/chen/types";

import { getChenDataViewToolbarState } from "~/chen/composables/useChenDataView";

const props = withDefaults(
  defineProps<{
    state: ChenConsoleState;
    rowCount?: number;
    affectedRows?: number;
    busy?: boolean;
  }>(),
  {
    rowCount: 0,
    busy: false
  }
);

const emit = defineEmits<{
  action: [action: ChenDataViewAction, data?: number];
}>();

const { t } = useI18n();

const limitOptions = [50, 100, 200, 500];
const controls = computed(() => getChenDataViewToolbarState(props.state));
const rowSummary = computed(() => {
  if (Number.isFinite(props.affectedRows)) {
    return t("Chen.RowsAffected", { count: props.affectedRows });
  }
  if (!controls.value.paged) return t("Chen.RowCount", { count: props.rowCount });
  if (!controls.value.total || !props.rowCount)
    return t("Chen.RowRange", { first: 0, last: 0, total: controls.value.total });
  const first = (controls.value.page - 1) * controls.value.limit + 1;
  const last = Math.min(controls.value.total, first + props.rowCount - 1);
  return t("Chen.RowRange", { first, last, total: controls.value.total });
});
const duration = computed(() => {
  const milliseconds = Number(props.state.durationMs);
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "";
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
  return `${(milliseconds / 1000).toFixed(milliseconds < 10_000 ? 2 : 1)} s`;
});

function changeLimit(value: string | number) {
  const limit = Number(value);
  if (!limitOptions.includes(limit)) return;
  emit("action", "change_limit", limit);
}
</script>

<template>
  <div
    class="flex min-h-9 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-default px-2 py-1"
  >
    <div class="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted">
      <span>{{ rowSummary }}</span>
      <template v-if="duration">
        <span aria-hidden="true">·</span>
        <span class="tabular-nums">{{ t("Chen.Elapsed", { duration }) }}</span>
      </template>
    </div>

    <div v-if="controls.paged" class="ml-auto flex items-center gap-1">
      <span class="mr-1 whitespace-nowrap text-xs text-muted">{{ t("Chen.RowsPerPage") }}</span>
      <USelect
        class="w-20"
        size="xs"
        :model-value="controls.limit"
        :items="limitOptions"
        :disabled="busy || controls.loading"
        :aria-label="t('Chen.RowsPerPage')"
        @update:model-value="changeLimit"
      />
      <UButton
        size="xs"
        icon="i-lucide-chevrons-left"
        color="neutral"
        variant="ghost"
        :aria-label="t('Chen.FirstPage')"
        :title="t('Chen.FirstPage')"
        :disabled="busy || controls.disableFirst"
        @click="emit('action', 'first_page')"
      />
      <UButton
        size="xs"
        icon="i-lucide-chevron-left"
        color="neutral"
        variant="ghost"
        :aria-label="t('Chen.PreviousPage')"
        :title="t('Chen.PreviousPage')"
        :disabled="busy || controls.disablePrevious"
        @click="emit('action', 'prev_page')"
      />
      <span class="min-w-16 whitespace-nowrap text-center text-xs tabular-nums text-muted">
        {{ controls.page }} / {{ controls.lastPage }}
      </span>
      <UButton
        size="xs"
        icon="i-lucide-chevron-right"
        color="neutral"
        variant="ghost"
        :aria-label="t('Chen.NextPage')"
        :title="t('Chen.NextPage')"
        :disabled="busy || controls.disableNext"
        @click="emit('action', 'next_page')"
      />
      <UButton
        size="xs"
        icon="i-lucide-chevrons-right"
        color="neutral"
        variant="ghost"
        :aria-label="t('Chen.LastPage')"
        :title="t('Chen.LastPage')"
        :disabled="busy || controls.disableLast"
        @click="emit('action', 'last_page')"
      />
    </div>
  </div>
</template>
