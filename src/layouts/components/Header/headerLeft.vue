<template>
  <n-flex class="header-left">
    <logo />
    <n-space class="action-options">
      <action-options :options="options" />
    </n-space>
  </n-flex>
</template>

<script setup lang="ts">
import type { IActionOptions } from './types/index.ts';

import Logo from './components/Logo/index.vue';
import ActionOptions from './components/ActionOptions/index.vue';

const options: IActionOptions[] = [
  {
    key: 'FileManager',
    label: 'File Manager',
    children: [
      {
        key: 'Connect',
        click: () => {
          // window.open('/koko/elfinder/sftp/');
        },
        label: 'Connect'
      }
    ]
  },
  {
    key: 'View',
    label: 'View',
    children: [
      // 此处直接使用空串的话，在渲染时会被 nif 判断为 false 从而只有禁用效果而不展示文字内容
      {
        key: 'SplitVertical',
        href: '/',
        label: 'SplitVertical',
        disable: true
      },
      {
        key: 'CommandBar',
        href: '/',
        label: 'CommandBar',
        disable: true
      },
      {
        key: 'ShareSession',
        href: '/',
        label: 'ShareSession',
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
        label: 'Full Screen'
      }
    ]
  },
  {
    key: 'Language',
    label: 'Language',
    children: [
      {
        key: 'English',
        click: () => {
          // this._i18n.use('en');
        },
        label: 'English'
      },
      {
        key: 'Chinese',
        click: () => {
          // this._i18n.use('zh');
        },
        label: '中文'
      },
      {
        key: 'Chinese-hant',
        click: () => {
          // this._i18n.use('zh-hant');
        },
        label: '中文(繁體)'
      },
      {
        key: 'Japanese',
        click: () => {
          // this._i18n.use('ja');
        },
        label: '日本語'
      }
    ]
  },
  {
    key: 'Setting',
    label: 'Setting',
    children: [
      {
        key: 'General',
        label: 'General',
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
        label: 'GUI',
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
        label: 'CLI',
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
    label: 'Tabs',
    children: []
  },
  {
    key: 'Help',
    label: 'Help',
    children: [
      {
        key: 'Document',
        click: () => {
          // this.HELP_DOCUMENT_URL = this._settingSvc.globalSetting.HELP_DOCUMENT_URL;
          // window.open(this.HELP_DOCUMENT_URL);
        },
        label: 'Document'
      },
      {
        key: 'Support',
        click: () => {
          // this.HELP_SUPPORT_URL = this._settingSvc.globalSetting.HELP_SUPPORT_URL;
          // window.open(this.HELP_SUPPORT_URL);
        },
        label: 'Support'
      },
      {
        key: 'Download',
        click: () => {
          // window.open('/core/download/', '_blank');
        },
        label: 'Download'
      }
    ]
  }
];
</script>

<style scoped lang="scss">
.header-left {
  .action-options {
    margin-left: 50px;
    :deep(div) {
      min-width: 50px;
      text-align: center;
      cursor: pointer;
    }
  }
}
</style>
