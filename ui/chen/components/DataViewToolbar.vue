<script setup lang="ts">
import type { ChenConsoleState, ChenDataViewAction, ChenDataViewField } from "~/chen/types";

import { getChenDataViewToolbarState } from "~/chen/composables/useChenDataView";
import { useChenGridPreferences } from "~/chen/composables/useChenGridPreferences";

const props = withDefaults(
  defineProps<{
    state: ChenConsoleState;
    fields?: ChenDataViewField[];
    gridPreferenceKey?: string;
    pinnable?: boolean;
    importable?: boolean;
    busy?: boolean;
  }>(),
  {
    fields: () => [],
    gridPreferenceKey: "default",
    pinnable: false,
    importable: false,
    busy: false
  }
);

const emit = defineEmits<{
  action: [action: ChenDataViewAction, data?: number];
  export: [];
  import: [];
}>();

const { t } = useI18n();

const nullDisplayOptions = computed(() => [
  { label: "NULL", value: "keyword" },
  { label: "(null)", value: "parenthesized" },
  { label: t("Chen.Blank"), value: "blank" }
]);
const controls = computed(() => getChenDataViewToolbarState(props.state));
const gridPreferences = useChenGridPreferences();
const fieldSearch = ref("");
const hiddenFields = computed(() => {
  const fieldNames = new Set(props.fields.map((field) => field.name));
  return (gridPreferences.value.hiddenFieldsByGrid[props.gridPreferenceKey] || []).filter((name) =>
    fieldNames.has(name)
  );
});
const visibleFieldCount = computed(() => props.fields.length - hiddenFields.value.length);
const filteredFields = computed(() => {
  const query = fieldSearch.value.trim().toLowerCase();
  if (!query) return props.fields;
  return props.fields.filter((field) => (field.label || field.name).toLowerCase().includes(query));
});

function fieldVisible(name: string) {
  return !hiddenFields.value.includes(name);
}

function setHiddenFields(fields: string[]) {
  gridPreferences.value.hiddenFieldsByGrid = {
    ...gridPreferences.value.hiddenFieldsByGrid,
    [props.gridPreferenceKey]: fields
  };
}

function toggleField(name: string, visible: boolean) {
  const next = new Set(hiddenFields.value);
  if (visible) next.delete(name);
  else if (visibleFieldCount.value > 1) next.add(name);
  setHiddenFields([...next]);
}

function showAllFields() {
  setHiddenFields([]);
}

function requestExport() {
  emit("export");
}
</script>

