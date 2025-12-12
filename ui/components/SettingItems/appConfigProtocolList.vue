<script setup lang="ts">
import type { AppConfigType, ConfigItem } from "~/types";

const props = defineProps<{
  category: keyof AppConfigType
  protocol: string
}>();

const { t } = useI18n();
const { appConfig } = useSettingManager();
const { selectClient } = useApplicationConfig();

const items = computed<ConfigItem[]>(() => {
  const list = appConfig.value?.[props.category] ?? [];
  return list.filter((i) => i.protocol?.includes(props.protocol));
});

const isSelected = (item: ConfigItem) => item.match_first?.includes(props.protocol);
const handleToggle = async (item: ConfigItem) => {
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
