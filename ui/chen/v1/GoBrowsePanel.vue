<script setup lang="ts">
import type { GoBrowseFilter, GoBrowseRequest, GoSession } from "./api";
import type { QueryWorkspaceTab } from "./workspace";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { executionActive } from "./api";
import { editDirty } from "./dataEditing";

const props = defineProps<{ query: QueryWorkspaceTab; session: GoSession }>();
const emit = defineEmits<{ submit: [request: GoBrowseRequest] }>();
const { t } = useI18n();
const expanded = ref(false);
const applied = computed(() => props.query.rows?.browse);
const draft = computed(() => props.query.browseDraft);
const supported = computed(() => applied.value?.supported ?? ["postgresql", "mysql"].includes(props.session.dialect));
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
const operators = computed(() =>
  ["eq", "ne", "lt", "le", "gt", "ge", "like", "not_like", "in", "not_in", "is_null", "not_null"].map((op) => ({
    value: op,
    label: {
      eq: "=",
      ne: "<>",
      lt: "<",
      le: "<=",
      gt: ">",
      ge: ">=",
      like: "LIKE",
      not_like: "NOT LIKE",
      in: "IN",
      not_in: "NOT IN",
      is_null: "IS NULL",
      not_null: "IS NOT NULL"
    }[op]
  }))
);
function mode(structured: boolean) {
  if (locked.value) return;
  if (structured) {
    draft.value.where = "";
    draft.value.filter = { op: "and", children: [] };
  } else draft.value.filter = undefined;
}
function addCondition() {
  if (locked.value || !draft.value.filter || !columns.value.length) return;
  draft.value.filter.children!.push({ op: "eq", column: columns.value[0]!.value, values: [""] });
}
function values(condition: GoBrowseFilter, value: string) {
  condition.values = ["in", "not_in"].includes(condition.op) ? value.split("\n") : [value];
}
function submit(clear = false) {
  if (locked.value || !supported.value || !props.query.browseObject) return;
  const filter = clear ? undefined : draft.value.filter;
  const normalized = filter?.children?.length
    ? {
        ...filter,
        children: filter.children.map((child) => ({
          ...child,
          values: ["is_null", "not_null"].includes(child.op) ? undefined : child.values
        }))
      }
    : undefined;
  if (clear) {
    draft.value.where = "";
    draft.value.filter = undefined;
  }
  emit("submit", {
    schema: props.query.browseObject.schema,
    table: props.query.browseObject.name,
    where: clear ? "" : draft.value.where,
    filter: normalized,
    sort: draft.value.sort.map((item) => ({ ...item })),
    page_size: draft.value.page_size,
    offset: 0
  });
}
function page(offset: number) {
  if (locked.value || !applied.value?.supported || !props.query.rows) return;
  emit("submit", { source_result_id: props.query.rows.id, offset });
}
function count() {
  if (locked.value || !applied.value?.supported || !props.query.rows) return;
  emit("submit", { source_result_id: props.query.rows.id, action: "count" });
}
const total = computed(() =>
  props.query.browseCount?.source_result_id === props.query.rows?.id ? props.query.browseCount?.total : undefined
);
</script>

