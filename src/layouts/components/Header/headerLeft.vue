<template>
  <div>
    <n-flex class="header-left">
      <logo :logo-image="logoImage!" />
      <n-space class="action-options">
        <action-options :options="options" />
      </n-space>
    </n-flex>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { onMounted, reactive, watchEffect } from 'vue';
import { useGlobalStore } from '@/stores/modules/global';
import { useTranslations } from '@/hooks/useTranslate';

import type { IActionOptions } from './types/index.ts';

import Logo from './components/Logo/index.vue';
import ActionOptions from './components/ActionOptions/index.vue';

const { t } = useI18n();
const globalStore = useGlobalStore();
const { updateTranslations } = useTranslations();

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
      },
      {
        key: 'Help',
        label: t('Help'),
        children: [
          {
            key: 'Document',
            click: () => {
              console.log('Document');
            },
            label: t('Document')
          },
          {
            key: 'Support',
            click: () => {
              console.log('Support');
            },
            label: t('Support')
          },
          {
            key: 'Download',
            click: () => {
              console.log('Download');
            },
            label: t('Download')
          }
        ]
      }
    ]
  );
};

watchEffect(() => {
  updateOptions();
});
</script>

<style scoped lang="scss"></style>
