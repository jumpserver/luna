<template>
  <n-flex justify="center" align="center" class="bottom-item">
    <template v-for="option of bottomOptions" :key="option.key">
      <component
        :name="option.name"
        :is="option.component"
        :options="option.options"
        :icon-style="option.iconStyle"
        :on-click="option.onClick"
      />
    </template>
  </n-flex>
</template>

<script setup lang="ts">
import { unref, h } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { useGlobalStore } from '@/stores/modules/global.ts';
import { NAvatar, NText } from 'naive-ui';

import mittBus from '@/utils/mittBus.ts';

import Help from './components/Help/index.vue';
import Profile from './components/Profile/index.vue';
import Setting from './components/Setting/index.vue';

import type { CSSProperties } from 'vue';
import type { HeaderRightOptions } from './types/index';

const { t } = useI18n();
const globalStore = useGlobalStore();

const { HELP_SUPPORT_URL, HELP_DOCUMENT_URL } = storeToRefs(globalStore);

const iconStyle: CSSProperties = {
  fill: '#646A73',
  width: '25px',
  height: '25px',
  transition: 'fill 0.3s'
};

function renderCustomHeader() {
  return h(
    'div',
    {
      style: 'display: flex; align-items: center; padding: 8px 12px;'
    },
    [
      h(NAvatar, {
        round: true,
        style: 'margin-right: 12px;',
        src: 'https://07akioni.oss-cn-beijing.aliyuncs.com/demo1.JPG'
      }),
      h('div', null, [
        h('div', null, [h(NText, { depth: 2 }, { default: () => '打工仔' })]),
        h('div', { style: 'font-size: 12px;' }, [
          h(NText, { depth: 3 }, { default: () => '毫无疑问，你是办公室里最亮的星' })
        ])
      ])
    ]
  );
}

const bottomOptions: HeaderRightOptions[] = [
  {
    iconStyle,
    name: 'help',
    component: Help,
    options: [
      {
        key: 'Document',
        label: t('Document'),
        onClink: () => {
          window.open(unref(HELP_DOCUMENT_URL));
        }
      },
      {
        key: 'Support',
        label: t('Support'),
        onClink: () => {
          window.open(unref(HELP_SUPPORT_URL));
        }
      },
      {
        key: 'Download',
        label: t('Download'),
        onClink: () => {
          window.open('/core/download/', '_blank');
        }
      }
    ]
  },
  {
    iconStyle,
    name: 'user',
    component: Profile,
    options: [
      {
        key: 'header',
        type: 'render',
        render: renderCustomHeader
      },
      {
        key: 'header-divider',
        type: 'divider'
      },
      {
        label: '处理群消息 342 条',
        key: 'stmt1'
      },
      {
        label: '被 @ 58 次',
        key: 'stmt2'
      },
      {
        label: '加入群 17 个',
        key: 'stmt3'
      }
    ]
  },
  {
    iconStyle,
    name: 'setting',
    component: Setting,
    onClick: () => {
      mittBus.emit('open-setting-drawer');
    }
  }
];
</script>

<style scoped lang="scss">
.bottom-item {
  gap: 15px 12px !important;
  width: 100%;
  margin-bottom: 15px;
  cursor: pointer;
  :deep(svg:hover) {
    fill: var(--el-color-primary-light-1) !important;
  }
}
</style>
