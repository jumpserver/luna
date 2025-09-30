<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';
import type { UnlistenFn } from '@tauri-apps/api/event';
import type { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import type {
  ActionItem,
  PermissionOrgs,
  PermOrgItem,
  UserData,
  UserIntiInfo,
} from '~/types/index';

import { LogicalPosition } from '@tauri-apps/api/dpi';
import { useUserInfoStore } from '~/store/modules/userInfo';
import { useUserSettingStore } from '~/store/modules/userSetting';

type LocaleCode = (typeof locales.value)[number]['code'];

const REG_EXP =
  /^(?:https?:\/\/(?:localhost|\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-fA-F:]+\]|(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,})(?::\d{1,5})?(?:[/?#]\S*)?|\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-fA-F:]+\])$/;

const { t, setLocale, locales } = useI18n();
const { manualSetTheme } = useThemeAdapter();
const toast = useToast();
const appConfig = useAppConfig();
const userInfoStore = useUserInfoStore();
const userSettingStore = useUserSettingStore();

const darkColor = appConfig.componentsConfig.header.darkColor;
const lightColor = appConfig.componentsConfig.header.lightColor;

const { setLang, setCollapse } = userSettingStore;
const { theme, language, collapse, layouts, sort } = storeToRefs(userSettingStore);

const {
  setUserLoggedIn,
  setUserData,
  setOrganizations,
  deleteUserData,
  setCurrentOrg,
} = userInfoStore;

const { loggedIn, currentOrganizations, currentSite, userMap, currentUser } =
  storeToRefs(userInfoStore);

const inputSite = ref('');
const errorMessage = ref('');
const currentOrg = ref<string>('');
const openModal = ref(false);
const hasValidationError = ref(false);
const loginPage = ref<WebviewWindow | null>(null);
const subscribeErrorPageEvent = ref<UnlistenFn | null>(null);
const subscribeLoginSuccessEvent = ref<UnlistenFn | null>(null);
const subscribeLoginFailedEvent = ref<UnlistenFn | null>(null);
const inputRef = ref<ComponentPublicInstance | null>(null);

useEventBus().on('login', openLoginPage);

const normalizedInputSite = computed(() => normalizeSite(inputSite.value));

const switchAccountChildren = computed<DropdownMenuItem[][]>(() => {
  const items: DropdownMenuItem[] = (
    Object.values(userMap.value || {}) as UserData[]
  ).map((u: UserData) => {
    let host = u.site;

    try {
      host = new URL(u.site).host;
    } catch {}

    const label = `${host}`;
    const isCurrent = u.site === currentSite.value;

    return {
      label,
      icon: isCurrent ? 'i-lucide-check' : 'i-lucide-user',
      onClick: () => handleSwitchAccount(u.site),
    } as DropdownMenuItem;
  });
  return [items];
});

const dropItems = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: currentUser.value?.name,
      avatar: {
        size: 'sm',
        text: currentUser.value?.name.slice(0, 2),
        chip: {
          inset: true,
        },
      },
      type: 'label',
    },
  ],
  [
    {
      label: t('Login.AddAccount'),
      icon: 'i-lucide-user-round-plus',
      onClick: openLoginPage,
    },
    {
      label: t('Login.SwitchSite'),
      icon: 'i-lucide-arrow-down-up',
      children: switchAccountChildren.value,
    },
  ],
  [
    {
      label: t('Login.Logout'),
      icon: 'solar:login-outline',
      color: 'error',
      onClick: clearAuthInfo,
    },
  ],
]);

const isDarkMode = computed(() => theme.value === 'dark');

const supportLanguages = computed(() => {
  return locales.value.map((locale: any) => ({
    label: locale.name,
    value: locale.code,
    type: 'checkbox' as const,
    checked: locale.code === language.value,
    onUpdateChecked: (checked: boolean) => {
      if (checked) {
        changeLocale(locale.code);
      }
    },
  })) as DropdownMenuItem[];
});

const organizationItems = computed(() =>
  currentOrganizations.value.map((org: PermOrgItem) => org.name)
);

