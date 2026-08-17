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

const { t } = useI18n();
const { isMacOS } = usePlatform();
const showWindowControls = computed(() => isTauriRuntime() && !isMacOS.value);

const windowControlButtons = computed(() => [
  {
    key: "minimize",
    icon: "i-lucide-minus",
    label: t("ToolTips.Minimize"),
    action: async () => {
      await useTauriCoreInvoke("minimize_window");
    }
  },
  {
    key: "maximize",
    icon: "i-lucide-square",
    label: t("ToolTips.Maximize"),
    action: async () => {
      await useTauriCoreInvoke("toggle_maximize_window");
    }
  },
  {
    key: "close",
    icon: "i-lucide-x",
    label: t("ToolTips.Close"),
    action: async () => {
      await useTauriCoreInvoke("close_window");
    }
  }
]);
</script>

<template>
  <div class="relative h-screen min-h-0 overflow-hidden bg-[var(--app-main-bg)]">
    <div v-if="isTauriRuntime()" data-tauri-drag-region class="absolute inset-x-0 top-0 z-10 h-9" />

    <div
      v-if="showWindowControls"
      data-tauri-drag-region="false"
      class="absolute right-0 top-0 z-20 flex h-9 items-stretch"
    >
      <UButton
        v-for="button in windowControlButtons"
        :key="button.key"
        :icon="button.icon"
        :aria-label="button.label"
        :title="button.label"
        color="neutral"
        variant="ghost"
        class="w-12 justify-center rounded-none"
        :class="button.key === 'close' ? 'hover:bg-red-500 hover:text-white' : ''"
        @click="button.action"
      />
    </div>

    <SettingsPanel :mode="mode" :active-section="activeSection" class="h-full min-h-0">
      <slot />
    </SettingsPanel>
  </div>
</template>
