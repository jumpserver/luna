<script setup lang="ts">
import type { ChenCreateIndexInput } from "~/chen/utils/indexSql";

import ChenWorkspaceModal from "~/chen/components/WorkspaceModal.vue";
import { buildChenCreateIndexSql, chenIndexMethods } from "~/chen/utils/indexSql";

const props = defineProps<{
  open: boolean;
  schema: string;
  table: string;
  columns: string[];
  dbType: string;
}>();

const emit = defineEmits<{
  "update:open": [open: boolean];
  confirm: [sql: string, name: string];
}>();

const { t } = useI18n();

const name = ref("");
const selectedColumns = ref<string[]>([]);
const unique = ref(false);
const method = ref("");
const visible = computed({
  get: () => props.open,
  set: (open: boolean) => emit("update:open", open)
});
const columnItems = computed(() => props.columns.map((column) => ({ label: column, value: column })));
const methodItems = computed(() => chenIndexMethods(props.dbType).map((value) => ({ label: value, value })));
const input = computed<ChenCreateIndexInput>(() => ({
  schema: props.schema,
  table: props.table,
  name: name.value,
  columns: selectedColumns.value,
  unique: unique.value,
  method: method.value || undefined
}));
const validation = computed(() => {
  try {
    return { sql: buildChenCreateIndexSql(input.value, props.dbType), error: "" };
  } catch {
    return { sql: "", error: t("Chen.InvalidIndexDefinition") };
  }
});

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    name.value = "";
    selectedColumns.value = [];
    unique.value = false;
    method.value = methodItems.value[0]?.value || "";
  }
);

watch(selectedColumns, (columns) => {
  if (name.value || !columns.length) return;
  const base = [props.table, ...columns, "idx"].join("_").replaceAll(/[^\p{L}\p{N}_]+/gu, "_");
  name.value = base.slice(0, 63);
});

function submit() {
  if (!validation.value.sql) return;
  emit("confirm", validation.value.sql, name.value.trim());
  visible.value = false;
}
</script>

<template>
  <ChenWorkspaceModal v-model:open="visible" :title="t('Chen.CreateIndex')">
    <template #body>
      <div class="space-y-4">
        <UFormField :label="t('Chen.IndexName')" required>
          <UInput v-model="name" class="w-full" :placeholder="t('Chen.IndexNameExample')" autofocus />
        </UFormField>

        <UFormField :label="t('Chen.Columns')" required>
          <USelectMenu
            v-model="selectedColumns"
            multiple
            class="w-full"
            :items="columnItems"
            value-key="value"
            label-key="label"
            :placeholder="t('Chen.SelectIndexColumns')"
          />
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-2">
          <label class="flex items-center gap-2 text-sm">
            <UCheckbox v-model="unique" />
            <span>{{ t("Chen.UniqueIndex") }}</span>
          </label>
          <UFormField v-if="methodItems.length" :label="t('Chen.Method')">
            <USelect v-model="method" class="w-full" :items="methodItems" value-key="value" />
          </UFormField>
        </div>

        <div>
          <div class="mb-1.5 text-xs font-medium text-highlighted">{{ t("Chen.SqlPreview") }}</div>
          <pre class="max-h-52 overflow-auto rounded-md bg-elevated p-3 text-xs text-muted">{{
            validation.sql || validation.error
          }}</pre>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="visible = false">{{ t("Common.Cancel") }}</UButton>
        <UButton icon="i-lucide-database-zap" :disabled="Boolean(validation.error)" @click="submit">
          {{ t("Chen.CreateIndex") }}
        </UButton>
      </div>
    </template>
  </ChenWorkspaceModal>
</template>
