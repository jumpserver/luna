<template>
  <n-flex justify="center" align="center" class="top-item">
    <logo :logo-image="logoImage!" />
    <n-flex justify="center" align="center">
      <n-button text>
        <svg-icon class="tree-icon" :name="icon.name" :icon-style="iconStyle" />
      </n-button>
    </n-flex>

    <n-space class="action-options">
      <!--      <action-options :options="options" />-->
    </n-space>
  </n-flex>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { type CSSProperties, onMounted, reactive, watchEffect } from 'vue';
import { useGlobalStore } from '@/stores/modules/global';
import { useTranslations } from '@/hooks/useTranslate';

import type { IActionOptions } from './types/index.ts';

import Logo from './components/Logo/index.vue';
// import ActionOptions from './components/ActionOptions/index.vue';
import SvgIcon from '@/components/SvgIcon/index.vue';
import Profile from '@/layouts/components/Header/components/Profile/index.vue';

const { t } = useI18n();
const globalStore = useGlobalStore();
const { updateTranslations } = useTranslations();

const iconStyle: CSSProperties = {
  fill: '#646A73',
  width: '25px',
  height: '25px',
  transition: 'fill 0.3s'
};

const icon = {
  iconStyle,
  name: 'tree',
  component: Profile
};

const logoImage = globalStore.interface.logo_logout;
const options = reactive<IActionOptions[]>([]);

onMounted(() => {
  updateOptions();
});

const updateOptions = () => {
  options.splice(
    0,
    options.length,
    ...[
      {
        key: 'FileManager',
        label: t('File Manager'),
        children: [
          {
            key: 'Connect',
            click: () => {
              console.log('Connect');
            },
            label: t('Connect')
          }
        ]
      },
      {
        key: 'View',
        label: t('View'),
        children: [
          {
            key: 'SplitVertical',
            href: '/',
            label: t('SplitVertical'),
            disable: true
          },
          {
            key: 'CommandBar',
            href: '/',
            label: t('CommandBar'),
            disable: true
          },
          {
            key: 'ShareSession',
            href: '/',
            label: t('ShareSession'),
            disable: true
          },
          {
            key: 'FullScreen',
            click: () => {
              console.log('FullScreen');
            },
            label: t('Full Screen')
          }
        ]
      },
      {
        key: 'Language',
        label: t('Language'),
        children: [
          {
            key: 'English',
            click: () => {
              globalStore.setLanguage('en');
              updateTranslations('en');
            },
            label: 'English'
          },
          {
            key: 'Chinese',
            click: () => {
              globalStore.setLanguage('zh');
              updateTranslations('zh');
            },
            label: '中文'
          },
          {
            key: 'Chinese-hant',
            click: () => {
              globalStore.setLanguage('zh-hant');
              updateTranslations('zh-hant');
            },
            label: '中文(繁體)'
          },
          {
            key: 'Japanese',
            click: () => {
              globalStore.setLanguage('ja');
              updateTranslations('ja');
            },
            label: '日本語'
          }
        ]
      },
      {
        key: 'Setting',
        label: t('Setting'),
        children: [
          {
            key: 'General',
            label: t('General'),
            click: () => {
              console.log('General');
            }
          },
          {
            key: 'GUI',
            label: t('GUI'),
            click: () => {
              console.log('GUI');
            }
          },
          {
            key: 'CLI',
            label: t('CLI'),
            click: () => {
              console.log('CLI');
            }
          }
        ]
      },
      {
        key: 'Tabs',
        label: t('Tabs'),
        children: []
      }
    ]
  );
};

watchEffect(() => {
  updateOptions();
});
</script>

<style scoped lang="scss">
.top-item {
  gap: 30px 12px !important;
  width: 100%;
  margin-top: 25px;
  cursor: pointer;
  :deep(.n-flex) {
    width: 100%;
    .tree-icon:hover {
      fill: var(--el-color-primary-light-1) !important;
    }
  }
}
</style>
