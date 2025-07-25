<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import mittBus from '@renderer/eventBus';
import { useColor } from '@renderer/hooks/useColor';
import { getIconImage } from '@renderer/utils/common';
import { computed, nextTick, onMounted, ref } from 'vue';
import { useUserStore } from '@renderer/store/module/userStore';
import { ArrowDownWideNarrow, Globe, RefreshCcw, Search } from 'lucide-vue-next';

const { t } = useI18n();
const { lighten } = useColor();
const userStore = useUserStore();

const searchInput = ref('');
const iconImage = ref<string>('');

const organizationList = computed(() => {
  return userStore.organization?.map(item => ({
    label: item.name,
    value: item.id
  }));
});
const currentOrganization = computed(() => {
  return userStore.currentOrganization;
});

// const handleMouseEnter = () => {
//   window.electron.ipcRenderer.send('show-controls');
// };

// const handleMouseLeave = () => {
//   window.electron.ipcRenderer.send('hide-controls');
// };

/**
 * @description 搜索
 * @param event
 */
const onKeyEnter = (event: KeyboardEvent) => {
  if (!event.shiftKey || event.ctrlKey) {
    event.preventDefault();
    mittBus.emit('search', searchInput.value);
  }
}

const handleSearch = () => {
  mittBus.emit('search', searchInput.value);
};

/**
 * @description 切换组织
 * @param value
 */
const handleChangeOrganization = (value: string) => {
  userStore.setCurrentOrganization(value);

  nextTick(() => {
    mittBus.emit('search', '');
  });
};

onMounted(async () => {
  try {
    const image = await getIconImage();

    if (image) {
      iconImage.value = image;
    }
  } catch (e) {
    console.error(e);
  }
});
</script>

<template>
  <n-flex justify="space-between" class="h-12 px-4" :style="{ backgroundColor: lighten(10) }">
    <n-flex align="center">
      <!-- <n-text depth="1" class="text-sm tracking-wider cursor-pointer ml-14">
        JumpServer Client
      </n-text> -->
      <!-- <n-flex align="center" @mouseenter="handleMouseEnter" @mouseleave="handleMouseLeave"> -->
      <!-- <n-image :src="iconImage" class="w-8 h-8" preview-disabled /> -->
      <!-- <n-text depth="1" class="text-sm tracking-wider cursor-pointer"> JumpServer Client </n-text> -->
      <!-- </n-flex> -->

      <!-- 选择组织 -->
      <n-select
        v-model:value="currentOrganization"
        size="small"
        :options="organizationList"
        :style="{ width: '12rem', marginLeft: '14rem' }"
        @update:value="handleChangeOrganization"
      />
    </n-flex>

    <n-flex align="center" :wrap="false" class="mr-4">
      <n-input
        clearable
        v-model:value="searchInput"
        size="small"
        :placeholder="t('Common.SearchPlaceholder')"
        :style="{ width: '18rem' }"
        @keypress.enter="onKeyEnter"
      >
        <template #prefix>
          <Search :size="16" />
        </template>
      </n-input>

      <n-button secondary round size="small">
        <template #icon>
          <RefreshCcw :size="16" />
        </template>
      </n-button>

      <n-button secondary round size="small">
        <template #icon>
          <ArrowDownWideNarrow :size="16" />
        </template>
      </n-button>

      <n-switch :round="false" size="large" />

      <n-button secondary round size="small">
        <template #icon>
          <Globe :size="16" />
        </template>
      </n-button>
    </n-flex>
  </n-flex>
</template>
