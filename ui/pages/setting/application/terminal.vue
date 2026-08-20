<script setup lang="ts">
import type { ConfigItem } from "~/types";

definePageMeta({
  layout: "setting"
});

const { t } = useI18n();
const { appConfig } = useSettingManager();
const { selectClient } = useApplicationConfig();

const terminalItems = computed<ConfigItem[]>(() => {
  const list = appConfig.value?.terminal ?? [];
  const seen = new Set<string>();

  return list.filter((item) => {
    if (!item.use_ssh_helper) return false;
    const key = item.plugin_id || item.name;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
});

const selectedPluginId = computed(() => {
  const sshSelected = terminalItems.value.find((item) => (item.enabled_protocols || item.match_first)?.includes("ssh"));
  return sshSelected?.plugin_id || sshSelected?.name || "";
});

const isSelected = (item: ConfigItem) => {
  const key = item.plugin_id || item.name;
  return key === selectedPluginId.value;
};

const handleToggle = async (item: ConfigItem, enabled: boolean) => {
  if (!enabled) {
    return;
  }

  await selectClient("terminal", "ssh", item.name, true, item.plugin_id);
  await selectClient("terminal", "telnet", item.name, true, item.plugin_id);
};
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="px-1">
      <p class="text-sm font-medium">{{ t("Setting.TerminalSettings") }}</p>
      <p class="mt-1 text-xs text-gray-500">{{ t("Setting.TerminalProgramDescription") }}</p>
    </div>

    <template v-if="terminalItems.length">
      <SettingItems
        v-for="item in terminalItems"
        :key="item.plugin_id || item.name"
        :item="item"
        protocol="ssh"
        :selected="isSelected(item)"
        @toggle="(enabled) => handleToggle(item, enabled)"
      />
    </template>

    <div v-else class="rounded-lg border border-dashed border-[var(--app-border)] px-4 py-8 text-center text-sm text-gray-500">
      {{ t("Common.NoData") }}
    </div>
  </div>
</template>
