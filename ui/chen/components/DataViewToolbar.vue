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

const nullDisplayOptions = [
  { label: "NULL", value: "keyword" },
  { label: "(null)", value: "parenthesized" },
  { label: "Blank", value: "blank" }
];
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
      aria-label="Refresh data"
      title="Refresh data"
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
      aria-label="Import CSV"
      title="Import CSV"
      :disabled="controls.loading || busy"
      @click="emit('import')"
    />
    <UButton
      size="xs"
      icon="i-lucide-download"
      color="neutral"
      variant="ghost"
      aria-label="Export data"
      title="Export data"
      :disabled="controls.loading || busy"
      @click="requestExport"
    />
    <UPopover :content="{ align: 'end', side: 'bottom', sideOffset: 6 }" :ui="{ content: 'p-0' }">
      <UButton
        size="xs"
        icon="i-lucide-settings-2"
        color="neutral"
        variant="ghost"
        aria-label="Table display settings"
        title="Table display settings"
      />

      <template #content>
        <div class="w-64 space-y-3 p-3">
          <div>
            <p class="text-xs font-medium text-highlighted">Table display</p>
            <p class="mt-0.5 text-[11px] text-muted">Applied to all database result grids.</p>
          </div>

          <label class="flex items-center justify-between gap-3 text-xs">
            <span>NULL values</span>
            <USelect
              v-model="gridPreferences.nullDisplay"
              class="w-28"
              size="xs"
              :items="nullDisplayOptions"
              value-key="value"
            />
          </label>

          <label class="flex items-center justify-between gap-3 text-xs">
            <span>Mark empty strings</span>
            <USwitch v-model="gridPreferences.showEmptyStrings" size="sm" />
          </label>
          <label class="flex items-center justify-between gap-3 text-xs">
            <span>Zebra stripes</span>
            <USwitch v-model="gridPreferences.stripedRows" size="sm" />
          </label>
          <label class="flex items-center justify-between gap-3 text-xs">
            <span>Cell borders</span>
            <USwitch v-model="gridPreferences.showCellBorders" size="sm" />
          </label>
          <label class="flex items-center justify-between gap-3 text-xs">
            <span>Compact rows</span>
            <USwitch v-model="gridPreferences.compactRows" size="sm" />
          </label>

          <div v-if="fields.length" class="space-y-2 border-t border-default pt-3">
            <div class="flex items-center justify-between gap-3">
              <span class="text-xs font-medium text-highlighted">Visible fields</span>
              <UButton
                size="xs"
                color="neutral"
                variant="link"
                class="p-0"
                :disabled="hiddenFields.length === 0"
                @click="showAllFields"
              >
                Show all
              </UButton>
            </div>
            <UInput
              v-if="fields.length > 8"
              v-model="fieldSearch"
              size="xs"
              icon="i-lucide-search"
              placeholder="Search fields"
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
      :aria-label="controls.pinned ? 'Unpin result' : 'Pin result'"
      :title="controls.pinned ? 'Unpin result' : 'Pin result'"
      :disabled="controls.loading || busy"
      @click="emit('action', 'toggle_pinned')"
    />
  </div>
</template>
