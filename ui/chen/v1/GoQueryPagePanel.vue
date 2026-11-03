<script setup lang="ts">
import type { GoQueryPageRequest, GoSession } from "./api";
import type { QueryWorkspaceTab } from "./workspace";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { lastPageOffset, resultLoadingLocked } from "./workspace";
const props = defineProps<{ query: QueryWorkspaceTab; session: GoSession }>();
const emit = defineEmits<{ submit: [request: GoQueryPageRequest] }>();
const { t } = useI18n();
const page = computed(() => props.query.rows?.query_page);
const database = computed(() => page.value?.mode === "database");
const lastOffset = computed(() =>
  lastPageOffset(props.query.queryCount?.total, page.value?.page_size || 0, page.value?.max_offset ?? 0)
);
const locked = computed(() => props.session.state !== "ready" || resultLoadingLocked(props.query));
function request(action: "page" | "count", offset = 0) {
  if (locked.value || !page.value?.supported || !props.query.rows) return;
  emit("submit", {
    source_result_id: props.query.rows.id,
    action,
    offset,
    page_size: page.value.page_size || Math.min(props.query.loadingSettings.batchSize, page.value.max_page_size)
  });
}
</script>

<template>
  <div
    v-if="query.rows && !query.browseObject"
    class="max-h-48 shrink-0 space-y-1 overflow-y-auto border-b border-default px-3 py-2 text-xs sm:max-h-none"
  >
    <div class="flex flex-wrap items-center gap-2">
      <UBadge color="neutral" variant="subtle">
        {{ t(database ? "Chen.GoQueryPageDatabase" : "Chen.GoQueryPageCache") }}
      </UBadge>
      <UButton v-if="!database && page?.supported" size="xs" variant="soft" :disabled="locked" @click="request('page')">
        {{ t("Chen.GoQueryPageEnable") }}
      </UButton>
      <template v-if="database && page">
        <span class="tabular-nums">
          {{ query.rows.rows.length ? page.offset + 1 : 0 }}–{{
            query.rows.rows.length ? page.offset + query.rows.rows.length : 0
          }}
        </span>
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-chevrons-left"
          :aria-label="t('Chen.FirstPage')"
          :disabled="locked || page.offset === 0"
          @click="request('page', 0)"
        />
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-chevron-left"
          :aria-label="t('Chen.GoV1Previous')"
          :disabled="locked || page.offset === 0"
          @click="request('page', Math.max(0, page.offset - page.page_size))"
        />
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-chevron-right"
          :aria-label="t('Chen.GoV1Next')"
          :disabled="locked || page.has_more !== true || page.offset + page.page_size > page.max_offset"
          @click="request('page', page.offset + page.page_size)"
        />
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-chevrons-right"
          :aria-label="t('Chen.LastPage')"
          :title="t('Chen.GoBrowseLastHint')"
          :disabled="locked || lastOffset === null || lastOffset === page.offset"
          @click="lastOffset !== null && request('page', lastOffset)"
        />
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-refresh-cw"
          :disabled="locked"
          @click="request('page', page.offset)"
        >
          {{ t("Chen.GoQueryPageRefresh") }}
        </UButton>
        <UButton size="xs" variant="soft" :disabled="locked" @click="request('count')">
          {{ t("Chen.GoQueryPageCount") }}
        </UButton>
        <span>{{ t("Chen.GoQueryPageTotal") }}: {{ query.queryCount?.total ?? t("Chen.GoQueryPageUnknown") }}</span>
        <span v-if="query.rows.truncated" class="text-warning">{{ t("Chen.GoQueryPageBudget") }}</span>
        <span v-else-if="page.has_more === false" class="text-muted">{{ t("Chen.GoQueryPageEnd") }}</span>
      </template>
    </div>
    <p class="text-muted">{{ t("Chen.GoQueryPageReplay") }}</p>
    <p v-if="page && !page.supported" class="text-warning">{{ page.reason }}</p>
    <template v-if="database">
      <p class="text-warning">{{ t(page?.ordered ? "Chen.GoQueryPageOrder" : "Chen.GoQueryPageUnordered") }}</p>
      <p class="text-muted">{{ t("Chen.GoQueryPageReadOnly") }}</p>
    </template>
  </div>
</template>
