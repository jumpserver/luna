<script setup lang="ts">
import type { SnippetVariableDefinition } from "~/utils/snippetVariables";

const model = defineModel<SnippetVariableDefinition[]>({ required: true });
const { t } = useI18n();
const typeItems = computed(() => [
  { label: t("Snippets.VariableTypeText"), value: "text" },
  { label: t("Snippets.VariableTypeSelect"), value: "select" }
]);

function addVariable() {
  model.value = [
    ...model.value,
    {
      name: "",
      varName: "",
      type: "text",
      required: false,
      defaultValue: "",
      tips: "",
      options: ""
    }
  ];
}

function updateVariable(index: number, patch: Partial<SnippetVariableDefinition>) {
  model.value = model.value.map((variable, variableIndex) =>
    variableIndex === index ? { ...variable, ...patch } : variable
  );
}

function removeVariable(index: number) {
  model.value = model.value.filter((_variable, variableIndex) => variableIndex !== index);
}

function variablePlaceholder(varName: string) {
  return `{{ jms_${varName || "variable"} }}`;
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center gap-2">
      <p class="mr-auto text-xs text-muted">{{ t("Snippets.VariableEditorHint") }}</p>
      <UButton
        size="xs"
        color="neutral"
        variant="soft"
        icon="i-lucide-plus"
        :label="t('Snippets.VariableAdd')"
        @click="addVariable"
      />
    </div>

    <UEmpty
      v-if="model.length === 0"
      icon="i-lucide-braces"
      size="sm"
      variant="naked"
      :title="t('Snippets.VariableEmpty')"
    />

    <template v-else>
      <section
        v-for="(variable, index) in model"
        :key="variable.id || index"
        class="space-y-3 rounded-lg border border-default bg-elevated/40 p-3"
      >
        <header class="flex items-center gap-2">
          <code class="min-w-0 flex-1 truncate text-xs text-primary">
            {{ variablePlaceholder(variable.varName) }}
          </code>
          <USwitch
            :model-value="variable.required"
            :label="t('Snippets.VariableRequired')"
            @update:model-value="updateVariable(index, { required: Boolean($event) })"
          />
          <UButton
            size="xs"
            color="error"
            variant="ghost"
            icon="i-lucide-trash-2"
            :aria-label="t('ContextMenu.Delete')"
            @click="removeVariable(index)"
          />
        </header>

        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField :label="t('Snippets.VariableName')" required>
            <UInput
              :model-value="variable.name"
              class="w-full"
              @update:model-value="updateVariable(index, { name: String($event || '') })"
            />
          </UFormField>
          <UFormField :label="t('Snippets.VariableKey')" required>
            <UInput
              :model-value="variable.varName"
              class="w-full"
              :ui="{ leading: 'pointer-events-none' }"
              @update:model-value="updateVariable(index, { varName: String($event || '').replace(/^jms_/, '') })"
            >
              <template #leading><span class="font-mono text-xs text-muted">jms_</span></template>
            </UInput>
          </UFormField>
          <UFormField :label="t('Snippets.VariableType')">
            <USelect
              :model-value="variable.type"
              :items="typeItems"
              class="w-full"
              @update:model-value="updateVariable(index, { type: $event === 'select' ? 'select' : 'text' })"
            />
          </UFormField>
          <UFormField :label="t('Snippets.VariableDefault')">
            <UInput
              :model-value="variable.defaultValue"
              class="w-full"
              @update:model-value="updateVariable(index, { defaultValue: String($event || '') })"
            />
          </UFormField>
        </div>

        <UFormField v-if="variable.type === 'select'" :label="t('Snippets.VariableOptions')">
          <UTextarea
            :model-value="variable.options"
            :rows="3"
            class="w-full"
            :placeholder="t('Snippets.VariableOptionsHint')"
            @update:model-value="updateVariable(index, { options: String($event || '') })"
          />
        </UFormField>
        <UFormField :label="t('Snippets.VariableTips')">
          <UInput
            :model-value="variable.tips"
            class="w-full"
            @update:model-value="updateVariable(index, { tips: String($event || '') })"
          />
        </UFormField>
      </section>
    </template>
  </div>
</template>
