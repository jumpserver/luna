<script lang="ts" setup>
import { useI18n } from "vue-i18n";
import CardContainer from "@/lion/components/CardContainer/index.vue";

const props = defineProps<{
  keyboard?: string;
  opened: boolean;
}>();

const emit = defineEmits(["update:keyboard", "update:opened"]);

const { t } = useI18n();

const generalOptions = computed(() => [
  { label: t("KeyboardGermanQwertz"), value: "de-de-qwertz" },
  { label: t("KeyboardUsEnglishQwerty"), value: "en-us-qwerty" },
  { label: t("KeyboardSpanishQwerty"), value: "es-es-qwerty" },
  { label: t("KeyboardFrenchAzerty"), value: "fr-fr-azerty" },
  { label: t("KeyboardItalianQwerty"), value: "it-it-qwerty" },
  { label: t("KeyboardDutchQwerty"), value: "nl-nl-qwerty" },
  { label: t("KeyboardRussianQwerty"), value: "ru-ru-qwerty" }
]);
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