const computedSwitchMode = computed<ActionItem>(() => {
  return {
    key: 'switchMode',
    iconName: isDarkMode.value
      ? 'i-lucide-rocket'
      : 'i-lucide-globe',
    tooltipLabel: isDarkMode.value
      ? t('ToolTips.LightMode')
      : t('ToolTips.DarkMode'),
    onClick: toggleDarkMode,
    type: 'action',
  };
});

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

watch(
  language,
  (lang) => {
    setLocale(lang as LocaleCode);
  },
  { immediate: true }
);

// watch(() => openModal.value, (open) => {
//   // 如果关闭,清空搜索框的内容
//   if (!open) {
//     inputSite.value = '';
//   }
// });

/**
 * @description 标准化站点输入：去除首尾空格 + 去除末尾斜杠
 * @param value
 */
function normalizeSite(value: string): string {
  const s = (value || '').trim();
  if (!s) return '';
  return s.replace(/\/+$/, '');
}

/**
 * @description 切换颜色 mode
 */
function toggleDarkMode() {
  manualSetTheme(isDarkMode.value ? 'light' : 'dark');
}

/**
 * @description 打开登录窗口
 */
function openLoginPage() {
  openModal.value = true;
  hasValidationError.value = false;
  errorMessage.value = '';

  nextTick(() => {
    inputRef.value?.$el.querySelector('input')?.focus();
  });
}

/**
 * @description 切换账户
 * @param site
 */
function handleSwitchAccount(site: string) {
  if (site === currentSite.value) return;

  userInfoStore.setCurrentSite(site);
  const nextOrg = userInfoStore.currentUser?.org?.name;

  if (nextOrg) currentOrg.value = nextOrg;
  nextTick(() => {
    useEventBus().emit('refresh', undefined);
  });
}

/**
 * @description 切换语言
 * @param payload 语言代码
 */
function changeLocale(payload: LocaleCode) {
  setLang(payload);
}

/**
 * @description 清除认证信息
 */
function clearAuthInfo() {
  deleteUserData(currentSite.value);
}

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
 * @description 确认登录
 */
const handleConfirm = () => {
  hasValidationError.value = false;
  errorMessage.value = '';

  const normalizedSite = normalizedInputSite.value;

  if (!normalizedSite) {
    hasValidationError.value = true;
    errorMessage.value = t('Login.EmptyUrlError');

    nextTick(() => {
      inputRef.value?.$el?.querySelector('input')?.focus();
    });
    return;
  }

  if (
    Object.values(userMap.value || {}).some(
      (user) => normalizeSite(user.site) === normalizedSite
    )
  ) {
    hasValidationError.value = true;
    errorMessage.value = t('Login.AlreadyLoggedInError');
    return;
  }

  if (!REG_EXP.test(normalizedSite)) {
    hasValidationError.value = true;
    errorMessage.value = t('Login.InvalidUrlError');

    nextTick(() => {
      inputRef.value?.$el?.querySelector('input')?.focus();
    });
    return;
  }

  loginPage.value = new useTauriWebviewWindowWebviewWindow('loginPage', {
    title: `${t('Common.LoginSite')} - ${normalizedSite}`,
    url: normalizedSite,
    width: 600,
    height: 800,
    minWidth: 600,
    minHeight: 800,
    hiddenTitle: true,
    titleBarStyle: 'overlay',
    trafficLightPosition: new LogicalPosition(10, 22),
  });

  nextTick(async () => {
    await useTauriCoreInvoke('url_watcher', {
      name: 'loginPage',
      origin: normalizedSite,
    });

    openModal.value = false;
  });
};

/**
 * @description 清除验证错误
 */
const clearValidationError = () => {
  if (hasValidationError.value) {
    hasValidationError.value = false;
    errorMessage.value = '';
  }
};

/**
 * @description 粘贴输入
 * @param value
 */
const handleClipboard = (value: string) => {
  inputSite.value = normalizeSite(value);
};

/**
 * @description 初始化可选组织
 * @param permissionOrgData
 * @returns 返回去重后的组织列表
 */
