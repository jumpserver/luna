<script setup lang="ts">
import type { SettingsSection } from "~/components/Settings/settingsPanel.vue";

import SettingsAbout from "~/pages/setting/about.vue";
import SettingsAppearance from "~/pages/setting/appearance.vue";
import SettingsGeneral from "~/pages/setting/general.vue";

const { open, activeSection } = useSettingsWindow();
const { t } = useI18n();
const panelBackground = "var(--app-sidebar-bg)";
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('Common.ConnectionSettings')"
    :ui="{
      content: 'max-w-[960px] w-[calc(100vw-3rem)]',
      body: 'p-0 sm:p-0',
      footer: 'hidden'
    }"
  >
    <template #body>
      <div :style="{ backgroundColor: panelBackground }">
        <SettingsPanel
          mode="inline"
          embedded
          :active-section="activeSection"
          @update:active-section="activeSection = $event as SettingsSection"
        >
          <KeepAlive>
            <SettingsGeneral v-if="activeSection === 'general'" />
            <SettingsAppearance v-else-if="activeSection === 'appearance'" />
            <SettingsAbout v-else />
          </KeepAlive>
        </SettingsPanel>
      </div>
    </template>
  </UModal>
</template>
