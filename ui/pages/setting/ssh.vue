<script setup lang="ts">
import type { ConfigItem } from "~/types/index";

definePageMeta({
  layout: "setting"
});

const { t } = useI18n();
const { appConfig } = useSettingManager();
const { selectClient } = useApplicationConfig();

const protocol = "ssh";
const category = "terminal" as const;

const sshItems = computed<ConfigItem[]>(() => {
  const list = appConfig.value?.terminal ?? [];
  return list.filter((i) => i.protocol?.includes(protocol));
});

const isSelected = (item: ConfigItem) => item.match_first?.includes(protocol);
const handleToggle = async (item: ConfigItem) => {
  await selectClient(category, protocol, item.name);
};
</script>

<template>
  <div class="flex flex-col gap-2">
    <template v-if="sshItems.length">
      <SettingItems
        v-for="item in sshItems"
        :key="item.name"
        :item="item"
        :protocol="protocol"
        :selected="isSelected(item)"
        @toggle="() => handleToggle(item)"
      />
    </template>

    <div v-else class="text-center text-sm text-gray-500 py-10">
      {{ t("Common.NoData") }}
    </div>
  </div>
</template>
