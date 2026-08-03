<script lang="ts" setup>
import { useI18n } from "vue-i18n";
import CardContainer from "@/lion/components/CardContainer/index.vue";

const props = defineProps<{
  keyboard?: string;
  opened: boolean;
}>();

const emit = defineEmits(["update:keyboard", "update:opened"]);

const { t } = useI18n();

const generalOptions = [
  { label: "German (Qwertz)", value: "de-de-qwertz" },
  { label: "US English (Qwerty)", value: "en-us-qwerty" },
  { label: "Spanish (Qwerty)", value: "es-es-qwerty" },
  { label: "French (Azerty)", value: "fr-fr-azerty" },
  { label: "Italian (Qwerty)", value: "it-it-qwerty" },
  { label: "Dutch (QWERTY)", value: "nl-nl-qwerty" },
  { label: "Russian (QWERTY)", value: "ru-ru-qwerty" }
];
</script>

<template>
  <CardContainer :title="t('VirtualKeyboard')">
    <div class="grid grid-cols-1 gap-4 md:grid-cols-4">
      <div class="flex items-center justify-between gap-3">
        <span class="text-sm">{{ t("Enable") }}</span>
        <USwitch :model-value="props.opened" @update:model-value="emit('update:opened', $event)" />
      </div>
      <div class="md:col-span-3">
        <label class="mb-2 block text-sm">{{ t("KeyboardLayout") }}</label>
        <USelect
          :model-value="props.keyboard"
          :items="generalOptions"
          class="w-full"
          @update:model-value="emit('update:keyboard', $event)"
        />
      </div>
    </div>
  </CardContainer>
</template>
