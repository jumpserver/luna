<template>
  <n-drawer
    v-model:show="showSettingDrawer"
    :default-width="502"
    placement="right"
    resizable
    closable
  >
    <n-drawer-content :title="t('Custom Setting')">
      <n-flex justify="space-around" align="center">
        主题切换：
        <n-switch />
      </n-flex>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import mittBus from '@/utils/mittBus.ts';

const { t } = useI18n();

const showSettingDrawer = ref<Boolean>(false);

mittBus.on('openSettingDrawer', () => {
  showSettingDrawer.value = true;
});

onBeforeUnmount(() => {
  mittBus.off('openSettingDrawer');
});
</script>

<style scoped lang="scss"></style>
