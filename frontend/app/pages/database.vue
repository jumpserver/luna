<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui';
import type { AssetItem } from '~/types/index';

const { t } = useI18n();
const assetManager = useAssetFetcher('database');
const { assetsData, fetchNextPage } = assetManager;

const tabItems = computed<TabsItem[]>(() => {
  if (!assetsData.value || assetsData.value.length === 0) {
    return [
      {
        label: t('Common.All'),
        value: 'all',
      },
    ];
  }

  const uniquePlatforms = new Set<string>();

  assetsData.value.forEach((item: AssetItem) => {
    const platformName = item.platform;

    if (platformName) uniquePlatforms.add(platformName);
  });

  const tabs: TabsItem[] = [{ label: t('Common.All'), value: 'all' }];

  Array.from(uniquePlatforms).forEach((platformName) => {
    tabs.push({ label: platformName, value: platformName });
  });
  return tabs;
});

const currentTab = ref('all');

onMounted(() => {
  fetchNextPage();
});
</script>

<template>
  <div class="relative h-full flex min-h-0">
    <UTabs
      v-model="currentTab"
      orientation="vertical"
      variant="link"
      :items="tabItems"
      class="w-full h-full items-start"
    >
      <template #content>
        <BasePage
          type="database"
          icon-name="lets-icons:database-fill"
          :platform="currentTab"
        />
      </template>
    </UTabs>
  </div>
</template>
