<script setup lang="ts">
import { message as lionMessages, loadRemoteTranslations } from "@/lion/locales";

import "@/lion/styles/base.css";

const { mergeLocaleMessage } = useI18n();

for (const [code, value] of Object.entries(lionMessages)) {
  mergeLocaleMessage(code, value);
}

onMounted(async () => {
  try {
    const translations = await loadRemoteTranslations();
    for (const [key, value] of Object.entries(translations)) {
      mergeLocaleMessage(key, value);
    }
  } catch (error) {
    console.error("load lion i18n failed", error);
  }
});
</script>

<template>
  <div class="lion-surface h-full w-full overflow-hidden">
    <slot />
  </div>
</template>
