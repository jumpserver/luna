<script setup lang="ts">
import type { GoBrowseFilter, GoBrowseRequest, GoSession } from "./api";
import type { QueryWorkspaceTab } from "./workspace";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { executionActive } from "./api";
import { editDirty } from "./dataEditing";
import GoBrowseCondition from "./GoBrowseCondition.vue";

const props = defineProps<{ query: QueryWorkspaceTab; session: GoSession }>();
const emit = defineEmits<{ submit: [request: GoBrowseRequest] }>();
const { t } = useI18n();
const expanded = ref(false);
const applied = computed(() => props.query.rows?.browse);
const draft = computed(() => props.query.browseDraft);
const supported = computed(() => applied.value?.supported === true);
const locked = computed(
  () =>
    props.session.state !== "ready" ||
    props.query.console?.state !== "ready" ||
    props.query.busy ||
    props.query.loadingRows ||
    !!props.query.pending ||
    executionActive(props.query.execution) ||
    props.query.edit.busy ||
    editDirty(props.query.edit)
);
const columns = computed(() =>
  (props.query.rows?.columns || []).map((column) => ({ label: column.name, value: column.name }))
);
function filterSize(filter: GoBrowseFilter): number {
  return 1 + (filter.children || []).reduce((total, child) => total + filterSize(child), 0);
}
function normalizedFilter(filter: GoBrowseFilter): GoBrowseFilter {
  if (["and", "or"].includes(filter.op))
    return {
      op: filter.op,
      children: (filter.children || [])
        .map(normalizedFilter)
        .filter((child) => !["and", "or"].includes(child.op) || !!child.children?.length)
    };
  return {
    op: filter.op,
    column: filter.column,
    values: ["is_null", "not_null"].includes(filter.op) ? undefined : filter.values
  };
}
const pendingChanges = computed(() => {
  if (!applied.value) return false;
  const filter = draft.value.filter ? normalizedFilter(draft.value.filter) : undefined;
  return (
    draft.value.where.trim() !== applied.value.where.trim() ||
    JSON.stringify(filter?.children?.length ? filter : null) !== JSON.stringify(applied.value.filter || null) ||
    JSON.stringify(draft.value.sort) !== JSON.stringify(applied.value.sort)
  );
});
const appliedCondition = computed(
  () => applied.value?.where || t(applied.value?.filter ? "Chen.GoBrowseBuilder" : "Chen.GoBrowseNoFilter")
);
function mode(structured: boolean) {
  if (locked.value) return;
  if (structured) {
    draft.value.where = "";
    draft.value.filter = { op: "and", children: [] };
  } else draft.value.filter = undefined;
}
function submit(clear = false) {
  if (locked.value || !supported.value || !props.query.browseObject) return;
  const filter = clear ? undefined : draft.value.filter;
  const normalized = filter?.children?.length ? normalizedFilter(filter) : undefined;
  const appliedFilter = normalized?.children?.length ? normalized : undefined;
  if (clear) {
    draft.value.where = "";
    draft.value.filter = undefined;
  }
  emit("submit", {
    schema: props.query.browseObject.schema,
    table: props.query.browseObject.name,
    where: clear ? "" : draft.value.where,
    filter: appliedFilter,
    sort: draft.value.sort.map((item) => ({ ...item })),
    page_size: draft.value.page_size,
    offset: 0
  });
}
function applyWhere(event: KeyboardEvent) {
  if (event.isComposing) return;
  event.preventDefault();
  submit();
}
</script>

