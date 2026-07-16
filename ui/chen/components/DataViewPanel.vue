<script setup lang="ts">
import type { ChenDataViewAction, ChenDataViewConsoleTab, ChenDataViewPropertyTab } from "~/chen/types";

import ChenDataGrid from "~/chen/components/DataGrid.client.vue";
import DataViewToolbar from "~/chen/components/DataViewToolbar.vue";
import { useChenDataViewDerivedMeta } from "~/chen/composables/useChenDataViewDerivedMeta";

const props = defineProps<{
  tab: ChenDataViewConsoleTab
  dbType?: string
  protocol?: string
}>();

const emit = defineEmits<{
  dataViewAction: [tab: ChenDataViewConsoleTab, action: ChenDataViewAction, data?: number]
  download: [tab: ChenDataViewConsoleTab]
  updatePanel: [tab: ChenDataViewConsoleTab, panel: "data" | "properties"]
  updatePropertyTab: [tab: ChenDataViewConsoleTab, propertyTab: ChenDataViewPropertyTab]
}>();

const dbTypeRef = computed(() => props.dbType);
const protocolRef = computed(() => props.protocol);
const {
  dataViewBasicInfo,
  dataViewColumns,
  dataViewConstraints,
  dataViewDDL,
  dataViewForeignKeys,
  dataViewIndexes,
  dataViewPropertyTabs
} = useChenDataViewDerivedMeta(dbTypeRef, protocolRef);
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="flex items-center justify-between gap-2 border-b border-default px-2 py-1">
      <div class="flex min-w-0 items-center gap-1 overflow-x-auto">
        <button
          class="rounded-md px-2 py-1 text-xs"
          :class="tab.activePanel === 'data' ? 'bg-accented' : 'text-muted'"
          @click="emit('updatePanel', tab, 'data')"
        >
          Data
        </button>
        <button
          class="rounded-md px-2 py-1 text-xs"
          :class="tab.activePanel === 'properties' ? 'bg-accented' : 'text-muted'"
          @click="emit('updatePanel', tab, 'properties')"
        >
          Properties
        </button>

        <template v-if="tab.activePanel === 'properties'">
          <button
            v-for="propertyTab in dataViewPropertyTabs"
            :key="propertyTab.id"
            class="rounded-md px-2 py-1 text-xs"
            :class="tab.activePropertyTab === propertyTab.id ? 'bg-accented' : 'text-muted'"
            @click="emit('updatePropertyTab', tab, propertyTab.id)"
          >
            {{ propertyTab.label }}
          </button>
        </template>
      </div>

      <div class="flex items-center gap-1">
        <DataViewToolbar
          v-if="tab.activePanel === 'data'"
          :state="tab.state"
          @action="(action, data) => emit('dataViewAction', tab, action, data)"
        />
        <UButton
          size="xs"
          icon="i-lucide-download"
          color="neutral"
          variant="soft"
          @click="emit('download', tab)"
        />
      </div>
    </div>

    <div v-if="tab.activePanel === 'data'" class="min-h-0 flex-1 overflow-auto">
      <ChenDataGrid
        :key="`${tab.id}:${tab.data?.fields?.map(field => field.name).join(',') || ''}:${tab.data?.data?.length || 0}`"
        :dataset="tab.data"
      />
    </div>

    <div v-else class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div v-if="tab.activePropertyTab === 'basic'" class="grid min-h-0 flex-1 gap-3 overflow-auto p-4 md:grid-cols-2">
        <div
          v-for="item in dataViewBasicInfo(tab)"
          :key="item.label"
          class="rounded-lg border border-default bg-[var(--workspace-surface-sub-panel)] px-3 py-2"
        >
          <div class="mb-1 text-[11px] uppercase tracking-wide text-muted">
            {{ item.label }}
          </div>
          <div class="text-sm">
            {{ item.value }}
          </div>
        </div>
      </div>

      <div v-else-if="tab.activePropertyTab === 'columns'" class="min-h-0 flex-1 overflow-auto p-3">
        <div class="overflow-hidden rounded-lg border border-default">
          <table class="w-full text-left text-sm">
            <thead class="bg-[var(--workspace-surface-sub-panel)] text-muted">
              <tr>
                <th class="px-3 py-2 font-medium">
                  Name
                </th>
                <th class="px-3 py-2 font-medium">
                  Type
                </th>
                <th class="px-3 py-2 font-medium">
                  Nullable
                </th>
                <th class="px-3 py-2 font-medium">
                  Key
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="column in dataViewColumns(tab)" :key="column.name" class="border-t border-default">
                <td class="px-3 py-2">
                  {{ column.name }}
                </td>
                <td class="px-3 py-2 text-muted">
                  {{ column.type }}
                </td>
                <td class="px-3 py-2 text-muted">
                  {{ column.nullable }}
                </td>
                <td class="px-3 py-2 text-muted">
                  {{ column.key }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-else-if="tab.activePropertyTab === 'indexes'" class="min-h-0 flex-1 overflow-auto p-3">
        <div class="overflow-hidden rounded-lg border border-default">
          <table class="w-full text-left text-sm">
            <thead class="bg-[var(--workspace-surface-sub-panel)] text-muted">
              <tr>
                <th class="px-3 py-2 font-medium">
                  Name
                </th>
                <th class="px-3 py-2 font-medium">
                  Columns
                </th>
                <th class="px-3 py-2 font-medium">
                  Unique
                </th>
                <th class="px-3 py-2 font-medium">
                  Method
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="index in dataViewIndexes(tab)" :key="index.name" class="border-t border-default">
                <td class="px-3 py-2">
                  {{ index.name }}
                </td>
                <td class="px-3 py-2 text-muted">
                  {{ index.columns }}
                </td>
                <td class="px-3 py-2 text-muted">
                  {{ index.unique }}
                </td>
                <td class="px-3 py-2 text-muted">
                  {{ index.method }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-else-if="tab.activePropertyTab === 'foreignKeys'" class="min-h-0 flex-1 overflow-auto p-3">
        <div v-if="dataViewForeignKeys(tab).length" class="overflow-hidden rounded-lg border border-default">
          <table class="w-full text-left text-sm">
            <thead class="bg-[var(--workspace-surface-sub-panel)] text-muted">
              <tr>
                <th class="px-3 py-2 font-medium">
                  Name
                </th>
                <th class="px-3 py-2 font-medium">
                  Column
                </th>
                <th class="px-3 py-2 font-medium">
                  References
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="foreignKey in dataViewForeignKeys(tab)" :key="foreignKey.name" class="border-t border-default">
                <td class="px-3 py-2">
                  {{ foreignKey.name }}
                </td>
                <td class="px-3 py-2 text-muted">
                  {{ foreignKey.column }}
                </td>
                <td class="px-3 py-2 text-muted">
                  {{ foreignKey.references }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="grid h-full place-items-center text-sm text-muted">
          No foreign keys in preview.
        </div>
      </div>

      <div v-else-if="tab.activePropertyTab === 'constraints'" class="min-h-0 flex-1 overflow-auto p-3">
        <div class="overflow-hidden rounded-lg border border-default">
          <table class="w-full text-left text-sm">
            <thead class="bg-[var(--workspace-surface-sub-panel)] text-muted">
              <tr>
                <th class="px-3 py-2 font-medium">
                  Name
                </th>
                <th class="px-3 py-2 font-medium">
                  Type
                </th>
                <th class="px-3 py-2 font-medium">
                  Definition
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="constraint in dataViewConstraints(tab)" :key="constraint.name" class="border-t border-default">
                <td class="px-3 py-2">
                  {{ constraint.name }}
                </td>
                <td class="px-3 py-2 text-muted">
                  {{ constraint.type }}
                </td>
                <td class="px-3 py-2 font-ui-mono text-xs text-muted">
                  {{ constraint.definition }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-else class="min-h-0 flex-1 overflow-auto p-3">
        <pre class="rounded-lg border border-default bg-[var(--workspace-surface-sub-panel)] p-3 font-ui-mono text-xs text-[var(--app-fg)]">{{ dataViewDDL(tab) }}</pre>
      </div>
    </div>
  </div>
</template>
