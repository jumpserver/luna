<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Search } from 'lucide-vue-next';
import mittBus from '@renderer/eventBus';
import { computed, nextTick, ref } from 'vue';
import { useUserStore } from '@renderer/store/module/userStore';

import { RightIconZone } from './helper/renderer';

defineProps<{
  active: boolean;
}>();

const { t } = useI18n();
const userStore = useUserStore();

const searchInput = ref('');

const organizationList = computed(() => {
  return userStore.organization?.map(item => ({
    label: item.name,
    value: item.id,
  }));
});

const handleChangeOrganization = (value: string) => {
  userStore.setCurrentOrganization(value);

  nextTick(() => {
    mittBus.emit('search', '');
  });
};

/**
 * @description 搜索
 */
const handleSearch = () => {
  mittBus.emit('search', searchInput.value);
};

const onKeyEnter = (event: KeyboardEvent) => {
  if (!event.shiftKey || event.ctrlKey) {
    event.preventDefault();
    mittBus.emit('search', searchInput.value);
  }
};
</script>

<template>
  <n-grid
    :cols="3"
    x-gap="12"
    class="px-[1.6rem] py-[1.6rem] border-b-2 border-primary bg-primary"
    :class="active ? 'show-drawer' : ''"
  >
    <n-grid-item :span="2">
      <n-input-group size="small">
        <n-input
          v-model:value="searchInput"
          size="small"
          clearable
          :placeholder="t('Common.SearchPlaceholder')"
          @keypress.enter="onKeyEnter"
        />
        <n-button secondary type="primary" size="small" @click="handleSearch">
          <template #icon>
            <Search :size="16" />
          </template>
          {{ t('Common.Search') }}
        </n-button>
      </n-input-group>
    </n-grid-item>

    <n-grid-item :span="1">
      <n-flex class="h-full !flex-nowrap" justify="space-around" align="center">
        <n-select
          v-model:value="userStore.currentOrganization"
          size="small"
          class="w-1/2 !rounded-md"
          :options="organizationList"
          @update:value="handleChangeOrganization"
        />

        <RightIconZone />
      </n-flex>
    </n-grid-item>
  </n-grid>
</template>

<style scoped lang="scss">
@use './index.scss';

::v-deep(.n-popselect-menu .n-base-select-option) {
  padding: 0 1rem !important;
}
</style>
