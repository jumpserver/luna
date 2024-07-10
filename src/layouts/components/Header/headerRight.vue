<template>
  <n-flex justify="center" align="center" class="bottom-item">
    <template v-for="option of bottomOptions" :key="option.key">
      <component
        :is="option.component"
        :name="option.name"
        :icon-style="option.iconStyle"
        :options="option.options"
      />
    </template>
  </n-flex>
</template>

<script setup lang="ts">
import { unref } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { useGlobalStore } from '@/stores/modules/global.ts';

import Help from './components/Help/index.vue';
import Profile from './components/Profile/index.vue';
import Setting from './components/Setting/index.vue';

import type { CSSProperties } from 'vue';
import type { HeaderRightOptions } from './types/index';

const { t } = useI18n();
const globalStore = useGlobalStore();

const { HELP_SUPPORT_URL, HELP_DOCUMENT_URL } = storeToRefs(globalStore);

const iconStyle: CSSProperties = {
  fill: '#fff',
  width: '25px',
  height: '25px',
  transition: 'fill 0.3s'
};

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
    options: []
  },
  {
    iconStyle,
    name: 'setting',
    component: Setting,
    options: []
  }
];
</script>

<style scoped lang="scss">
// todo)) 换成主题色
.bottom-item {
  width: 100%;
  margin-bottom: 15px;
  cursor: pointer;
  svg:hover {
    fill: #000000 !important;
  }
}
</style>
