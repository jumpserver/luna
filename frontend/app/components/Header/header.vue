<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';
import type { UnlistenFn } from '@tauri-apps/api/event';
import type { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import type {
  ActionItem,
  PermissionOrgs,
  PermOrgItem,
  UserIntiInfo,
} from '~/types/index';

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
const { theme, language, collapse } = storeToRefs(userSettingStore);
const {
  setUserLoggedIn,
  setUserData,
  setOrganizations,
  deleteUserData,
  setCurrentOrg,
} = userInfoStore;

const { loggedIn, currentOrganizations, currentSite } =
  storeToRefs(userInfoStore);

const inputSite = ref('');
const errorMessage = ref('');
const currentOrg = ref<string>('');
const openModal = ref(false);
const hasValidationError = ref(false);
const loginPage = ref<WebviewWindow | null>(null);
const subscribeLoginSuccessEvent = ref<UnlistenFn | null>(null);
const subscribeLoginFailedEvent = ref<UnlistenFn | null>(null);
const inputRef = ref<ComponentPublicInstance | null>(null);
const dropItems = ref<DropdownMenuItem[][]>([
  [
    {
      label: 'Profile',
      icon: 'i-lucide-user',
    },
    {
      label: t('Login.AddAccount'),
      icon: 'i-lucide-user-round-plus',
    },
  ],
  [
    {
      label: t('Login.SwitchAccount'),
      icon: 'i-lucide-arrow-down-up',
      children: [
        [
          {
            label: 'Email',
            icon: 'i-lucide-mail',
          },
          {
            label: 'Message',
            icon: 'i-lucide-message-square',
          },
        ],
      ],
    },
  ],
  [
    {
      label: 'Logout',
      icon: 'i-lucide-log-out',
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

        nextTick(() => {
          setLang(locale.code);
        });
      }
    },
  })) as DropdownMenuItem[];
});

const organizationItems = computed(
  () =>
    currentOrganizations.value.map(
      (org: PermOrgItem) => org.name
    ) as unknown as DropdownMenuItem[]
);

const computedSwitchMode = computed<ActionItem>(() => {
  return {
    key: 'switchMode',
    iconName: isDarkMode.value
      ? 'line-md:moon-alt-to-sunny-outline-loop-transition'
      : 'line-md:moon-alt-loop',
    tooltipLabel: isDarkMode.value
      ? t('ToolTips.LightMode')
      : t('ToolTips.DarkMode'),
    onClick: toggleDarkMode,
    type: 'action',
  };
});

/**
 * @description 切换颜色 mode
 */
function toggleDarkMode() {
  manualSetTheme(isDarkMode.value ? 'light' : 'dark');
}

/**
 * @description 切换语言
 * @param payload 语言代码
 */
function changeLocale(payload: LocaleCode) {
  setLocale(payload);

  nextTick(() => {
    setLang(payload);
  });
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
 * @description 打开登录窗口
 */
const openLoginPage = () => {
  openModal.value = true;
  hasValidationError.value = false;
  errorMessage.value = '';

  nextTick(() => {
    inputRef.value?.$el.querySelector('input')?.focus();
  });
};

/**
 * @description 确认登录
 */
const handleConfirm = () => {
  hasValidationError.value = false;
  errorMessage.value = '';

  if (!inputSite.value) {
    hasValidationError.value = true;
    errorMessage.value = t('Login.EmptyUrlError');

    nextTick(() => {
      inputRef.value?.$el?.querySelector('input')?.focus();
    });
    return;
  }

  if (!REG_EXP.test(inputSite.value)) {
    hasValidationError.value = true;
    errorMessage.value = t('Login.InvalidUrlError');

    nextTick(() => {
      inputRef.value?.$el?.querySelector('input')?.focus();
    });
    return;
  }

  loginPage.value = new useTauriWebviewWindowWebviewWindow('loginPage', {
    title: '',
    url: inputSite.value,
    width: 600,
    height: 800,
    minWidth: 600,
    minHeight: 800,
  });

  nextTick(async () => {
    await useTauriCoreInvoke('url_watcher', {
      name: 'loginPage',
      origin: inputSite.value,
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
  inputSite.value = value;
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

      if (status === 'success' && profileData) {
        toast.add({
          title: t('Login.LoginSuccess'),
          description: t('Login.LoginSuccessDescription'),
          color: 'success',
          icon: 'line-md:check-all',
        });

        const availableOrgs = initSelectOrganization(permissionOrgData);

        setUserData(inputSite.value, {
          name: profileData.name,
          headerJson: cookies,
          site: inputSite.value,
          org: currentOrgData,
          system_roles: profileData.system_roles,
          availableOrgs,
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
};

const unListenTauriEvent = () => {
  if (subscribeLoginSuccessEvent.value) {
    subscribeLoginSuccessEvent.value();
  }

  if (subscribeLoginFailedEvent.value) {
    subscribeLoginFailedEvent.value();
  }
};

onMounted(async () => {
  setLocale(language.value as LocaleCode);

  if (loggedIn.value && userInfoStore.currentUser) {
    currentOrg.value = userInfoStore.currentUser.org.name;
    // 确保 orgId 也被正确设置
    if (userInfoStore.currentUser.org?.id) {
      userInfoStore.orgId = userInfoStore.currentUser.org.id;
    }
  }

  await listenTauriEvent();
});

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
      <UDropdownMenu arrow size="sm" :items="supportLanguages">
        <UButton
          icon="i-lucide-globe"
          size="sm"
          color="neutral"
          variant="outline"
          class="rounded-lg"
        />
      </UDropdownMenu>

      <UButton
        :icon="computedSwitchMode.iconName"
        size="sm"
        color="neutral"
        variant="outline"
        class="rounded-lg"
        @click.prevent="computedSwitchMode.onClick"
      />

      <UDropdownMenu
        v-if="loggedIn"
        :items="dropItems"
        :ui="{
          content: 'w-48',
        }"
      >
        <UAvatar size="sm" src="/user_avatar.png" />
      </UDropdownMenu>

      <UButton
        v-else
        size="sm"
        variant="subtle"
        icon="line-md:log-in"
        @click="openLoginPage"
      >
        {{ t('Common.UnSigned') }}
      </UButton>
    </section>

    <Modal
      v-model:open="openModal"
      :title="t('Login.Title')"
      @update:open="openModal = $event"
      @confirm="handleConfirm"
      @clipboard="handleClipboard"
    >
      <div class="space-y-1">
        <UInput
          ref="inputRef"
          v-model="inputSite"
          :color="hasValidationError ? 'error' : 'primary'"
          :ui="{
            base: 'peer',
          }"
          placeholder=" "
          @input="clearValidationError"
        >
          <label
            class="pointer-events-none absolute left-0 -top-2.5 text-xs font-medium px-1.5 transition-all peer-focus:-top-2.5 peer-focus:text-xs peer-focus:font-medium peer-placeholder-shown:text-sm peer-placeholder-shown:top-1.5 peer-placeholder-shown:font-normal"
          >
            <span class="inline-flex bg-default px-1">
              {{ t('Login.Description') }}
            </span>
          </label>

          <template v-if="inputSite?.length" #trailing>
            <UButton
              color="neutral"
              variant="link"
              size="sm"
              icon="i-lucide-circle-x"
              aria-label="Clear input"
              @click="
                inputSite = '';
                clearValidationError();
              "
            />
          </template>
        </UInput>

        <div v-if="hasValidationError" class="text-red-500 text-xs px-1">
          {{ errorMessage }}
        </div>
      </div>
    </Modal>
  </div>
</template>
