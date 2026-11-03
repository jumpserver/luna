<script setup lang="ts">
import type { GoQueryPageRequest, GoSession } from "./api";
import type { GoResultLoadingSettings, QueryWorkspaceTab } from "./workspace";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { lastPageOffset, resultLoadingLocked } from "./workspace";

const props = defineProps<{ query: QueryWorkspaceTab; session: GoSession }>();
const emit = defineEmits<{
  submit: [request: GoQueryPageRequest];
  cached: [];
  rows: [id: string, offset: number];
  loadingSettings: [settings: GoResultLoadingSettings];
}>();
const { t } = useI18n();
const page = computed(() => props.query.rows?.query_page);
const database = computed(() => page.value?.mode === "database");
const paged = computed(() => database.value || props.query.loadingSettings.mode === "page");
const locked = computed(() => props.session.state !== "ready" || resultLoadingLocked(props.query));
const size = computed(() => (database.value ? page.value!.page_size : props.query.loadingSettings.batchSize));
const offset = computed(() => (database.value ? page.value!.offset : props.query.rows?.offset || 0));
const total = computed(() => {
  if (!database.value) return props.query.rows?.total_rows.toString();
  return props.query.queryCount?.source_result_id === props.query.rows?.id ? props.query.queryCount?.total : undefined;
});
const lastOffset = computed(() =>
  lastPageOffset(total.value, size.value, database.value ? page.value!.max_offset : Number.MAX_SAFE_INTEGER)
);
const nextAvailable = computed(() =>
  database.value
    ? page.value?.has_more === true && offset.value + size.value <= page.value!.max_offset
    : props.query.rows?.next_offset !== undefined
);
const range = computed(() => {
  const rows = props.query.rows;
  if (!rows) return "";
  const first = rows.rows.length ? offset.value + 1 : 0;
  const last = offset.value + rows.rows.length;
  return `${first}–${last}${total.value !== undefined ? ` / ${total.value}${!database.value && rows.truncated ? "+" : ""}` : ""}`;
});
const modes = computed(() => [
  {
    label: t("Chen.GoQueryPageCache"),
    icon: "i-lucide-table-2",
    type: "checkbox" as const,
    checked: !database.value,
    disabled: locked.value || !database.value || !props.query.cachedResult,
    onSelect: () => {
      if (!locked.value && database.value && props.query.cachedResult) emit("cached");
    }
  },
  {
    label: t("Chen.GoQueryPageDatabase"),
    icon: "i-lucide-database",
    type: "checkbox" as const,
    checked: database.value,
    disabled: locked.value || database.value || !page.value?.supported,
    description: page.value?.supported ? undefined : page.value?.reason,
    onSelect: () => request("page", 0)
  }
]);
const sizes = computed(() =>
  [...new Set([50, 100, 200, 500, 1000, size.value])]
    .filter((value) => value > 0 && value <= (page.value?.max_page_size || 1000))
    .sort((a, b) => a - b)
    .map((value) => ({
      label: t(paged.value ? "Chen.GoResultPageSize" : "Chen.GoResultBatchSize", { size: value }),
      value
    }))
);
function request(action: "page" | "count", target = 0) {
  if (locked.value || !page.value?.supported || !props.query.rows) return;
  emit("submit", {
    source_result_id: props.query.rows.id,
    action,
    offset: target,
    page_size: size.value
  });
}
function navigate(target: number) {
  if (locked.value || !props.query.rows || !Number.isSafeInteger(target) || target < 0) return;
  if (database.value) request("page", target);
  else emit("rows", props.query.rows.id, target);
}
function changeSize(value: unknown) {
  if (locked.value || typeof value !== "number" || !sizes.value.some((item) => item.value === value)) return;
  emit("loadingSettings", { mode: props.query.loadingSettings.mode, batchSize: value });
}
</script>

<template>
  <div
    v-if="query.rows && !query.browseObject"
    data-chen-result-navigation
    class="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-t border-default px-2 py-1 text-xs"
  >
    <UDropdownMenu :items="modes" :content="{ align: 'start', side: 'top' }">
      <UButton
        :icon="database ? 'i-lucide-database' : 'i-lucide-table-2'"
        trailing-icon="i-lucide-chevron-down"
        :label="t(database ? 'Chen.GoQueryPageDatabase' : 'Chen.GoQueryPageCache')"
        :title="t(database ? 'Chen.GoQueryPageDatabaseHint' : 'Chen.GoQueryPageCacheHint')"
        :aria-label="t('Chen.GoQueryPageMode')"
        :disabled="locked"
        size="xs"
        color="neutral"
        variant="ghost"
      />
    </UDropdownMenu>
    <span v-if="paged" class="whitespace-nowrap tabular-nums text-muted" data-result-range>{{ range }}</span>
    <span v-if="database && query.rows.truncated" class="text-warning" :title="t('Chen.GoQueryPageBudget')">
      {{ t("Chen.GoQueryPageTruncated") }}
    </span>
    <div class="ml-auto flex shrink-0 items-center gap-1">
      <USelect
        :model-value="size"
        :items="sizes"
        :aria-label="t(paged ? 'Chen.GoBrowseSize' : 'Chen.GoBrowseBatchSize')"
        :disabled="locked"
        size="xs"
        variant="none"
        @update:model-value="changeSize"
      />
      <UButton
        v-if="database"
        icon="i-lucide-sigma"
        :aria-label="t('Chen.GoQueryPageCount')"
        :title="t('Chen.GoQueryPageCount')"
        :disabled="locked"
        size="xs"
        color="neutral"
        variant="ghost"
        @click="request('count')"
      />
      <template v-if="paged">
        <UButton
          icon="i-lucide-chevrons-left"
          :aria-label="t('Chen.FirstPage')"
          :title="t('Chen.FirstPage')"
          :disabled="locked || offset === 0"
          size="xs"
          color="neutral"
          variant="ghost"
          @click="navigate(0)"
        />
        <UButton
          icon="i-lucide-chevron-left"
          :aria-label="t('Chen.GoV1Previous')"
          :title="t('Chen.GoV1Previous')"
          :disabled="locked || offset === 0"
          size="xs"
          color="neutral"
          variant="ghost"
          @click="navigate(Math.max(0, offset - size))"
        />
        <UButton
          icon="i-lucide-chevron-right"
          :aria-label="t('Chen.GoV1Next')"
          :title="t('Chen.GoV1Next')"
          :disabled="locked || !nextAvailable"
          size="xs"
          color="neutral"
          variant="ghost"
          @click="navigate(database ? offset + size : query.rows.next_offset!)"
        />
        <UButton
          icon="i-lucide-chevrons-right"
          :aria-label="t('Chen.LastPage')"
          :title="lastOffset === null ? t('Chen.GoBrowseLastHint') : t('Chen.LastPage')"
          :disabled="locked || lastOffset === null || offset >= lastOffset"
          size="xs"
          color="neutral"
          variant="ghost"
          @click="lastOffset !== null && navigate(lastOffset)"
        />
      </template>
    </div>
  </div>
</template>
