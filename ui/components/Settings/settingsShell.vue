<script setup lang="ts">
import type { SettingsSection } from "~/composables/useSettingsWindow";

withDefaults(
  defineProps<{
    mode?: "route" | "inline";
    activeSection?: SettingsSection;
  }>(),
  {
    mode: "route",
    activeSection: "general"
  }
);

const { isMacOS } = usePlatform();
</script>

<template>
  <div class="settings-shell relative flex h-screen min-h-0 flex-col overflow-hidden bg-[var(--app-main-bg)]">
    <HeaderDesktopTitleBar :show-menus="false" />
    <div v-if="isDesktopRuntime() && isMacOS" data-tauri-drag-region class="absolute inset-x-0 top-0 z-10 h-9" />

    <SettingsPanel :mode="mode" :active-section="activeSection" class="min-h-0 flex-1">
      <slot />
    </SettingsPanel>
  </div>
</template>
