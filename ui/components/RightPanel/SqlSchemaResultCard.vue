<script setup lang="ts">
interface SqlSchemaColumn {
  name: string;
  type: string;
  nullable: boolean;
  default?: string | null;
}

interface SqlTableSchema {
  database?: string;
  schema?: string;
  table: string;
  columns: SqlSchemaColumn[];
}

const props = defineProps<{
  data: {
    database?: string;
    tables?: SqlTableSchema[];
    error?: string;
    truncated?: boolean;
  };
}>();
const { t } = useI18n();
const tables = computed(() => (Array.isArray(props.data.tables) ? props.data.tables : []));

function tableName(table: SqlTableSchema) {
  return table.schema ? `${table.schema}.${table.table}` : table.table;
}
</script>

<template>
  <section class="overflow-hidden rounded-xl border border-default bg-elevated/40">
    <header class="flex items-center gap-2 border-b border-default p-2.5">
      <span class="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <UIcon name="i-lucide-table-properties" class="size-4" />
      </span>
      <div class="min-w-0">
        <div class="text-xs font-semibold text-highlighted">{{ t("RightPanel.AISchemaResultTitle") }}</div>
        <div class="truncate text-[10px] text-muted">{{ data.database || "-" }}</div>
      </div>
    </header>

    <p v-if="data.error" class="p-2.5 text-xs text-error">
      {{ data.error }}
    </p>
    <p v-else-if="tables.length === 0" class="p-2.5 text-xs text-muted">
      {{ t("RightPanel.AISchemaResultEmpty") }}
    </p>

    <p v-if="data.truncated" class="border-b border-default bg-warning/5 px-2.5 py-2 text-[10px] text-warning">
      {{ t("RightPanel.AISchemaResultTruncated") }}
    </p>

    <div v-else class="divide-y divide-default">
      <section v-for="table in tables" :key="`${table.schema || ''}.${table.table}`" class="p-2.5">
        <div class="mb-2 truncate font-mono text-[11px] font-semibold text-highlighted" :title="tableName(table)">
          {{ tableName(table) }}
        </div>
        <div class="overflow-x-auto rounded-lg border border-default">
          <table class="w-full min-w-[420px] text-left text-[10px]">
            <thead class="bg-elevated text-muted">
              <tr>
                <th class="px-2 py-1.5 font-medium">{{ t("RightPanel.AISchemaColumnName") }}</th>
                <th class="px-2 py-1.5 font-medium">{{ t("RightPanel.AISchemaColumnType") }}</th>
                <th class="px-2 py-1.5 font-medium">{{ t("RightPanel.AISchemaColumnNullable") }}</th>
                <th class="px-2 py-1.5 font-medium">{{ t("RightPanel.AISchemaColumnDefault") }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-default">
              <tr v-for="column in table.columns" :key="column.name">
                <td class="px-2 py-1.5 font-mono text-highlighted">{{ column.name }}</td>
                <td class="px-2 py-1.5 font-mono text-muted">{{ column.type }}</td>
                <td class="px-2 py-1.5 text-muted">
                  {{ column.nullable ? t("RightPanel.AISchemaYes") : t("RightPanel.AISchemaNo") }}
                </td>
                <td class="max-w-40 truncate px-2 py-1.5 font-mono text-muted" :title="column.default ?? ''">
                  {{ column.default ?? "-" }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </section>
</template>
