<script setup lang="ts">
import type { AppConfigType, ConfigItem } from "~/types";

const props = defineProps<{
  category: keyof AppConfigType
  protocol: string
}>();

const { t } = useI18n();
const { appConfig } = useSettingManager();
const { selectClient } = useApplicationConfig();

const builtInTerminalItem = computed<ConfigItem>(() => ({
  name: "builtin_client",
  display_name: t("Setting.BuiltInTerminal"),
  protocol: ["ssh"],
  comment: {
    zh: "使用客户端内置的终端连接 SSH 资产，默认启用且不可禁用。",
    en: "Use the built-in terminal to connect to SSH assets. It is always enabled."
  },
  download_url: "",
  type: "terminal",
  path: t("Setting.AlwaysEnabled"),
  arg_format: "",
  match_first: ["ssh"],
  is_internal: true,
  is_default: true,
  is_set: true,
  executable_type: "builtin",
  path_exists: true
}));

const items = computed<ConfigItem[]>(() => {
  const list = appConfig.value?.[props.category] ?? [];
  const filtered = list.filter((i) => i.protocol?.includes(props.protocol));

  if (props.category === "terminal" && props.protocol === "ssh") {
    return [builtInTerminalItem.value, ...filtered.filter((item) => item.name !== "builtin_client")];
  }

  return filtered;
});

const isBuiltInTerminal = (item: ConfigItem) => item.name === "builtin_client";
const isSelected = (item: ConfigItem) => isBuiltInTerminal(item) || item.match_first?.includes(props.protocol);
const handleToggle = async (item: ConfigItem) => {
  if (isBuiltInTerminal(item)) return;

  await selectClient(props.category, props.protocol, item.name);
};
</script>

<template>
  <div class="flex flex-col gap-2">
    <template v-if="items.length">
      <SettingItems
        v-for="item in items"
        :key="item.name"
        :item="item"
        :protocol="props.protocol"
        :selected="isSelected(item)"
        @toggle="() => handleToggle(item)"
      />
    </template>

    <div v-else class="text-center text-sm text-gray-500 py-10">
      {{ t("Common.NoData") }}
    </div>
  </div>
</template>