<template>
  <div class="flex items-center gap-1">
    <UButton
      size="xs"
      icon="i-lucide-refresh-cw"
      color="neutral"
      variant="ghost"
      class="chen-data-view-toolbar-button text-muted hover:bg-[var(--app-hover-soft)] hover:text-[var(--app-fg)]"
      :aria-label="t('Chen.RefreshData')"
      :title="t('Chen.RefreshData')"
      :loading="controls.loading || busy"
      :disabled="controls.loading || busy"
      @click="emit('action', 'refresh')"
    />
    <UButton
      v-if="importable"
      size="xs"
      icon="i-lucide-upload"
      color="neutral"
      variant="ghost"
      class="chen-data-view-toolbar-button text-muted hover:bg-[var(--app-hover-soft)] hover:text-[var(--app-fg)]"
      :aria-label="t('Chen.ImportCsv')"
      :title="t('Chen.ImportCsv')"
      :disabled="controls.loading || busy"
      @click="emit('import')"
    />
    <UButton
      size="xs"
      icon="i-lucide-download"
      color="neutral"
      variant="ghost"
      class="chen-data-view-toolbar-button text-muted hover:bg-[var(--app-hover-soft)] hover:text-[var(--app-fg)]"
      :aria-label="t('Chen.ExportData')"
      :title="t('Chen.ExportData')"
      :disabled="controls.loading || busy"
      @click="requestExport"
    />
    <UPopover :content="{ align: 'end', side: 'bottom', sideOffset: 6 }" :ui="{ content: 'p-0' }">
      <UButton
        size="xs"
        icon="i-lucide-settings-2"
        color="neutral"
        variant="ghost"
        class="chen-data-view-toolbar-button text-muted hover:bg-[var(--app-hover-soft)] hover:text-[var(--app-fg)]"
        :aria-label="t('Chen.TableDisplaySettings')"
        :title="t('Chen.TableDisplaySettings')"
      />

      <template #content>
        <div class="w-64 space-y-3 p-3">
          <div>
            <p class="text-xs font-medium text-highlighted">{{ t("Chen.TableDisplay") }}</p>
            <p class="mt-0.5 text-[11px] text-muted">{{ t("Chen.TableDisplayHint") }}</p>
          </div>

          <label class="flex items-center justify-between gap-3 text-xs">
            <span>{{ t("Chen.NullValues") }}</span>
            <USelect
              v-model="gridPreferences.nullDisplay"
              class="w-28"
              size="xs"
              :items="nullDisplayOptions"
              value-key="value"
            />
          </label>

          <label class="flex items-center justify-between gap-3 text-xs">
            <span>{{ t("Chen.MarkEmptyStrings") }}</span>
            <USwitch v-model="gridPreferences.showEmptyStrings" size="sm" />
          </label>
          <label class="flex items-center justify-between gap-3 text-xs">
            <span>{{ t("Chen.ZebraStripes") }}</span>
            <USwitch v-model="gridPreferences.stripedRows" size="sm" />
          </label>
          <label class="flex items-center justify-between gap-3 text-xs">
            <span>{{ t("Chen.CellBorders") }}</span>
            <USwitch v-model="gridPreferences.showCellBorders" size="sm" />
          </label>
          <label class="flex items-center justify-between gap-3 text-xs">
            <span>{{ t("Chen.CompactRows") }}</span>
            <USwitch v-model="gridPreferences.compactRows" size="sm" />
          </label>

          <div v-if="fields.length" class="space-y-2 border-t border-default pt-3">
            <div class="flex items-center justify-between gap-3">
              <span class="text-xs font-medium text-highlighted">{{ t("Chen.VisibleFields") }}</span>
              <UButton
                size="xs"
                color="neutral"
                variant="link"
                class="p-0"
                :disabled="hiddenFields.length === 0"
                @click="showAllFields"
              >
                {{ t("Chen.ShowAll") }}
              </UButton>
            </div>
            <UInput
              v-if="fields.length > 8"
              v-model="fieldSearch"
              size="xs"
              icon="i-lucide-search"
              :placeholder="t('Chen.SearchFields')"
            />
            <div class="max-h-48 space-y-1 overflow-y-auto pr-1">
              <label
                v-for="field in filteredFields"
                :key="field.name"
                class="flex min-w-0 items-center justify-between gap-3 rounded px-1 py-1 text-xs hover:bg-accented"
              >
                <span class="min-w-0 truncate" :title="field.label || field.name">
                  {{ field.label || field.name }}
                </span>
                <UCheckbox
                  :model-value="fieldVisible(field.name)"
                  :disabled="fieldVisible(field.name) && visibleFieldCount <= 1"
                  @update:model-value="toggleField(field.name, $event === true)"
                />
              </label>
            </div>
          </div>
        </div>
      </template>
    </UPopover>
    <UButton
      v-if="pinnable"
      size="xs"
      icon="i-lucide-pin"
      :color="controls.pinned ? 'primary' : 'neutral'"
      :variant="controls.pinned ? 'soft' : 'ghost'"
      :aria-pressed="controls.pinned"
      :aria-label="controls.pinned ? t('Chen.UnpinResult') : t('Chen.PinResult')"
      :title="controls.pinned ? t('Chen.UnpinResult') : t('Chen.PinResult')"
      :disabled="controls.loading || busy"
      @click="emit('action', 'toggle_pinned')"
    />
  </div>
</template>

<style scoped>
:deep(.chen-data-view-toolbar-button:hover:not(:disabled)) {
  background-color: var(--app-hover-soft) !important;
  color: var(--app-fg) !important;
}
</style>
