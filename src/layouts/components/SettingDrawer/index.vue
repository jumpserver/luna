<template>
  <n-drawer
    v-model:show="showSettingDrawer"
    :default-width="290"
    placement="right"
    resizable
    closable
  >
    <n-drawer-content :title="t('Custom Setting')">
      <n-divider> 主题设置 </n-divider>
      <n-flex justify="space-around" align="center">
        {{ t('Dark Mode') }}
        <n-switch v-model:value="active" @update:value="handleChange">
          <template #checked-icon>
            <n-icon :component="MoonOutline" />
          </template>
          <template #unchecked-icon>
            <n-icon :component="SunnyOutline" />
          </template>
        </n-switch>
      </n-flex>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { useTheme } from '@/hooks/useTheme.ts';
import { onBeforeUnmount, ref } from 'vue';
import { useGlobalStore } from '@/stores/modules/global.ts';

import mittBus from '@/utils/mittBus.ts';
import { MoonOutline, SunnyOutline } from '@vicons/ionicons5';

const globalStore = useGlobalStore();

const { t } = useI18n();
const { switchDark } = useTheme();
const { isDark } = storeToRefs(globalStore);

const active = isDark;
const showSettingDrawer = ref<Boolean>(false);

const handleChange = (value: Boolean) => {
  globalStore.setGlobalState('isDark', value);
  switchDark();
};

mittBus.on('openSettingDrawer', () => {
  showSettingDrawer.value = true;
});

onBeforeUnmount(() => {
  mittBus.off('openSettingDrawer');
});
</script>

<style scoped lang="scss"></style>
