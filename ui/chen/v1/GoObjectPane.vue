<script setup lang="ts">
import type { ChenGoApi, GoCatalogColumn, GoCatalogObject } from "./api";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import GoObjectDetails from "./GoObjectDetails.vue";
const props = defineProps<{
  object: GoCatalogObject;
  dialect: string;
  api: ChenGoApi;
  sessionId: string;
  ready: boolean;
  canCopy: boolean;
  canPaste: boolean;
}>();
const emit = defineEmits<{ query: []; preview: []; browse: []; schemaEdit: [mode: "alter" | "index"] }>();
const details = ref(false);
const { t } = useI18n();
const columns = ref<GoCatalogColumn[]>([]);
const cursor = ref<string>();
const hasMore = ref(false);
const busy = ref(false);
const error = ref("");
const search = ref("");
const columnTable = ref<HTMLElement>();
const filteredColumns = computed(() => {
  const query = search.value.trim().toLocaleLowerCase();
  return columns.value
    .map((column, index) => ({ column, index }))
    .filter(
      ({ column }) =>
        !query ||
        [column.name, column.data_type, column.comment || ""].some((value) => value.toLocaleLowerCase().includes(query))
    );
});
let controller: AbortController | undefined;
async function load(more = false) {
  if (!props.ready || busy.value) return;
  controller?.abort();
  controller = new AbortController();
  const current = controller;
  busy.value = true;
  error.value = "";
  try {
    const page = await props.api.catalogColumns(
      props.sessionId,
      props.object.schema,
      props.object.name,
      more ? cursor.value : undefined,
      current.signal
    );
    if (current.signal.aborted) return;
    columns.value = more ? [...columns.value, ...page.items] : page.items;
    cursor.value = page.next_cursor;
    hasMore.value = page.has_more;
  } catch (cause) {
    if (!current.signal.aborted) error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    if (!current.signal.aborted) busy.value = false;
  }
}
onMounted(() => load());
watch(
  () => props.ready,
  (ready) => {
    if (ready && !columns.value.length && !busy.value) void load();
  }
);
onBeforeUnmount(() => controller?.abort());
function preventCopy(event: ClipboardEvent) {
  if (!props.canCopy) event.preventDefault();
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col" data-chen-structure>
    <div class="flex shrink-0 flex-wrap items-center gap-2 border-b border-default px-3 py-2">
      <UIcon :name="object.kind === 'view' ? 'i-lucide-eye' : 'i-lucide-table-2'" class="size-4" />
      <h2
        class="min-w-0 flex-1 truncate text-sm font-medium"
        :title="`${object.database}.${object.schema}.${object.name}`"
      >
        {{ object.database }}
        <template v-if="object.schema && object.schema !== object.database">/ {{ object.schema }}</template>
        / {{ object.name }}
      </h2>
      <UButton
        v-if="object.kind === 'table'"
        :label="t('Chen.GoWriteBrowse')"
        icon="i-lucide-table-properties"
        size="xs"
        color="neutral"
        variant="soft"
        :disabled="!ready || dialect === 'clickhouse'"
        :title="dialect === 'clickhouse' ? t('Chen.ClickHouseDataViewReadOnly') : undefined"
        @click="emit('browse')"
      />
      <UDropdownMenu
        v-if="object.kind === 'table'"
        :items="[
          {
            label: t('Chen.GoWriteAlter'),
            icon: 'i-lucide-table-properties',
            onSelect: () => emit('schemaEdit', 'alter')
          },
          { label: t('Chen.Indexes'), icon: 'i-lucide-list-filter', onSelect: () => emit('schemaEdit', 'index') }
        ]"
      >
        <UButton
          :label="t('Chen.GoWriteStructureActions')"
          icon="i-lucide-settings-2"
          size="xs"
          color="neutral"
          variant="ghost"
          :disabled="!ready"
        />
      </UDropdownMenu>
      <UBadge color="neutral" variant="soft" size="xs">{{ t("Chen.GoV1Structure") }}</UBadge>
      <UButton
        icon="i-lucide-refresh-cw"
        :label="t('Chen.GoV1Refresh')"
        size="xs"
        color="neutral"
        variant="ghost"
        :disabled="busy || !ready"
        @click="load()"
      />
      <UButton
        :label="t('Chen.GoV1GenerateSelect')"
        icon="i-lucide-file-code-2"
        size="xs"
        color="neutral"
        variant="soft"
        :disabled="!canPaste || !ready"
        @click="emit('query')"
      />
      <UButton
        :label="t('Chen.GoV1Preview200')"
        icon="i-lucide-table"
        size="xs"
        color="neutral"
        variant="soft"
        :disabled="!ready"
        @click="emit('preview')"
      />
    </div>
    <div class="flex shrink-0 items-center gap-1 border-b border-default px-3 py-1">
      <UButton
        :label="t('Chen.Columns')"
        size="xs"
        :color="details ? 'neutral' : 'primary'"
        variant="ghost"
        :aria-pressed="!details"
        @click="details = false"
      />
      <UButton
        :label="t('Chen.GoV1ObjectDetails')"
        size="xs"
        :color="details ? 'primary' : 'neutral'"
        variant="ghost"
        :aria-pressed="details"
        @click="details = true"
      />
    </div>
    <GoObjectDetails
      v-if="details"
      :api="api"
      :session-id="sessionId"
      :object="object"
      :ready="ready"
      :can-copy="canCopy"
    />
    <div
      v-show="!details"
      class="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-default px-3 py-2"
    >
      <UInput
        v-model="search"
        icon="i-lucide-search"
        :placeholder="t('Chen.GoV1FindColumn')"
        :aria-label="t('Chen.GoV1FindColumn')"
        size="xs"
        class="w-64 max-w-full"
        @keydown.esc="search = ''"
        @keydown.down.prevent="columnTable?.focus()"
      >
        <template v-if="search" #trailing>
          <UButton
            icon="i-lucide-x"
            :aria-label="t('Chen.GoV1ClearSearch')"
            color="neutral"
            variant="link"
            size="xs"
            @click="search = ''"
          />
        </template>
      </UInput>
      <span role="status" class="text-xs text-muted">
        {{
          search.trim()
            ? t("Chen.GoV1ColumnsFiltered", { count: filteredColumns.length, loaded: columns.length })
            : t("Chen.GoV1ColumnsLoaded", { count: columns.length })
        }}
        <span v-if="hasMore">· {{ t("Chen.GoV1ColumnsPartial") }}</span>
      </span>
      <p v-if="object.comment" class="w-full break-words text-xs text-muted">{{ object.comment }}</p>
      <p v-if="!ready" class="w-full text-xs text-warning">{{ t("Chen.GoV1CatalogStale") }}</p>
    </div>
    <div v-if="error" role="alert" class="flex items-center gap-2 px-4 py-2 text-xs text-error">
      {{ error }}
      <UButton
        :label="t('Chen.GoV1Retry')"
        size="xs"
        color="neutral"
        variant="ghost"
        :disabled="!ready || busy"
        @click="load()"
      />
    </div>
    <div
      v-show="!details"
      ref="columnTable"
      role="region"
      :aria-label="t('Chen.GoV1Structure')"
      :aria-busy="busy"
      tabindex="0"
      class="min-h-0 flex-1 overflow-auto outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary"
      :class="{ 'select-none': !canCopy }"
      @copy="preventCopy"
    >
      <table class="min-w-full border-collapse text-left text-xs">
        <thead class="sticky top-0 z-10 bg-[var(--data-grid-header-background)]">
          <tr>
            <th scope="col" class="w-12 border-b border-r border-default px-3 py-2 text-right font-normal text-muted">
              #
            </th>
            <th
              v-for="label in ['GoV1Column', 'GoV1DataType', 'GoV1Nullable', 'GoV1Comment']"
              :key="label"
              scope="col"
              class="border-b border-r border-default px-3 py-2 font-medium"
            >
              {{ t(`Chen.${label}`) }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="{ column, index } in filteredColumns"
            :key="column.name"
            class="hover:bg-[var(--data-grid-row-hover)]"
          >
            <td class="border-b border-r border-default px-3 py-1.5 text-right tabular-nums text-muted">
              {{ index + 1 }}
            </td>
            <th
              scope="row"
              class="whitespace-nowrap border-b border-r border-default px-3 py-1.5 font-ui-mono font-normal"
              :title="column.name"
            >
              {{ column.name }}
            </th>
            <td
              class="whitespace-nowrap border-b border-r border-default px-3 py-1.5 font-ui-mono"
              :title="column.data_type"
            >
              {{ column.data_type }}
            </td>
            <td class="border-b border-r border-default px-3 py-1.5">
              {{ t(column.nullable ? "Chen.GoV1Yes" : "Chen.GoV1No") }}
            </td>
            <td class="min-w-40 max-w-lg break-words border-b border-default px-3 py-1.5" :title="column.comment">
              {{ column.comment || "—" }}
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="busy" role="status" class="flex items-center gap-2 p-4 text-xs text-muted">
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
        {{ t("Chen.GoV1Loading") }}
      </div>
      <p v-else-if="!columns.length && !error" class="p-4 text-xs text-muted">{{ t("Chen.GoV1EmptyCatalog") }}</p>
      <p v-else-if="!filteredColumns.length && !error" class="p-4 text-xs text-muted">
        {{ t("Chen.GoV1NoMatchingColumns") }}
      </p>
      <UButton
        v-if="hasMore"
        class="m-3"
        :label="t('Chen.GoV1LoadMore')"
        size="xs"
        color="neutral"
        variant="soft"
        :disabled="busy || !ready"
        @click="load(true)"
      />
    </div>
  </div>
</template>