<template>
  <section data-chen-browse class="shrink-0 border-b border-default px-2 py-1 text-xs">
    <p v-if="applied?.supported === false" class="text-warning">
      {{ t("Chen.GoBrowseUnsupported") }}
      <span v-if="applied.reason && applied.reason !== 'legacy_cached_browse'">{{ applied.reason }}</span>
    </p>
    <template v-else-if="supported">
      <div
        class="flex min-w-0 items-center gap-1"
        @copy.capture="
          (e) => {
            if (!session.permissions.can_copy) e.preventDefault();
          }
        "
        @paste.capture="
          (e) => {
            if (!session.permissions.can_paste) e.preventDefault();
          }
        "
      >
        <UButton
          icon="i-lucide-list-filter"
          size="xs"
          color="neutral"
          variant="ghost"
          class="shrink-0"
          :label="t('Chen.Filter')"
          :aria-label="t('Chen.BuildFilter')"
          :aria-expanded="expanded"
          @click="expanded = !expanded"
        />
        <span class="font-ui-mono text-muted">WHERE</span>
        <UInput
          v-model="draft.where"
          class="min-w-0 flex-1 font-ui-mono"
          size="xs"
          :aria-label="t('Chen.GoBrowseWhere')"
          :placeholder="draft.filter ? t('Chen.GoBrowseBuilder') : 'id > 10 AND name LIKE \'A%\''"
          :disabled="locked || !!draft.filter"
          @keydown.enter="applyWhere"
        />
        <UBadge
          v-if="pendingChanges"
          class="shrink-0"
          color="neutral"
          variant="soft"
          size="sm"
          data-browse-pending
          :title="`${t('Chen.GoBrowseAppliedCondition')}: ${appliedCondition}`"
        >
          <span class="sr-only" data-browse-applied>{{ appliedCondition }}</span>
          {{ t("Chen.GoBrowseUnapplied") }}
        </UBadge>
        <UButton
          size="xs"
          icon="i-lucide-play"
          :label="t('Chen.Apply')"
          class="shrink-0"
          :aria-label="t(draft.filter ? 'Chen.ApplyFilter' : 'Chen.ApplyWhereCondition')"
          :title="t(draft.filter ? 'Chen.ApplyFilter' : 'Chen.ApplyWhereCondition')"
          :disabled="locked"
          @click="submit()"
        />
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-x"
          :aria-label="t('Chen.GoBrowseClear')"
          :disabled="locked"
          @click="submit(true)"
        />
      </div>
      <p v-if="applied?.has_more === null" role="status" class="text-warning">{{ t("Chen.GoBrowseIncomplete") }}</p>
      <p v-if="expanded && applied" class="text-muted">{{ t("Chen.GoBrowseConsistency") }}</p>
      <div
        v-if="expanded"
        class="mt-2 space-y-2"
        :class="{ 'select-none': !session.permissions.can_copy }"
        @copy.capture="
          (e) => {
            if (!session.permissions.can_copy) e.preventDefault();
          }
        "
        @paste.capture="
          (e) => {
            if (!session.permissions.can_paste) e.preventDefault();
          }
        "
      >
        <p>{{ t("Chen.GoBrowseDraftHint") }}</p>
        <div class="flex flex-wrap items-center gap-2">
          <UButton
            size="xs"
            color="neutral"
            :variant="draft.filter ? 'soft' : 'ghost'"
            :label="t('Chen.GoBrowseBuilder')"
            :disabled="locked"
            @click="mode(true)"
          />
          <UButton
            size="xs"
            color="neutral"
            :variant="!draft.filter ? 'soft' : 'ghost'"
            :label="t('Chen.GoBrowseWhere')"
            :disabled="locked"
            @click="mode(false)"
          />
        </div>
        <template v-if="draft.filter">
          <GoBrowseCondition
            v-model:condition="draft.filter"
            :columns="columns"
            :locked="locked"
            :depth="0"
            :can-add="filterSize(draft.filter) < 48"
          />
          <p class="text-muted">{{ t("Chen.GoBrowseValuesHint") }}</p>
        </template>
        <div class="flex flex-wrap items-center gap-2">
          <span>{{ t("Chen.GoBrowseSort") }}</span>
          <USelect
            :model-value="
              draft.sort.length ? columns.findIndex((column) => column.value === draft.sort[0]?.column) + 1 : 0
            "
            :items="[
              { label: t('Chen.GoBrowseDefaultSort'), value: 0 },
              ...columns.map((column, index) => ({ label: column.label, value: index + 1 }))
            ]"
            :aria-label="t('Chen.GoBrowseSort')"
            :disabled="locked"
            @update:model-value="
              (value) =>
                (draft.sort = value && columns[value - 1] ? [{ column: columns[value - 1]!.value, desc: false }] : [])
            "
          />
          <USelect
            v-if="draft.sort.length"
            v-model="draft.sort[0]!.desc"
            :items="[
              { label: 'ASC', value: false },
              { label: 'DESC', value: true }
            ]"
            :aria-label="t('Chen.GoBrowseDirection')"
            :disabled="locked"
          />
        </div>
        <p v-if="applied" class="break-all text-muted">{{ t("Chen.GoBrowseApplied") }}: {{ applied.full_sql }}</p>
      </div>
    </template>
  </section>
</template>
