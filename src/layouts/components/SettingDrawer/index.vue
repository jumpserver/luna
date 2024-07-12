<template>
  <n-drawer
    v-model:show="showSettingDrawer"
    :default-width="290"
    placement="right"
    resizable
    closable
  >
    <n-drawer-content :title="t('Custom Setting')" class="drawer-content">
      <n-divider> {{ t('Theme Settings') }} </n-divider>
      <n-flex>
        <n-flex class="dark-setting" justify="space-between" align="center">
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
        <n-flex class="page-setting" justify="space-between" align="center">
          {{ t('Page configuration') }}
          <n-select
            v-model:value="pageOptionValue"
            :options="pageOptions"
            clearable
            size="small"
            @update-value="handlePageConfigurationChange"
            :placeholder="t('Please select')"
          />
        </n-flex>
      </n-flex>

      <n-divider> {{ t('Language Settings') }} </n-divider>
      <n-flex class="language-setting" justify="space-between" align="center">
        {{ t('Language Selection') }}
        <n-select
          v-model:value="languageOptionValue"
          :options="languageOptions"
          clearable
          size="small"
          @update-value="handlePageConfigurationChange"
          :placeholder="t('Please select')"
        />
      </n-flex>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { SelectOption } from 'naive-ui';
import { useTheme } from '@/hooks/useTheme.ts';
import { onBeforeUnmount, reactive, ref } from 'vue';
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

const handlePageConfigurationChange = (value: string, option: SelectOption) => {
  console.log(value);
  console.log(option);
};

const pageOptionValue = ref('');
const languageOptionValue = ref('');
const pageOptions = reactive([
  {
    label: t('General'),
    value: 'General'
  },
  {
    label: t('GUI'),
    value: 'GUI'
  },
  {
    label: t('CLI'),
    value: 'CLI'
  }
]);
const languageOptions = reactive([
  {
    label: 'English',
    value: 'General'
  },
  {
    label: '中文',
    value: 'Chinese'
  },
  {
    label: '中文(繁體)',
    value: 'Chinese-hant'
  },
  {
    label: '日本語',
    value: 'Japanese'
  }
]);

mittBus.on('open-setting-drawer', () => {
  showSettingDrawer.value = true;
});

onBeforeUnmount(() => {
  mittBus.off('open-setting-drawer');
});
</script>

<style scoped lang="scss">
.drawer-content {
  :deep(.n-drawer-body-content-wrapper) {
    .dark-setting {
      width: 100%;
    }
    .page-setting {
      width: 100%;
      margin-top: 15px;
      .n-select {
        width: 150px;
      }
    }
    .language-setting {
      width: 100%;
      .n-select {
        width: 150px;
      }
    }
  }
}
</style>
