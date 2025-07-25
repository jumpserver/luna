<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import mittBus from '@renderer/eventBus';
import { onBeforeUnmount, onMounted } from 'vue';
import { useAssetList } from '@renderer/hooks/useAssetList';

import { getColumns } from './config';
import { getDynamicHeight } from './helper';

const props = withDefaults(
  defineProps<{
    type: string;
  }>(),
  {
    type: 'linux',
  },
);

const columns = getColumns();
const dynamicHeight = getDynamicHeight();

const { t } = useI18n();
const { listData, getAssetsFromServer, handleScroll } = useAssetList(props.type);

const handleTableScroll = (e: Event) => {
  const scrollWrapper = e.target as HTMLElement;

  if (!scrollWrapper)
    return;

  const { scrollTop, scrollHeight, clientHeight } = scrollWrapper;

  if (scrollHeight - scrollTop - clientHeight < 20)
    handleScroll();
};

onMounted(async () => {
  try {
    getAssetsFromServer();
    mittBus.on('search', getAssetsFromServer);
  }
  catch (error) {
    console.error(error);
  }
});

onBeforeUnmount(() => {
  mittBus.off('search', getAssetsFromServer);
  window.removeEventListener('resize', () => {});
});
</script>

<template>
  <n-flex vertical class="dynamic-target h-full w-full !gap-0">
    <n-text depth="1" strong class="my-4 mx-4">
      {{ t('Common.AssetsList') }}
    </n-text>

    <n-data-table
      :data="listData"
      :columns="columns"
      :bordered="false"
      :style="{ height: `${dynamicHeight}px` }"
      flex-height
      size="large"
      class="w-full h-full px-4"
      @scroll="handleTableScroll"
    />
  </n-flex>
</template>

<style scoped lang="scss">
.n-spin-container .n-spin-body {
  top: 45% !important;
}
</style>
