<script setup lang="ts">
import type { GoBrowseRequest, GoSession } from "./api";
import type { QueryWorkspaceTab } from "./workspace";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { executionActive } from "./api";
import { editDirty } from "./dataEditing";

const props = defineProps<{ query: QueryWorkspaceTab; session: GoSession }>();
const emit = defineEmits<{ submit: [request: GoBrowseRequest] }>();
const { t } = useI18n();
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
const draftFilter = computed(() => {
  const filter = draft.value.filter;
  return filter && (!["and", "or"].includes(filter.op) || filter.children?.length) ? filter : undefined;
});
const pendingChanges = computed(() => {
  if (!applied.value) return false;
  const filter = draftFilter.value;
  return (
    draft.value.where.trim() !== applied.value.where.trim() ||
    JSON.stringify(filter || null) !== JSON.stringify(applied.value.filter || null) ||
    JSON.stringify(draft.value.sort) !== JSON.stringify(applied.value.sort)
  );
});
const appliedCondition = computed(
  () => applied.value?.where || t(applied.value?.filter ? "Chen.GoBrowseBuilder" : "Chen.GoBrowseNoFilter")
);
function submit(clear = false) {
  if (locked.value || !supported.value || !props.query.browseObject) return;
  const filter = clear ? undefined : draftFilter.value;
  if (clear) {
    draft.value.where = "";
    draft.value.filter = undefined;
  }
  emit("submit", {
    schema: props.query.browseObject.schema,
    table: props.query.browseObject.name,
    where: clear ? "" : draft.value.where,
    filter,
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
      <p v-if="query.error || query.execution?.error?.code === 'invalid_browse'" role="alert" class="mb-1 text-error">
        {{ t("Chen.GoBrowseSimpleHint") }}
      </p>
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
        <span class="font-ui-mono text-muted">WHERE</span>
        <UInput
          v-model="draft.where"
          class="min-w-0 flex-1 font-ui-mono"
          size="xs"
          :aria-label="t('Chen.GoBrowseWhere')"
          placeholder="id > 10 AND name LIKE 'A%'"
          :title="t('Chen.GoBrowseWhereHint')"
          :maxlength="16384"
          :disabled="locked"
          @update:model-value="draft.filter = undefined"
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
    </template>
  </section>
</template>
