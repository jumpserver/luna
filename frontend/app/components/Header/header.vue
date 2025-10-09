<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';
import type { ActionItem, PermOrgItem } from '~/types/index';

import { LogicalPosition } from '@tauri-apps/api/dpi';
import { useUserInfoStore } from '~/store/modules/userInfo';
import { useUserSettingStore } from '~/store/modules/userSetting';

const { t } = useI18n();
const appConfig = useAppConfig();
const userInfoStore = useUserInfoStore();
const userSettingStore = useUserSettingStore();

const darkColor = appConfig.componentsConfig.header.darkColor;
const lightColor = appConfig.componentsConfig.header.lightColor;

const { setCollapse } = userSettingStore;
const { theme, collapse, layouts, sort } = storeToRefs(userSettingStore);
// prettier-ignore
const { loggedIn, currentOrganizations, currentUser } = storeToRefs(userInfoStore);

const currentOrg = ref<string>('');
const organizationItems = computed(() =>
  currentOrganizations.value.map((org: PermOrgItem) => org.name)
);

// 从 Operation 组件移动过来的按钮操作逻辑
const actionItems = computed<ActionItem[]>(() => [
  {
    key: 'refresh',
    type: 'action',
    iconName: 'i-lucide-refresh-ccw',
    tooltipLabel: t('ToolTips.Refresh'),
    onClick: () => {
      useEventBus().emit('refresh', undefined);
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

/**
 * @description 切换折叠状态
 */
const handleCollapse = () => {
  setCollapse(!collapse.value);
};

/**
 * @description 窗口拖拽
 * @param event 鼠标事件
 */
const handleWindowDrag = async (event: MouseEvent) => {
  if (event.button !== 0) return;

  try {
    const windows = await useTauriWindowGetAllWindows();
    windows.forEach((window) => {
      window.startDragging();
    });
  } catch (error) {
    console.error(error);
  }
};

/**
 * @description 切换组织
 * @param org
 */
const handleOrgChange = (org: string) => {
  const orgData = currentOrganizations.value.find(
    (o: PermOrgItem) => o.name === org
  );

  if (orgData) {
    userInfoStore.setCurrentOrg(orgData);

    nextTick(() => {
      useEventBus().emit('refresh', undefined);
    });
  }
};

onMounted(async () => {
  if (loggedIn.value && userInfoStore.currentUser) {
    currentOrg.value = userInfoStore.currentUser.org.name;
    // 确保 orgId 也被正确设置
    if (userInfoStore.currentUser.org?.id) {
      userInfoStore.orgId = userInfoStore.currentUser.org.id;
    }
  }
});

watch(
  () => currentUser.value?.org?.name,
  (name: string | undefined) => {
    if (name) currentOrg.value = name;
  }
);
</script>

<template>
  <div
    :style="{
      backgroundColor: theme === 'dark' ? darkColor : lightColor,
    }"
    class="flex items-center justify-between px-4 h-12 cursor-pointer"
    @mousedown="handleWindowDrag"
  >
    <section class="flex items-center h-full">
      <UIcon
        v-show="collapse"
        name="i-lucide-panel-left-open"
        class="size-5 cursor-pointer hover:text-[#55B787]"
        @click="handleCollapse"
      />

      <div v-show="loggedIn">
        <USelect
          v-model="currentOrg"
          :items="organizationItems"
          :style="{
            marginLeft: collapse ? '0.625rem' : '',
          }"
          :ui="{
            trailingIcon:
              'group-data-[state=open]:rotate-180 transition-transform duration-200',
          }"
          variant="subtle"
          size="md"
          class="w-56"
          icon="fluent:organization-16-regular"
          @update:model-value="handleOrgChange"
        />
      </div>
    </section>

    <section class="flex items-center h-full gap-3 mr-2">
      <template v-for="action of actionItems" :key="action.iconName">
        <template v-if="action.type === 'action'">
          <UButton
            :icon="action.iconName"
            size="sm"
            color="neutral"
            variant="subtle"
            class="rounded-lg"
            @click="action.onClick"
          />
        </template>

        <!-- #e5e5e5 -->

        <template v-else>
          <UDropdownMenu arrow :items="action.selectItems" size="sm">
            <UButton
              :icon="action.iconName"
              size="sm"
              color="neutral"
              variant="subtle"
              class="rounded-lg"
            />
          </UDropdownMenu>
        </template>
      </template>
    </section>
  </div>
</template>
