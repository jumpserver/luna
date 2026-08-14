<script setup lang="ts">
import type { ChenCreateTableWorkspaceTab } from "~/chen/types";

import SqlPreviewDialog from "~/chen/components/SqlPreviewDialog.vue";
import { buildChenCreateTableSql, chenCreateTableTypes } from "~/chen/utils/createTableSql";

const props = defineProps<{ tab: ChenCreateTableWorkspaceTab }>();
const emit = defineEmits<{
  addColumn: [];
  removeColumn: [id: string];
  submit: [sql: string];
  updateColumn: [id: string, patch: Partial<ChenCreateTableWorkspaceTab["columns"][number]>];
  updateTableName: [value: string];
}>();

const previewOpen = ref(false);
const typeOptions = computed(() =>
  chenCreateTableTypes(props.tab.dbType).map((type) => ({ label: type, value: type }))
);
const validationError = computed(() => {
  try {
    buildChenCreateTableSql(props.tab.tableName, props.tab.columns, props.tab.dbType);
    return "";
  } catch (cause) {
    return cause instanceof Error ? cause.message : String(cause);
  }
});
const generatedSql = computed(() => {
  if (validationError.value) return "";
  return buildChenCreateTableSql(props.tab.tableName, props.tab.columns, props.tab.dbType);
});

function addColumn() {
  emit("addColumn");
}

function removeColumn(id: string) {
  if (props.tab.submitting) return;
  emit("removeColumn", id);
}

function updateColumn(id: string, patch: Partial<ChenCreateTableWorkspaceTab["columns"][number]>) {
  emit("updateColumn", id, patch);
}

function submit() {
  if (props.tab.submitting || validationError.value) return;
  previewOpen.value = false;
  emit("submit", generatedSql.value);
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-[var(--workspace-surface-main)]">
    <div class="flex shrink-0 items-center justify-between border-b border-default px-4 py-3">
      <div>
        <h2 class="text-sm font-medium text-highlighted">Create table</h2>
        <p class="mt-0.5 text-[11px] text-muted">Define the table columns, then submit the generated SQL.</p>
      </div>
      <UBadge v-if="tab.created" color="success" variant="subtle">Created</UBadge>
    </div>

    <div class="min-h-0 flex-1 overflow-auto p-4">
      <div class="mx-auto max-w-6xl space-y-4">
        <div class="max-w-md">
          <label class="mb-1.5 block text-xs font-medium text-highlighted" for="chen-create-table-name">
            Table name
          </label>
          <UInput
            id="chen-create-table-name"
            :model-value="tab.tableName"
            class="w-full"
            placeholder="e.g. users"
            :disabled="tab.submitting"
            autofocus
            @update:model-value="emit('updateTableName', $event)"
          />
        </div>

        <div class="overflow-x-auto rounded-lg border border-default bg-[var(--workspace-surface-panel)]">
          <table class="w-full min-w-[900px] table-fixed text-left text-xs">
            <thead class="bg-elevated/60 text-muted">
              <tr>
                <th class="w-12 px-3 py-2 font-medium">#</th>
                <th class="px-3 py-2 font-medium">Name</th>
                <th class="w-44 px-3 py-2 font-medium">Type</th>
                <th class="w-40 px-3 py-2 font-medium">Length / precision</th>
                <th class="w-24 px-3 py-2 text-center font-medium">Nullable</th>
                <th class="w-24 px-3 py-2 text-center font-medium">Primary</th>
                <th class="w-14 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="(column, index) in tab.columns" :key="column.id" class="border-t border-default">
                <td class="px-3 py-2 text-muted">{{ index + 1 }}</td>
                <td class="px-3 py-2">
                  <UInput
                    :model-value="column.name"
                    class="w-full"
                    size="sm"
                    placeholder="Column name"
                    :disabled="tab.submitting"
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
                    :disabled="tab.submitting"
                    @update:model-value="updateColumn(column.id, { type: String($event) })"
                  />
                </td>
                <td class="px-3 py-2">
                  <UInput
                    :model-value="column.size"
                    class="w-full"
                    size="sm"
                    placeholder="255 or 10,2"
                    :disabled="tab.submitting"
                    @update:model-value="updateColumn(column.id, { size: $event })"
                  />
                </td>
                <td class="px-3 py-2 text-center">
                  <UCheckbox
                    :model-value="column.nullable"
                    :disabled="tab.submitting || column.primaryKey"
                    @update:model-value="updateColumn(column.id, { nullable: Boolean($event) })"
                  />
                </td>
                <td class="px-3 py-2 text-center">
                  <UCheckbox
                    :model-value="column.primaryKey"
                    :disabled="tab.submitting"
                    @update:model-value="
                      updateColumn(column.id, {
                        primaryKey: Boolean($event),
                        nullable: $event ? false : column.nullable
                      })
                    "
                  />
                </td>
                <td class="px-3 py-2 text-right">
                  <UButton
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-trash-2"
                    size="xs"
                    :disabled="tab.submitting"
                    :aria-label="`Remove column ${index + 1}`"
                    @click="removeColumn(column.id)"
                  />
                </td>
              </tr>
              <tr v-if="!tab.columns.length" class="border-t border-default">
                <td colspan="7" class="px-3 py-8 text-center text-muted">Add at least one column.</td>
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
              @click="addColumn"
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

    <div class="flex shrink-0 items-center justify-between border-t border-default px-4 py-3">
      <p class="text-xs" :class="validationError ? 'text-warning' : 'text-muted'">
        {{ validationError || `SQL dialect: ${tab.dbType || "default"}` }}
      </p>
      <UButton icon="i-lucide-eye" :disabled="Boolean(validationError) || tab.submitting" @click="previewOpen = true">
        Preview &amp; Save
      </UButton>
    </div>

    <SqlPreviewDialog
      :open="previewOpen"
      :title="`Create table · ${tab.tableName.trim()}`"
      :sql="generatedSql"
      confirm-label="Create table"
      :busy="tab.submitting"
      @confirm="submit"
      @update:open="previewOpen = $event"
    />
  </div>
</template>
