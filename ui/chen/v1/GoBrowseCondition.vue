<script setup lang="ts">
import type { GoBrowseFilter } from "./api";
import { useI18n } from "vue-i18n";

const props = defineProps<{
  columns: { label: string; value: string }[];
  locked: boolean;
  depth: number;
  canAdd: boolean;
}>();
const emit = defineEmits<{ remove: [] }>();
const condition = defineModel<GoBrowseFilter>("condition", { required: true });
const { t } = useI18n();
const operators = ["eq", "ne", "lt", "le", "gt", "ge", "like", "not_like", "in", "not_in", "is_null", "not_null"].map(
  (op, i) => ({
    value: op,
    label: ["=", "<>", "<", "<=", ">", ">=", "LIKE", "NOT LIKE", "IN", "NOT IN", "IS NULL", "IS NOT NULL"][i]
  })
);
function add(group: boolean) {
  if (props.locked || !props.canAdd || !props.columns.length || props.depth >= 8) return;
  (condition.value.children ||= []).push(
    group
      ? { op: "and", children: [{ op: "eq", column: props.columns[0]!.value, values: [""] }] }
      : { op: "eq", column: props.columns[0]!.value, values: [""] }
  );
}
function values(value: string) {
  condition.value.values = ["in", "not_in"].includes(condition.value.op) ? value.split("\n") : [value];
}
</script>

<template>
  <fieldset
    v-if="['and', 'or'].includes(condition.op)"
    :aria-label="t('Chen.GoBrowseBuilder')"
    class="space-y-2 rounded border border-default p-2"
    :disabled="locked"
  >
    <div class="flex flex-wrap items-center gap-2">
      <USelect v-model="condition.op" :items="['and', 'or']" :aria-label="t('Chen.GoBrowseJoin')" :disabled="locked" />
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        :label="t('Chen.GoBrowseAdd')"
        :disabled="locked || !canAdd || !columns.length || depth >= 8"
        @click="add(false)"
      />
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        :label="t('Chen.GoBrowseAddGroup')"
        :disabled="locked || !canAdd || !columns.length || depth >= 7"
        @click="add(true)"
      />
      <UButton
        v-if="depth > 0"
        icon="i-lucide-x"
        size="xs"
        color="neutral"
        variant="ghost"
        :aria-label="t('Chen.GoBrowseRemove')"
        :disabled="locked"
        @click="emit('remove')"
      />
    </div>
    <GoBrowseCondition
      v-for="(child, index) in condition.children"
      :key="index"
      v-model:condition="condition.children![index]!"
      :columns="columns"
      :locked="locked"
      :depth="depth + 1"
      :can-add="canAdd"
      @remove="condition.children!.splice(index, 1)"
    />
  </fieldset>
  <div v-else class="flex flex-wrap items-center gap-2">
    <USelect v-model="condition.column" :items="columns" :aria-label="t('Chen.Column')" :disabled="locked" />
    <USelect v-model="condition.op" :items="operators" :aria-label="t('Chen.Operator')" :disabled="locked" />
    <UTextarea
      v-if="!['is_null', 'not_null'].includes(condition.op)"
      :model-value="condition.values?.join('\n') || ''"
      :rows="1"
      :aria-label="t('Chen.Value')"
      :disabled="locked"
      @update:model-value="values"
    />
    <UButton
      icon="i-lucide-x"
      size="xs"
      color="neutral"
      variant="ghost"
      :aria-label="t('Chen.GoBrowseRemove')"
      :disabled="locked"
      @click="emit('remove')"
    />
  </div>
</template>
