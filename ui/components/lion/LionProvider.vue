<script setup lang="ts">
import { message as lionMessages } from "@/lion/locales/modules";
import { withBasePath } from "@/lion/utils/base";
import { LanguageCode } from "@/lion/utils/config";

import "@/lion/styles/base.css";

const { mergeLocaleMessage } = useI18n();

const loaded = ref(false);
const normalizedLangCode = LanguageCode.toLowerCase();

onMounted(async () => {
  for (const [code, value] of Object.entries(lionMessages)) {
    mergeLocaleMessage(code, value);
  }

  try {
    const response = await fetch(
      `${withBasePath("/api/v1/settings/i18n/lion/")}?lang=${encodeURIComponent(normalizedLangCode)}&flat=0`,
      {
        credentials: "include"
      }
    );

    if (response.ok) {
      const translations = await response.json();
      for (const [key, value] of Object.entries(translations)) {
        mergeLocaleMessage(key, value as Record<string, any>);
      }
    }
  } catch (error) {
    console.error("load lion i18n failed", error);
  } finally {
    loaded.value = true;
  }
});
</script>

<template>
  <div v-if="loaded" class="h-full w-full overflow-hidden">
    <slot />
  </div>
</template>
