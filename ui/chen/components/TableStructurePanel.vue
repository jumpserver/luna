<script setup lang="ts">
import type { ChenTableStructureWorkspaceTab } from "~/chen/types";

import SqlPreviewDialog from "~/chen/components/SqlPreviewDialog.vue";
import { buildChenAlterTableSql } from "~/chen/utils/alterTableSql";
import { chenCreateTableTypes } from "~/chen/utils/createTableSql";

const props = defineProps<{ tab: ChenTableStructureWorkspaceTab }>();
const emit = defineEmits<{
  addColumn: [];
  reset: [];
  submit: [sql: string];
  updateColumn: [id: string, patch: Partial<ChenTableStructureWorkspaceTab["columns"][number]>];
}>();

const confirmOpen = ref(false);
const typeOptions = computed(() =>
  [...new Set([...chenCreateTableTypes(props.tab.dbType), ...props.tab.columns.map((column) => column.type)])].map(
    (type) => ({ label: type, value: type })
  )
);
const sqlResult = computed(() => {
  try {
    return {
      sql: buildChenAlterTableSql(props.tab.schemaName, props.tab.tableName, props.tab.columns, props.tab.dbType),
      error: ""
    };
  } catch (cause) {
    return { sql: "", error: cause instanceof Error ? cause.message : String(cause) };
  }
});
const deletedCount = computed(() => props.tab.columns.filter((column) => column.deleted && !column.added).length);

function updateColumn(id: string, patch: Partial<ChenTableStructureWorkspaceTab["columns"][number]>) {
  emit("updateColumn", id, patch);
}

function requestSubmit() {
  if (!sqlResult.value.sql || props.tab.submitting) return;
  confirmOpen.value = true;
}

function confirmSubmit() {
  if (!sqlResult.value.sql) return;
  confirmOpen.value = false;
  emit("submit", sqlResult.value.sql);
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-[var(--workspace-surface-main)]">
    <div class="flex shrink-0 items-center justify-between border-b border-default px-4 py-3">
      <div>
        <h2 class="text-sm font-medium text-highlighted">Alter table · {{ tab.tableName }}</h2>
        <p class="mt-0.5 text-[11px] text-muted">Add, rename, change, or remove columns.</p>
      </div>
      <UBadge v-if="tab.saved" color="success" variant="subtle">Saved</UBadge>
    </div>

    <div class="min-h-0 flex-1 overflow-auto p-4">
      <div class="mx-auto max-w-6xl space-y-4">
        <div class="overflow-x-auto rounded-lg border border-default bg-[var(--workspace-surface-panel)]">
          <table class="w-full min-w-[900px] table-fixed text-left text-xs">
            <thead class="bg-elevated/60 text-muted">
              <tr>
                <th class="w-12 px-3 py-2 font-medium">#</th>
                <th class="px-3 py-2 font-medium">Name</th>
                <th class="w-44 px-3 py-2 font-medium">Type</th>
                <th class="w-40 px-3 py-2 font-medium">Length / precision</th>
                <th class="w-24 px-3 py-2 text-center font-medium">Nullable</th>
                <th class="w-24 px-3 py-2 text-center font-medium">Status</th>
                <th class="w-14 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(column, index) in tab.columns"
                :key="column.id"
                class="border-t border-default"
                :class="column.deleted ? 'bg-error/5 opacity-60' : ''"
              >
                <td class="px-3 py-2 text-muted">{{ index + 1 }}</td>
                <td class="px-3 py-2">
                  <UInput
                    :model-value="column.name"
                    class="w-full"
                    size="sm"
                    :disabled="tab.submitting || column.deleted"
                    @update:model-value="updateColumn(column.id, { name: $event })"
                  />
                </td>
                <td class="px-3 py-2">
                  <USelect
                    :model-value="column.type"
                    class="w-full"
                    size="sm"
                    :items="typeOptions"
                    value-key="value"
                    :disabled="tab.submitting || column.deleted"
                    @update:model-value="updateColumn(column.id, { type: String($event) })"
                  />
                </td>
                <td class="px-3 py-2">
                  <UInput
                    :model-value="column.size"
                    class="w-full"
                    size="sm"
                    placeholder="255 or 10,2"
                    :disabled="tab.submitting || column.deleted"
                    @update:model-value="updateColumn(column.id, { size: $event })"
                  />
                </td>
                <td class="px-3 py-2 text-center">
                  <UCheckbox
                    :model-value="column.nullable"
                    :disabled="tab.submitting || column.deleted || column.primaryKey"
                    @update:model-value="updateColumn(column.id, { nullable: Boolean($event) })"
                  />
                </td>
                <td class="px-3 py-2 text-center">
                  <UBadge v-if="column.deleted" color="error" variant="subtle">Delete</UBadge>
                  <UBadge v-else-if="column.added" color="success" variant="subtle">New</UBadge>
                  <span v-else class="text-muted">Existing</span>
                </td>
                <td class="px-3 py-2 text-right">
                  <UButton
                    color="neutral"
                    variant="ghost"
                    :icon="column.deleted ? 'i-lucide-undo-2' : 'i-lucide-trash-2'"
                    size="xs"
                    :disabled="tab.submitting"
                    :aria-label="column.deleted ? `Restore ${column.name}` : `Delete ${column.name}`"
                    @click="updateColumn(column.id, { deleted: !column.deleted })"
                  />
                </td>
              </tr>
            </tbody>
          </table>
          <div class="border-t border-default px-3 py-2">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-plus"
              size="sm"
              :disabled="tab.submitting"
              @click="emit('addColumn')"
            >
              Add column
            </UButton>
          </div>
        </div>

        <div
          v-if="tab.submitError"
          class="flex items-start gap-2 rounded-lg border border-error/25 bg-error/10 p-3 text-xs text-error"
        >
          <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-4 shrink-0" />
          <span>{{ tab.submitError }}</span>
        </div>
      </div>
    </div>

    <div class="flex shrink-0 items-center justify-between gap-3 border-t border-default px-4 py-3">
      <p class="min-w-0 truncate text-xs" :class="sqlResult.error ? 'text-warning' : 'text-muted'">
        {{ sqlResult.error || `SQL dialect: ${tab.dbType || "default"}` }}
      </p>
      <div class="flex shrink-0 gap-2">
        <UButton color="neutral" variant="ghost" :disabled="tab.submitting" @click="emit('reset')">Reset</UButton>
        <UButton icon="i-lucide-eye" :disabled="Boolean(sqlResult.error)" @click="requestSubmit">
          Preview &amp; Save
        </UButton>
      </div>
    </div>

    <SqlPreviewDialog
      :open="confirmOpen"
      :title="`Alter table · ${tab.tableName}`"
      :description="`These SQL statements will be executed against ${tab.schemaName ? `${tab.schemaName}.` : ''}${tab.tableName}.`"
      :sql="sqlResult.sql"
      confirm-label="Apply changes"
      :danger="deletedCount > 0"
      :danger-message="
        deletedCount ? `${deletedCount} existing column(s) will be permanently deleted, including their data.` : ''
      "
      :busy="tab.submitting"
      @confirm="confirmSubmit"
      @update:open="confirmOpen = $event"
    />
  </div>
</template>
