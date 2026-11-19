<script setup lang="ts">
import type { LangType } from "~/types";

import { useSettingManager } from "~/composables/useSettingManager";

defineProps<{ compact?: boolean }>();

const { t, locales, locale } = useI18n();
const { setLang } = useSettingManager();
let pointerSelection = false;
const languageItems = computed(() =>
  locales.value.map((language) => ({
    id: language.code as LangType,
    label: language.name || language.code,
    onSelect: (event: Event) => {
      pointerSelection = !(
        (event as CustomEvent<{ originalEvent: Event }>).detail.originalEvent instanceof KeyboardEvent
      );
    }
  }))
);
const closeAfterPointer = (event: Event) => {
  // Reka restores focus after closing; pointer selections should not leave a keyboard focus ring.
  if (pointerSelection) event.preventDefault();
  pointerSelection = false;
};
const handlePointerDownOutside = () => {
  pointerSelection = true;
};
const handleEscapeKeyDown = () => {
  pointerSelection = false;
};
const selectedLanguage = computed<LangType>({
  get: () => (locale.value as LangType) || "zh",
  set: (code) => {
    if (code) setLang(code);
  }
});
</script>

<template>
  <USelect
    v-model="selectedLanguage"
    :items="languageItems"
    value-key="id"
    :aria-label="t('Common.Language')"
    :variant="compact ? 'ghost' : 'outline'"
    size="sm"
    :class="compact ? 'w-auto shrink-0' : 'w-48'"
    :content="
      compact
        ? {
            align: 'end',
            onCloseAutoFocus: closeAfterPointer,
            onPointerDownOutside: handlePointerDownOutside,
            onEscapeKeyDown: handleEscapeKeyDown
          }
        : undefined
    "
    :ui="{ base: 'cursor-pointer', item: 'cursor-pointer', ...(compact ? { content: 'min-w-40' } : {}) }"
  />
</template>
