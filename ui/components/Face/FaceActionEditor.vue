<script setup lang="ts">
import type { FaceFlowAction } from "~/types/face";

const props = defineProps<{
  modelValue: FaceFlowAction;
  label: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: FaceFlowAction];
}>();

const { t } = useI18n();
const actionTypes = computed(() => [
  { label: t("Face.ActionNone"), value: "none" },
  { label: t("Face.ActionRedirect"), value: "redirect" },
  { label: t("Face.ActionApi"), value: "api" },
  { label: t("Face.ActionMethod"), value: "method" }
]);

const action = computed<FaceFlowAction>({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value)
});

const updateType = (type: string) => {
  action.value = { type: type as FaceFlowAction["type"], url: "", method: "" };
};

const updateUrl = (url: string) => {
  action.value = { ...action.value, url };
};

const updateMethod = (method: string) => {
  action.value = { ...action.value, method };
};
</script>

<template>
  <div class="grid gap-2 sm:grid-cols-[150px_minmax(0,1fr)]">
    <UFormField :label="label">
      <USelect
        :model-value="action.type"
        :items="actionTypes"
        value-key="value"
        label-key="label"
        class="w-full"
        @update:model-value="updateType"
      />
    </UFormField>
    <UFormField v-if="action.type === 'redirect' || action.type === 'api'" :label="t('Face.ActionUrl')">
      <UInput
        :model-value="action.url"
        :placeholder="action.type === 'redirect' ? '/session' : 'https://example.com/callback'"
        class="w-full"
        @update:model-value="updateUrl"
      />
    </UFormField>
    <UFormField v-else-if="action.type === 'method'" :label="t('Face.ActionMethodName')">
      <UInput
        :model-value="action.method"
        placeholder="security.faceVerified"
        class="w-full"
        @update:model-value="updateMethod"
      />
    </UFormField>
  </div>
</template>
