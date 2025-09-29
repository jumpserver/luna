<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';
import type { ActionItem } from '~/types';
import { LogicalPosition } from '@tauri-apps/api/dpi';
import { useDebounceFn } from '@vueuse/core';
import { useUserSettingStore } from '~/store/modules/userSetting';

const { t } = useI18n();
const { emit } = useEventBus();
const userSettingStore = useUserSettingStore();

const { componentsConfig } = useAppConfig();
const { layouts, sort, theme } = storeToRefs(userSettingStore);

const darkColor = componentsConfig.operation.darkColor;
const lightColor = componentsConfig.operation.lightColor;

const inputValue = ref('');

const actionItems = computed<ActionItem[]>(() => [
  {
    key: 'refresh',
    type: 'action',
    iconName: 'i-lucide-refresh-ccw',
    tooltipLabel: t('ToolTips.Refresh'),
    onClick: () => {
      emit('refresh', undefined);
    },
  },
  {
    key: 'sort',
    type: 'select',
    iconName: 'i-lucide-arrow-down-wide-narrow',
    tooltipLabel: t('ToolTips.Sort'),
    selectItems: [
      {
        icon: 'i-lucide-arrow-down-a-z',
        label: t('Sort.A-z'),
        value: 'name',
        type: 'checkbox' as const,
        checked: sort.value === 'name',
        onUpdateChecked: (checked: boolean) => {
          if (checked) {
            userSettingStore.setSort('name');
          }
        },
      },
      {
        icon: 'i-lucide-arrow-up-z-a',
        label: t('Sort.Z-A'),
        value: '-name',
        type: 'checkbox' as const,
        checked: sort.value === '-name',
        onUpdateChecked: (checked: boolean) => {
          if (checked) {
            userSettingStore.setSort('-name');
          }
        },
      },
      {
        type: 'separator' as const,
      },
      {
        icon: 'i-lucide-calendar-arrow-down',
        label: t('Sort.NewestToOldest'),
        value: '-date_updated',
        type: 'checkbox' as const,
        checked: sort.value === '-date_updated',
        onUpdateChecked: (checked: boolean) => {
          if (checked) {
            userSettingStore.setSort('-date_updated');
          }
        },
      },
      {
        icon: 'i-lucide-calendar-arrow-up',
        label: t('Sort.OldestToNewest'),
        value: 'date_updated',
        type: 'checkbox' as const,
        checked: sort.value === 'date_updated',
        onUpdateChecked: (checked: boolean) => {
          if (checked) {
            userSettingStore.setSort('date_updated');
          }
        },
      },
    ] as DropdownMenuItem[],
  },
  {
    key: 'layout',
    type: 'select',
    iconName: 'i-lucide-layout-grid',
    tooltipLabel: t('ToolTips.Layout'),
    selectItems: [
      {
        icon: 'i-lucide-grid-2x2',
        label: t('Layout.Grid'),
        value: 'grid',
        type: 'checkbox' as const,
        checked: layouts.value === 'grid',
        onUpdateChecked: (checked: boolean) => {
          if (checked) {
            userSettingStore.setLayouts('grid');
          }
        },
      },
      {
        icon: 'i-lucide-table-of-contents',
        label: t('Layout.Table'),
        value: 'table',
        type: 'checkbox' as const,
        checked: layouts.value === 'table',
        onUpdateChecked: (checked: boolean) => {
          if (checked) {
            userSettingStore.setLayouts('table');
          }
        },
      },
    ] as DropdownMenuItem[],
  },
  {
    key: 'settings',
    type: 'action',
    iconName: 'i-lucide-settings',
    tooltipLabel: t('ToolTips.Settings'),
    onClick: () => {
      // eslint-disable-next-line no-new
      new useTauriWebviewWindowWebviewWindow('secondary', {
        title: t('Common.ConnectionSettings'),
        url: '/setting',
        minWidth: 760,
        minHeight: 520,
        hiddenTitle: true,
        titleBarStyle: 'overlay',
        trafficLightPosition: new LogicalPosition(10, 22),
      });
    },
  },
]);

const handleSearch = (value: string) => {
  useEventBus().emit('search', value);
};

const useDebouncedSearch = useDebounceFn(handleSearch, 200);
</script>

<template>
  <div
    class="flex w-full items-center px-4 h-12"
    :style="{
      backgroundColor: theme === 'dark' ? darkColor : lightColor,
    }"
  >
    <section
      class="flex items-center justify-between flex-nowrap gap-3 h-7 mr-2 w-full"
    >
      <UInput
        v-model="inputValue"
        clearable
        icon="i-lucide-search"
        variant="outline"
        :placeholder="t('Operation.Search')"
        :style="{ width: '18rem', borderRadius: '8px' }"
        @update:model-value="useDebouncedSearch"
      >
        <template v-if="inputValue?.length" #trailing>
          <UButton
            color="neutral"
            variant="link"
            size="sm"
            icon="i-lucide-circle-x"
            aria-label="Clear input"
            @click="
              () => {
                inputValue = '';
                handleSearch('');
              }
            "
          />
        </template>
      </UInput>

      <div class="flex-1 flex items-center gap-3">
        <template v-for="action of actionItems" :key="action.iconName">
          <template v-if="action.type === 'action'">
            <UButton
              :icon="action.iconName"
              size="sm"
              color="neutral"
              variant="outline"
              class="rounded-lg"
              @click="action.onClick"
            />
          </template>

          <template v-else>
            <UDropdownMenu arrow :items="action.selectItems" size="sm">
              <UButton
                :icon="action.iconName"
                size="sm"
                color="neutral"
                variant="outline"
                class="rounded-lg"
              />
            </UDropdownMenu>
          </template>
        </template>
      </div>
    </section>
  </div>
</template>
