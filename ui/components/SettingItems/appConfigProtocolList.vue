<script setup lang="ts">
import type { AppConfigType, ConfigItem } from "~/types";

const props = defineProps<{
  category: keyof AppConfigType;
  protocol: string;
  mode?: "all" | "hosts" | "clients";
}>();

const { t } = useI18n();
const { appConfig } = useSettingManager();
const { selectClient } = useApplicationConfig();

const items = computed<ConfigItem[]>(() => {
  const list = appConfig.value?.[props.category] ?? [];
  return list.filter((item) => item.name !== "builtin_client" && item.protocol?.includes(props.protocol));
});

const useTerminalHostGrouping = computed(
  () => props.category === "terminal" && ["ssh", "telnet"].includes(props.protocol)
);

const viewMode = computed(() => props.mode || "all");

const terminalHostItems = computed(() =>
  useTerminalHostGrouping.value ? items.value.filter((item) => item.use_ssh_helper) : []
);

const terminalClientItems = computed(() =>
  useTerminalHostGrouping.value ? items.value.filter((item) => !item.use_ssh_helper) : items.value
);

const currentTerminalHost = computed(
  () =>
    appConfig.value?.terminal?.find(
      (item) => item.use_ssh_helper && (item.enabled_protocols || item.match_first)?.includes("ssh")
    ) ||
    appConfig.value?.terminal?.find((item) => item.use_ssh_helper) ||
    null
);

const selectedTerminalHost = computed(
  () =>
    terminalHostItems.value.find((item) => (item.enabled_protocols || item.match_first)?.includes(props.protocol)) ||
    terminalHostItems.value[0] ||
    null
);

const terminalProxyItem = computed<ConfigItem | null>(() => {
  if (!useTerminalHostGrouping.value || viewMode.value === "hosts" || !selectedTerminalHost.value) {
    return null;
  }

  const selectedHost = selectedTerminalHost.value;
  return {
    ...selectedHost,
    name: "terminal_host",
    display_name: t("Setting.TerminalOption"),
    path_display: selectedHost.display_name,
    path_copyable: false,
    path_selectable: false,
    comment: {
      zh: `${t("Setting.TerminalCurrentPrefix")}${selectedHost.display_name}`,
      en: `${t("Setting.TerminalCurrentPrefix")}${selectedHost.display_name}`
    }
  };
});

const databaseDisplayItems = computed<ConfigItem[]>(() => {
  if (props.category !== "databases") {
    return [];
  }

  return items.value.map((item) => {
    if (item.name !== "terminal") {
      return item;
    }

    const terminalHost = currentTerminalHost.value;
    if (!terminalHost) {
      return item;
    }

    return {
      ...item,
      path_display: terminalHost.display_name,
      path_copyable: false,
      path_selectable: false,
      comment: {
        zh: `${t("Setting.TerminalCurrentPrefix")}${terminalHost.display_name}`,
        en: `${t("Setting.TerminalCurrentPrefix")}${terminalHost.display_name}`
      }
    };
  });
});

const displayItems = computed<ConfigItem[]>(() => {
  if (props.category === "databases") {
    return databaseDisplayItems.value;
  }

  if (!useTerminalHostGrouping.value) {
    return terminalClientItems.value;
  }

  if (viewMode.value === "hosts") {
    return terminalHostItems.value;
  }

  return [...(terminalProxyItem.value ? [terminalProxyItem.value] : []), ...terminalClientItems.value];
});

const isSelected = (item: ConfigItem) => (item.enabled_protocols || item.match_first)?.includes(props.protocol);
const handleToggle = async (item: ConfigItem, enabled: boolean) => {
  await selectClient(props.category, props.protocol, item.name, enabled, item.plugin_id);
};
</script>

<template>
  <div class="flex flex-col gap-2">
    <template v-if="displayItems.length">
      <SettingItems
        v-for="item in displayItems"
        :key="item.plugin_id || item.name"
        :item="item"
        :protocol="props.protocol"
        :selected="isSelected(item)"
        @toggle="(enabled) => handleToggle(item, enabled)"
      />
    </template>

    <div v-else class="text-center text-sm text-gray-500 py-10">
      {{ t("Common.NoData") }}
    </div>
  </div>
</template>