<template>
  <section data-chen-browse class="shrink-0 border-b border-default px-3 py-2 text-xs">
    <p v-if="!supported" class="text-warning">{{ t("Chen.GoBrowseUnsupported") }}</p>
    <template v-else>
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          icon="i-lucide-list-filter"
          size="xs"
          color="neutral"
          variant="ghost"
          :label="t('Chen.GoBrowseFilter')"
          :aria-expanded="expanded"
          @click="expanded = !expanded"
        />
        <span v-if="applied && query.loadingSettings.mode === 'page'" data-browse-range>
          {{
            t("Chen.GoBrowseRange", {
              first: query.rows?.rows.length ? applied.offset + 1 : 0,
              last: query.rows?.rows.length ? applied.offset + query.rows.rows.length : 0,
              rows: query.rows?.rows.length || 0
            })
          }}
        </span>
        <span>{{ total === undefined ? t("Chen.GoBrowseUnknown") : t("Chen.GoBrowseTotal", { total }) }}</span>
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          :label="t('Chen.GoBrowseCount')"
          :disabled="locked || !applied"
          @click="count"
        />
        <span v-if="query.loadingSettings.mode === 'page' && applied?.has_more === true">
          {{ t("Chen.GoBrowseMore") }}
        </span>
        <span v-else-if="query.loadingSettings.mode === 'page' && applied?.has_more === false">
          {{ t("Chen.GoBrowseEnd") }}
        </span>
        <UButton
          v-if="query.loadingSettings.mode === 'page'"
          size="xs"
          icon="i-lucide-chevron-left"
          color="neutral"
          variant="ghost"
          :aria-label="t('Chen.GoBrowsePrevious')"
          :disabled="locked || !applied || applied.offset === 0"
          @click="page(Math.max(0, applied!.offset - applied!.page_size))"
        />
        <UButton
          v-if="query.loadingSettings.mode === 'page'"
          size="xs"
          icon="i-lucide-chevron-right"
          color="neutral"
          variant="ghost"
          :aria-label="t('Chen.GoBrowseNext')"
          :disabled="locked || applied?.has_more !== true || applied.offset + applied.page_size > applied.max_offset"
          @click="page(applied!.offset + applied!.page_size)"
        />
      </div>
      <p v-if="applied?.has_more === null" role="status" class="text-warning">{{ t("Chen.GoBrowseIncomplete") }}</p>
      <p v-if="applied && !applied.stable" class="text-warning">{{ t("Chen.GoBrowseUnstable") }}</p>
      <p v-if="applied" class="text-muted">{{ t("Chen.GoBrowseConsistency") }}</p>
      <p v-if="editDirty(query.edit)" class="text-warning">{{ t("Chen.GoBrowseDirty") }}</p>
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
          <div class="flex items-center gap-2">
            <USelect
              v-model="draft.filter.op"
              :items="['and', 'or']"
              :aria-label="t('Chen.GoBrowseJoin')"
              :disabled="locked"
            />
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              :label="t('Chen.GoBrowseAdd')"
              :disabled="locked || !columns.length || (draft.filter.children?.length || 0) >= 50"
              @click="addCondition"
            />
          </div>
          <div
            v-for="(condition, index) in draft.filter.children"
            :key="index"
            class="flex flex-wrap items-center gap-2"
          >
            <USelect v-model="condition.column" :items="columns" :aria-label="t('Chen.Column')" :disabled="locked" />
            <USelect v-model="condition.op" :items="operators" :aria-label="t('Chen.Operator')" :disabled="locked" />
            <UTextarea
              v-if="!['is_null', 'not_null'].includes(condition.op)"
              :model-value="condition.values?.join('\n') || ''"
              :rows="1"
              :aria-label="t('Chen.Value')"
              :disabled="locked"
              @update:model-value="values(condition, $event)"
            />
            <UButton
              icon="i-lucide-x"
              size="xs"
              color="neutral"
              variant="ghost"
              :aria-label="t('Chen.GoBrowseRemove')"
              :disabled="locked"
              @click="draft.filter.children!.splice(index, 1)"
            />
          </div>
          <p class="text-muted">{{ t("Chen.GoBrowseValuesHint") }}</p>
        </template>
        <template v-else>
          <UTextarea
            v-model="draft.where"
            class="w-full font-ui-mono"
            :rows="2"
            :disabled="locked"
            :aria-label="t('Chen.GoBrowseWhere')"
            placeholder="id > 10 AND (name LIKE 'A%' OR name IS NULL)"
          />
          <p class="text-muted">{{ t("Chen.GoBrowseWhereHint") }}</p>
        </template>
        <div class="flex flex-wrap items-center gap-2">
          <span>{{ t("Chen.GoBrowseSort") }}</span>
          <USelect
            :model-value="draft.sort[0]?.column || ''"
            :items="[{ label: t('Chen.GoBrowseDefaultSort'), value: '' }, ...columns]"
            :aria-label="t('Chen.GoBrowseSort')"
            :disabled="locked"
            @update:model-value="(value) => (draft.sort = value ? [{ column: value, desc: false }] : [])"
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
          <UButton size="xs" :label="t('Chen.ApplyFilter')" :disabled="locked" @click="submit()" />
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            :label="t('Chen.GoBrowseClear')"
            :disabled="locked"
            @click="submit(true)"
          />
        </div>
        <p v-if="applied" class="break-all text-muted">{{ t("Chen.GoBrowseApplied") }}: {{ applied.full_sql }}</p>
      </div>
    </template>
  </section>
</template>
