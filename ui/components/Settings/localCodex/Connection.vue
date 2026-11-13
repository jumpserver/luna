<script setup lang="ts">
import type { LocalCodexModel, LocalCodexSettings } from "~/shared/codex/types";

const props = defineProps<{
  busy: boolean;
  hasApiKey: boolean;
  models: LocalCodexModel[];
  modelsLoading: boolean;
  modelsError: string;
  modelsReady: boolean;
}>();
defineEmits<{ refreshModels: [] }>();
const connection = defineModel<LocalCodexSettings["connection"]>("connection", { required: true });
const baseUrl = defineModel<string>("baseUrl", { required: true });
const model = defineModel<string>("model", { required: true });
const reasoningEffort = defineModel<string>("reasoningEffort", { required: true });
const apiKey = defineModel<string>("apiKey", { required: true });
const clearApiKey = defineModel<boolean>("clearApiKey", { required: true });
const selectedConnection = computed({
  get: () => connection.value,
  set: (value: LocalCodexSettings["connection"]) => {
    if (value === connection.value) return;
    connection.value = value;
    reasoningEffort.value = value === "api" ? "medium" : "";
  }
});
const modelOpen = shallowRef(false);
const selectedModel = computed({
  get: () => model.value || null,
  set: (value: string | null) => {
    model.value = value || "";
  }
});
const { t } = useLocalAiMessages();
const connections = computed(() => [
  { label: t("api"), value: "api" },
  { label: t("existing"), value: "existing" }
]);
const modelItems = computed(() => [
  ...props.models.map((item) => ({
    label: item.name === item.id ? item.id : `${item.name} (${item.id})`,
    value: item.id
  })),
  ...(model.value && !props.models.some((item) => item.id === model.value)
    ? [{ label: model.value, value: model.value }]
    : [])
]);
const modelReasoningEfforts = computed(
  () => props.models.find((item) => (model.value ? item.id === model.value : item.isDefault))?.supportedReasoningEfforts
);
const selectedReasoningEffort = computed({
  get: () => reasoningEffort.value || "default",
  set: (value: string) => {
    reasoningEffort.value = value === "default" ? "" : value;
  }
});
const reasoningItems = computed(() => {
  const levels = modelReasoningEfforts.value ?? ["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"];
  const labels: Record<string, string> = {
    none: t("reasoningNone"),
    minimal: t("reasoningMinimal"),
    low: t("reasoningLow"),
    medium: t("reasoningMedium"),
    high: t("reasoningHigh"),
    xhigh: t("reasoningXhigh"),
    max: t("reasoningMax"),
    ultra: t("reasoningUltra")
  };
  return [
    { label: connection.value === "api" ? t("reasoningModelDefault") : t("reasoningDefault"), value: "default" },
    ...[...new Set([...levels, ...(reasoningEffort.value ? [reasoningEffort.value] : [])])].map((value) => ({
      label: labels[value] ? `${labels[value]} (${value})` : value,
      value
    }))
  ];
});
watch(
  modelReasoningEfforts,
  (levels) => {
    if (levels && reasoningEffort.value && !levels.includes(reasoningEffort.value)) reasoningEffort.value = "";
  },
  { immediate: true }
);
function selectCustomModel(value: string) {
  model.value = value;
  modelOpen.value = false;
}
</script>

<template>
  <SettingsGroup :title="t('connection')" icon="i-lucide-plug">
    <SettingsRow :title="t('connection')" :description="connection === 'api' ? t('apiHint') : t('existingHint')">
      <USelect
        v-model="selectedConnection"
        :items="connections"
        :disabled="busy"
        :aria-label="t('connection')"
        class="w-72"
      />
    </SettingsRow>
    <template v-if="connection === 'api'">
      <SettingsRow :title="t('baseUrl')">
        <UInput v-model="baseUrl" type="url" :disabled="busy" :aria-label="t('baseUrl')" class="w-80 max-w-full" />
      </SettingsRow>
      <SettingsRow :title="t('apiKey')" :description="clearApiKey ? t('keyRemoved') : t('keyHint')">
        <div class="flex flex-wrap items-center gap-2">
          <UInput
            v-model="apiKey"
            type="password"
            autocomplete="off"
            :disabled="busy"
            :aria-label="t('apiKey')"
            :placeholder="hasApiKey && !clearApiKey ? t('keyStored') : ''"
            class="w-72"
          />
          <UButton
            v-if="hasApiKey && !clearApiKey"
            :label="t('clearKey')"
            color="neutral"
            variant="ghost"
            :disabled="busy"
            @click="clearApiKey = true"
          />
        </div>
      </SettingsRow>
    </template>
    <SettingsRow :title="t('model')" :description="connection === 'api' ? t('modelHint') : t('modelExistingHint')">
      <div class="space-y-2">
        <div class="flex flex-wrap items-center gap-2">
          <UInputMenu
            v-model="selectedModel"
            v-model:open="modelOpen"
            :items="modelItems"
            value-key="value"
            :clear="connection === 'existing'"
            :disabled="busy"
            :loading="modelsLoading"
            :aria-label="t('model')"
            :placeholder="connection === 'existing' ? t('modelDefault') : t('modelPlaceholder')"
            create-item="always"
            open-on-focus
            class="w-72"
            @create="selectCustomModel"
          >
            <template #create-item-label="{ item }">{{ t("useModel", { model: item }) }}</template>
          </UInputMenu>
          <UButton
            icon="i-lucide-refresh-cw"
            :label="t('refreshModels')"
            color="neutral"
            variant="outline"
            :disabled="busy || modelsLoading || !modelsReady"
            @click="$emit('refreshModels')"
          />
        </div>
        <p v-if="modelsError" role="alert" class="max-w-md text-xs text-error">
          {{ t("modelsFailed") }} {{ modelsError }}
        </p>
        <p v-else-if="connection === 'api' && !modelsReady" class="text-xs text-muted">{{ t("modelsNeedKey") }}</p>
        <p v-else-if="models.length" role="status" class="text-xs text-muted">
          {{ t("modelsLoaded", { count: models.length }) }}
        </p>
      </div>
    </SettingsRow>
    <SettingsRow
      :title="t('reasoningEffort')"
      :description="connection === 'api' ? t('reasoningApiHint') : t('reasoningHint')"
    >
      <USelect
        v-model="selectedReasoningEffort"
        :items="reasoningItems"
        :disabled="busy"
        :aria-label="t('reasoningEffort')"
        class="w-72"
      />
    </SettingsRow>
  </SettingsGroup>
</template>
