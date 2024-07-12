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
import { NAvatar, NText } from 'naive-ui';
import { useUserStore } from '@/stores/modules/user.ts';
import { useGlobalStore } from '@/stores/modules/global.ts';

import mittBus from '@/utils/mittBus.ts';

import Help from './components/Help/index.vue';
import Profile from './components/Profile/index.vue';
import Setting from './components/Setting/index.vue';

import type { CSSProperties } from 'vue';
import type { HeaderRightOptions } from './types/index';

const { t } = useI18n();
const userStore = useUserStore();
const globalStore = useGlobalStore();

const { name, avatar_url, email, source } = storeToRefs(userStore);
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
        src: avatar_url.value
      }),
      h('div', null, [
        h('div', null, [h(NText, { depth: 2 }, { default: () => name.value })]),
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
        label: `${t('Source')}: ${source.value}`,
        key: 'source'
      },
      {
        label: `${t('Email')}: ${email.value}`,
        key: 'email'
      },
      {
        label: t('Logout'),
        key: 'logout',
        onClink: () => {
          window.location.href = document.location.origin + '/core/auth/logout/';
        }
      }
    ]
  },
  {
    iconStyle,
    name: 'setting',
    component: Setting,
    onClick: () => {
      console.log(1);
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
