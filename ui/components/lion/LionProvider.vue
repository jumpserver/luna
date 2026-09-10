<script setup lang="ts">
import { message as lionMessages } from "@/lion/locales";

import "@/lion/styles/base.css";

const { mergeLocaleMessage } = useI18n();

for (const [code, value] of Object.entries(lionMessages)) {
  mergeLocaleMessage(code, value);
}
</script>

<template>
  <div class="lion-surface h-full w-full overflow-hidden">
    <slot />
  </div>
</template>
