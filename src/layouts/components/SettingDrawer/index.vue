<template>
  <n-drawer
    resizable
    placement="right"
    :width="defaultWidth"
    v-model:show="showSettingDrawer"
    :default-width="defaultWidth"
    class="transition-drawer"
  >
    <n-drawer-content :title="t('Custom Setting')" class="drawer-content" closable>
      <n-divider> {{ t('Theme Settings') }} </n-divider>
      <n-flex>
        <n-flex class="dark-setting" justify="space-between" align="center">
          {{ t('Dark Mode') }}
          <n-switch v-model:value="darkModeActive" @update:value="handleDarkModeChange">
            <template #checked-icon>
              <n-icon :component="MoonOutline" />
            </template>
            <template #unchecked-icon>
              <n-icon :component="SunnyOutline" />
            </template>
          </n-switch>
        </n-flex>
        <n-flex class="asset-async" justify="space-between" align="center">
          <n-popover placement="bottom" trigger="hover">
            <template #trigger>
              {{ t('Asset Async') }}
            </template>
            {{ t('Asset Async Explain') }}
          </n-popover>
          <n-switch v-model:value="assetAsyncActive" @update:value="handleAssetAsyncChange">
            <template #checked-icon>
              <n-icon :component="ArrowBackCircleOutline" />
            </template>
            <template #unchecked-icon>
              <n-icon :component="ArrowForwardCircleOutline" />
            </template>
          </n-switch>
        </n-flex>
        <n-flex class="page-setting" justify="space-between" align="center">
          {{ t('Page Configuration') }}
          <n-select
            clearable
            size="small"
            v-model:value="pageOptionValue"
            :options="pageOptions"
            :placeholder="t('Please Select')"
          />
        </n-flex>
      </n-flex>

      <n-divider> {{ t('Language Settings') }} </n-divider>
      <n-flex class="language-setting" justify="space-between" align="center">
        {{ t('Language Selection') }}
        <n-select
          clearable
          size="small"
          v-model:value="languageOptionValue"
          :options="languageOptions"
          :placeholder="t('Please Select')"
          @update-value="handlePageConfigurationChange"
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
import { useTranslations } from '@/hooks/useTranslate';
import { useTreeStore } from '@/stores/modules/tree.ts';
import { useGlobalStore } from '@/stores/modules/global.ts';
import { watch, onBeforeUnmount, reactive, ref } from 'vue';

import mittBus from '@/utils/mittBus.ts';
import {
  MoonOutline,
  SunnyOutline,
  ArrowBackCircleOutline,
  ArrowForwardCircleOutline
} from '@vicons/ionicons5';

interface CustomSelectOption extends SelectOption {
  onClick?: () => void;
}

const treeStore = useTreeStore();
const globalStore = useGlobalStore();
const { updateTranslations } = useTranslations();

const { t } = useI18n();
const { switchDark } = useTheme();
const { isDark } = storeToRefs(globalStore);
const { isAsync } = storeToRefs(treeStore);

const darkModeActive = isDark;
const assetAsyncActive = isAsync;

const showSettingDrawer = ref<Boolean>(false);
const defaultWidth = ref(globalStore.language === 'en' ? 390 : 300);

const pageOptionValue = ref();
const languageOptionValue = ref(globalStore.language);
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
    value: 'en',
    onClick: () => {
      globalStore.setGlobalState('language', 'en');
      updateTranslations('en');
    }
  },
  {
    label: '中文',
    value: 'zh',
    onClick: () => {
      globalStore.setGlobalState('language', 'zh');
      updateTranslations('zh');
    }
  },
  {
    label: '中文(繁體)',
    value: 'zh-hant',
    onClick: () => {
      globalStore.setGlobalState('language', 'zh-hant');
      updateTranslations('zh-hant');
    }
  },
  {
    label: '日本語',
    value: 'ja',
    onClick: () => {
      globalStore.setGlobalState('language', 'ja');
      updateTranslations('ja');
    }
  }
]);

const handleDarkModeChange = (value: Boolean) => {
  globalStore.setGlobalState('isDark', value);
  switchDark();
};
const handleAssetAsyncChange = (value: Boolean) => {
  treeStore.changeState(value);
  mittBus.emit('tree-load');
};

/* eslint-disable-next-line no-unused-vars */
const handlePageConfigurationChange = (value: string, option: CustomSelectOption) => {
  if (option.onClick) {
    option.onClick();
  }
};

watch(
  () => globalStore.language,
  newLang => {
    defaultWidth.value = newLang === 'en' ? 390 : 290;
  }
);

mittBus.on('open-setting-drawer', () => {
  showSettingDrawer.value = true;
});

onBeforeUnmount(() => {
  mittBus.off('open-setting-drawer');
});
</script>

<style scoped lang="scss">
.transition-drawer {
  opacity: 0;
  transition:
    width 0.7s ease-in-out,
    opacity 0.7s ease-in-out;
  &.n-drawer--show {
    opacity: 1;
  }
  .drawer-content {
    :deep(.n-drawer-body-content-wrapper) {
      .dark-setting,
      .asset-async,
      .page-setting,
      .language-setting {
        width: 100%;
      }
      .asset-async {
        margin-top: 15px;
      }
      .page-setting {
        flex-wrap: nowrap;
        margin-top: 15px;
        .n-select {
          width: 150px;
        }
      }
      .language-setting {
        flex-wrap: nowrap;
        .n-select {
          width: 150px;
        }
      }
    }
  }
}
</style>