const initSelectOrganization = (permissionOrgData: PermissionOrgs) => {
  // permissionOrgData 中 pam_orgs, audit_orgs, console_orgs, workbench_orgs 都有可能存在,所以只需要获取他们的并集即可
  const orgs = [
    ...(permissionOrgData.pam_orgs || []),
    ...(permissionOrgData.audit_orgs || []),
    ...(permissionOrgData.console_orgs || []),
    ...(permissionOrgData.workbench_orgs || []),
  ];

  // 去除重复项
  const uniqueOrgs = orgs.filter(
    (org, index, self) => index === self.findIndex((t) => t.id === org.id)
  );

  return uniqueOrgs;
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
    setCurrentOrg(orgData);

    nextTick(() => {
      useEventBus().emit('refresh', undefined);
    });
  }
};

/**
 * @description 监听登录成功事件
 */
const listenTauriEvent = async () => {
  subscribeLoginSuccessEvent.value = await useTauriEventListen(
    'login-success-detected',
    (event) => {
      const { status, profile, permission_orgs, current_org, cookies } =
        event.payload as UserIntiInfo;

      const profileData = JSON.parse(profile.data);
      const permissionOrgData = JSON.parse(permission_orgs.data);
      const currentOrgData = JSON.parse(current_org.data);
      const normalizedSite = normalizedInputSite.value;

      if (status === 'success' && profileData) {
        toast.add({
          title: t('Login.LoginSuccess'),
          description: t('Login.LoginSuccessDescription'),
          color: 'success',
          icon: 'line-md:check-all',
        });

        const availableOrgs = initSelectOrganization(permissionOrgData);

        setUserData(normalizedSite, {
          name: profileData.name,
          headerJson: cookies,
          site: normalizedSite,
          org: currentOrgData,
          system_roles: profileData.system_roles,
          availableOrgs,
          connectionInfo: {
            protocol: '',
            username: '',
          },
        });

        currentOrg.value = currentOrgData.name;
        setOrganizations(availableOrgs);
        setUserLoggedIn(true);
      }
    }
  );

  subscribeLoginFailedEvent.value = await useTauriEventListen(
    'login-failed-detected',
    () => {
      toast.add({
        title: t('Login.LoginFailed'),
        description: t('Login.LoginFailedDescription'),
        color: 'error',
        icon: 'line-md:close-circle',
      });

      setUserLoggedIn(false);
    }
  );

  subscribeErrorPageEvent.value = await useTauriEventListen(
    'error-page',
    (event) => {
      const { status, reason } = event.payload as {
        status: string;
        reason: string;
      };

      if (status === 'failure' && reason === 'cookies-not-found') {
        toast.add({
          title: t('Login.LoginFailed'),
          description: t('Login.LoginFailedErrorPage'),
          color: 'error',
          icon: 'line-md:close-circle',
        });

        nextTick(() => {
          setUserLoggedIn(false);
        });
      }
    }
  );
};

const unListenTauriEvent = () => {
  if (subscribeLoginSuccessEvent.value) {
    subscribeLoginSuccessEvent.value();
  }

  if (subscribeLoginFailedEvent.value) {
    subscribeLoginFailedEvent.value();
  }

  if (subscribeErrorPageEvent.value) {
    subscribeErrorPageEvent.value();
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

  await listenTauriEvent();
});

watch(
  () => currentUser.value?.org?.name,
  (name: string | undefined) => {
    if (name) currentOrg.value = name;
  }
);

onBeforeUnmount(() => {
  unListenTauriEvent();
});
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
            color="white"
            class="rounded-lg hover:bg-[#e5e5e5] transition-colors duration-200"
            @click="action.onClick"
          />
        </template>

        <template v-else>
          <UDropdownMenu arrow :items="action.selectItems" size="sm">
            <UButton
              :icon="action.iconName"
              size="sm"
              color="white"
              variant="ghost"
              class="rounded-lg hover:bg-[#e5e5e5] transition-colors duration-200"
            />
          </UDropdownMenu>
        </template>
      </template>
    </section>
  </div>
</template>
