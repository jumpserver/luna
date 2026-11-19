<script setup lang="ts">
import type { GoBrowseRequest, GoSession } from "./api";
import type { GoResultLoadingSettings, QueryWorkspaceTab } from "./workspace";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { executionActive } from "./api";
import { editDirty } from "./dataEditing";
import { hasMoreResultRows, lastPageOffset, resultLoadingLocked } from "./workspace";
const props = defineProps<{ query: QueryWorkspaceTab; session: GoSession }>();
const emit = defineEmits<{
  submit: [request: GoBrowseRequest];
  loadMore: [];
  rows: [id: string, offset: number];
  loadingSettings: [settings: GoResultLoadingSettings];
}>();
const { t } = useI18n();
const browse = computed(() => props.query.rows?.browse);
const server = computed(() => browse.value?.supported === true);
const locked = computed(() => props.session.state !== "ready" || resultLoadingLocked(props.query));
const paged = computed(() => props.query.loadingSettings.mode === "page");
const size = computed(() => (server.value ? browse.value!.page_size : props.query.loadingSettings.batchSize));
const offset = computed(() => (server.value ? browse.value!.offset : props.query.rows?.offset || 0));
// Only explicit server counts describe the table; total_rows is the result cache size.
const total = computed(() => {
  const count = props.query.browseCount;
  return count && server.value && count.source_result_id === props.query.rows?.id && /^\d+$/.test(count.total)
    ? count.total
    : undefined;
});
const pages = computed(() =>
  total.value === undefined
    ? undefined
    : String((BigInt(total.value) + BigInt(size.value) - 1n) / BigInt(size.value) || 1n)
);
const last = computed(() => lastPageOffset(total.value, size.value, browse.value?.max_offset ?? 0));
const summary = computed(() => {
  const count = props.query.rows?.rows.length || 0;
  if (!paged.value)
    return total.value === undefined
      ? t("Chen.GoBrowseLoaded", { rows: count })
      : `${t("Chen.RowsShownTotal", { shown: count, total: total.value })} · ${t("Chen.GoBrowseContinuous")}`;
  const first = count ? offset.value + 1 : 0;
  const end = count ? offset.value + count : 0;
  return total.value === undefined
    ? t("Chen.GoTableRange", { first, last: end })
    : t("Chen.RowRange", { first, last: end, total: total.value });
});
const duration = computed(() => {
  const execution = props.query.resultExecution;
  if (!execution?.started_at || !execution.finished_at) return "";
  const ms = Date.parse(execution.finished_at) - Date.parse(execution.started_at);
  return !Number.isFinite(ms) || ms < 0 ? "" : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
});
const sizes = computed(() =>
  [...new Set([50, 100, 200, 500, 1000, size.value])]
    .filter((value) => value > 0 && value <= (server.value ? browse.value!.max_page_size : 1000))
    .sort((a, b) => a - b)
);
const next = computed(() =>
  server.value
    ? browse.value?.has_more === true && offset.value + size.value <= browse.value.max_offset
    : props.query.rows?.next_offset !== undefined
);
const countForLastPage = computed(() => server.value && total.value === undefined && next.value);
const lastPageSource = ref<string>();
function navigate(target: number) {
  if (locked.value || !props.query.rows || !Number.isSafeInteger(target) || target < 0) return;
  if (server.value) {
    if (target > browse.value!.max_offset) return;
    emit("submit", { source_result_id: props.query.rows.id, offset: target });
  } else emit("rows", props.query.rows.id, target);
}
function count() {
  if (!locked.value && server.value && props.query.rows)
    emit("submit", { source_result_id: props.query.rows.id, action: "count" });
}
function goToLastPage() {
  if (last.value !== null) navigate(last.value);
  else if (countForLastPage.value && !locked.value) {
    lastPageSource.value = props.query.rows?.id;
    count();
  }
}
// A count may arrive on SSE before its HTTP submission releases the controls.
watch(
  [() => props.query.rows?.id, total, locked, paged, () => props.query.error, () => props.session.state],
  ([id, count, busy, isPaged, error, state]) => {
    if (!lastPageSource.value) return;
    if (lastPageSource.value !== id || !isPaged || error || state !== "ready") {
      lastPageSource.value = undefined;
      return;
    }
    if (busy) return;
    lastPageSource.value = undefined;
    if (count !== undefined && last.value !== null && last.value !== offset.value) navigate(last.value);
  }
);
function changeSize(value: unknown) {
  if (!locked.value && typeof value === "number" && sizes.value.includes(value))
    emit("loadingSettings", { ...props.query.loadingSettings, batchSize: value });
}
</script>
<template>
  <div
    v-if="query.rows"
    data-chen-browse-footer
    role="group"
    :aria-label="t('Chen.GoBrowseFilter')"
    class="flex min-h-9 min-w-0 shrink-0 items-center gap-3 overflow-x-auto whitespace-nowrap border-t border-default px-2 py-1 text-xs"
  >
    <span
      class="shrink-0 tabular-nums text-muted"
      data-browse-range
      :title="server && !browse?.stable ? t('Chen.GoBrowseUnstable') : undefined"
    >
      {{ summary }}
      <template v-if="duration">· {{ t("Chen.Elapsed", { duration }) }}</template>
    </span>
    <UButton
      v-if="server && total === undefined"
      size="xs"
      color="neutral"
      variant="ghost"
      class="shrink-0"
      :label="t('Chen.GoTableCount')"
      :loading="query.executionBrowse?.action === 'count' && locked"
      :disabled="locked"
      @click="count"
    />
    <template v-if="!paged">
      <span
        v-if="query.loadingRows || (executionActive(query.execution) && query.executionBrowse?.action === 'append')"
        class="text-muted"
      >
        {{ t("Chen.GoBrowseLoadingMore") }}
      </span>
      <span v-else-if="editDirty(query.edit) || query.edit.refreshRequired" class="text-warning">
        {{ t("Chen.GoBrowseScrollDirty") }}
      </span>
      <span v-else-if="query.loadMoreFailed || query.resultLoadError" class="text-warning">
        {{ t("Chen.GoBrowseLoadMoreFailed") }}
      </span>
      <span v-else-if="query.rows.browse?.limit_reached === 'rows'" class="text-warning">
        {{ t("Chen.GoBrowseCacheLimit", { rows: query.rows.browse.max_loaded_rows }) }}
      </span>
      <span v-else-if="query.rows.truncated && !hasMoreResultRows(query)" class="text-warning">
        {{ t("Chen.GoBrowseCacheStopped") }}
      </span>
      <span v-else-if="!hasMoreResultRows(query)" class="text-muted">
        {{ t(query.rows.browse?.supported ? "Chen.GoBrowseEnd" : "Chen.GoBrowseCacheEnd") }}
      </span>
      <UButton
        v-if="hasMoreResultRows(query)"
        size="xs"
        color="neutral"
        variant="ghost"
        class="ml-auto"
        :label="t(query.loadMoreFailed || query.resultLoadError ? 'Chen.GoBrowseRetryMore' : 'Chen.GoBrowseLoadMore')"
        :disabled="locked"
        @click="emit('loadMore')"
      />
    </template>
    <div class="ml-auto flex shrink-0 items-center gap-1">
      <span class="text-muted">{{ t(paged ? "Chen.GoBrowseSize" : "Chen.GoBrowseBatchSize") }}</span>
      <USelect
        size="xs"
        class="w-20"
        :model-value="size"
        :items="sizes"
        :disabled="locked"
        :aria-label="t(paged ? 'Chen.GoBrowseSize' : 'Chen.GoBrowseBatchSize')"
        @update:model-value="changeSize"
      />
      <template v-if="paged">
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-chevrons-left"
          :aria-label="t('Chen.FirstPage')"
          :title="t('Chen.FirstPage')"
          :disabled="locked || offset === 0"
          @click="navigate(0)"
        />
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-chevron-left"
          :aria-label="t('Chen.PreviousPage')"
          :title="t('Chen.PreviousPage')"
          :disabled="locked || offset === 0"
          @click="navigate(Math.max(0, offset - size))"
        />
        <span class="min-w-10 text-center tabular-nums" data-browse-page>
          {{ Math.floor(offset / size) + 1 }}
          <template v-if="pages !== undefined">/ {{ pages }}</template>
        </span>
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-chevron-right"
          :aria-label="t('Chen.NextPage')"
          :title="t('Chen.NextPage')"
          :disabled="locked || !next"
          @click="navigate(server ? offset + size : query.rows!.next_offset!)"
        />
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-chevrons-right"
          :aria-label="t('Chen.LastPage')"
          :title="t('Chen.LastPage')"
          :disabled="locked || !server || (last === null ? !countForLastPage : last === offset)"
          @click="goToLastPage"
        />
      </template>
    </div>
  </div>
</template>
