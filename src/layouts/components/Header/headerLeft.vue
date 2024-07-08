<template>
  <div v-if="isLoaded">
    <n-flex class="header-left">
      <logo />
      <n-space class="action-options">
        <action-options :options="options" />
      </n-space>
    </n-flex>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { ref, onMounted, reactive, watchEffect } from 'vue';

import { useUserStore } from '@/stores/modules/user.ts';
import { useTranslations } from '@/hooks/useTranslate';

import Logo from './components/Logo/index.vue';
import ActionOptions from './components/ActionOptions/index.vue';

import type { IActionOptions } from './types/index.ts';

// 创建加载状态变量
const isLoaded = ref(false);
const options = reactive<IActionOptions[]>([]);

const userStore = useUserStore();
const { t } = useI18n();
const { updateTranslations } = useTranslations();

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
              // window.open('/koko/elfinder/sftp/');
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
              // const ele: any = document.getElementsByClassName('window active')[0];
              // if (!ele) {
              //   return;
              // }
              // if (ele.requestFullscreen) {
              //   ele.requestFullscreen();
              // } else if (ele.mozRequestFullScreen) {
              //   ele.mozRequestFullScreen();
              // } else if (ele.msRequestFullscreen) {
              //   ele.msRequestFullscreen();
              // } else if (ele.webkitRequestFullscreen) {
              //   ele.webkitRequestFullScreen();
              // } else {
              //   throw new Error('不支持全屏api');
              // }
              // window.dispatchEvent(new Event('resize'));
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
              userStore.setLanguage('en');
              updateTranslations('en');
            },
            label: 'English'
          },
          {
            key: 'Chinese',
            click: () => {
              userStore.setLanguage('zh');
              updateTranslations('zh');
            },
            label: '中文'
          },
          {
            key: 'Chinese-hant',
            click: () => {
              userStore.setLanguage('zh-hant');
              updateTranslations('zh-hant');
            },
            label: '中文(繁體)'
          },
          {
            key: 'Japanese',
            click: () => {
              userStore.setLanguage('ja');
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
              // this._dialog.open(
              // 	ElementSettingComponent,
              // 	{
              // 		height: 'auto',
              // 		width: '500px',
              // 		data: {type: 'general', label: 'General'}
              // 	});
            }
          },
          {
            key: 'GUI',
            label: t('GUI'),
            click: () => {
              // this._dialog.open(ElementSettingComponent, {
              //   height: 'auto',
              //   width: '500px',
              //   data: { type: 'gui', label: 'GUI' }
              // });
            }
          },
          {
            key: 'CLI',
            label: t('CLI'),
            click: () => {
              // this._dialog.open(ElementSettingComponent, {
              //   height: 'auto',
              //   width: '500px',
              //   data: { type: 'cli', label: 'GUI' }
              // });
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
              // this.HELP_DOCUMENT_URL = this._settingSvc.globalSetting.HELP_DOCUMENT_URL;
              // window.open(this.HELP_DOCUMENT_URL);
            },
            label: t('Document')
          },
          {
            key: 'Support',
            click: () => {
              // this.HELP_SUPPORT_URL = this._settingSvc.globalSetting.HELP_SUPPORT_URL;
              // window.open(this.HELP_SUPPORT_URL);
            },
            label: t('Support')
          },
          {
            key: 'Download',
            click: () => {
              // window.open('/core/download/', '_blank');
            },
            label: t('Download')
          }
        ]
      }
    ]
  );
};

// 在翻译数据加载完成后调用 updateOptions 并设置 isLoaded
onMounted(async () => {
  await updateTranslations(userStore.language);
  updateOptions();
  isLoaded.value = true;
});

// 监听语言变化并更新选项
watchEffect(() => {
  updateOptions();
});
</script>

<style scoped lang="scss">
.header-left {
  .action-options {
    margin-left: 50px;
  }
}
</style>
